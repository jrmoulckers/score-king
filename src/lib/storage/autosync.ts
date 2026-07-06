import { get, writable } from 'svelte/store';
import { settings, markSynced, getBackupSettings, setActiveBackupEtag } from '../stores/settings';
import { dataVersion } from './changes';
import { buildSnapshot, getOneDrive, reconcile, pullMerge, ConflictError, InteractionRequiredError } from './sync';
import type { SyncProvider } from './sync';
import { refreshPlayers } from '../stores/players';
import { refreshGames } from '../stores/games';

export type AutoSyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'pending'
  | 'offline'
  | 'conflict'
  | 'error';

/** Live status for the Settings indicator. */
export const autoSyncStatus = writable<AutoSyncStatus>('idle');

/** Debounce window: coalesce a burst of edits into a single upload. */
const DEBOUNCE_MS = 2500;

/** Minimum gap between foreground catch-up pulls, so rapid focus/online events don't thrash. */
const CATCHUP_MIN_GAP_MS = 3000;

let started = false;
let dirty = false; // local changes awaiting upload
let pushing = false; // an upload is in flight
let conflicted = false; // remote diverged — hold auto-pushes until the user resolves
let timer: ReturnType<typeof setTimeout> | undefined;
let lastVersion = 0;
let wasActive = false;
let lastPortableSig: string | undefined; // JSON of the last-seen portable settings
let lastCatchUp = 0; // last foreground pull time, to throttle focus/online bursts

function enabled(): boolean {
  return get(settings).autoSync;
}

/** The user has connected OneDrive at least once (and not disconnected). */
function connected(): boolean {
  return get(settings).oneDriveConnected;
}

/** Auto-sync should actually run: enabled by the user AND OneDrive is connected. */
function active(): boolean {
  return enabled() && connected();
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function cancelTimer(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
}

function schedule(): void {
  cancelTimer();
  timer = setTimeout(() => {
    timer = undefined;
    void run();
  }, DEBOUNCE_MS);
}

function onLocalChange(): void {
  dirty = true;
  // While a conflict is unresolved we keep recording edits locally but never schedule a
  // push — the user must pick a side first (which clears `conflicted`).
  if (!active() || conflicted) return;
  if (!isOnline()) {
    autoSyncStatus.set('offline');
    return;
  }
  schedule();
}

async function run(): Promise<void> {
  cancelTimer();
  // `active()` gates loading the (heavy) OneDrive provider: a user who never
  // connected never pulls MSAL in just to back up.
  if (pushing || !dirty || !active() || conflicted) return;
  if (!isOnline()) {
    autoSyncStatus.set('offline');
    return;
  }

  let od: SyncProvider;
  try {
    od = await getOneDrive();
  } catch {
    return; // provider failed to load — nothing we can do in the background
  }
  if (!od.isConfigured()) return;

  // Reuse the provider's cached session; never start an interactive sign-in here.
  try {
    await od.prepare();
  } catch {
    /* fall through to the signed-in check below */
  }
  if (!od.isSignedIn()) {
    autoSyncStatus.set('pending');
    return;
  }

  pushing = true;
  dirty = false; // claim current changes; edits during upload re-set this
  autoSyncStatus.set('syncing');
  try {
    const { etag } = await od.push(await buildSnapshot(), {
      interactive: false,
      baseEtag: get(settings).oneDriveBackupEtag || null,
    });
    markSynced(Date.now());
    setActiveBackupEtag(etag); // remember the new version for the next conditional write
    if (dirty) {
      schedule(); // more edits arrived mid-upload
    } else {
      autoSyncStatus.set('synced');
    }
  } catch (e) {
    dirty = true; // keep the changes pending
    if (e instanceof ConflictError) {
      // The remote backup changed under us (another device). Instead of stopping to
      // ask the user to pick a side, merge per-entity (union by id, newest wins) and
      // push the result — a background reconcile that loses no untouched records.
      await mergeRemote(od);
    } else if (e instanceof InteractionRequiredError) {
      // Silent token failed — must NOT redirect in the background. Wait for the
      // user to reconnect, or for the next data change / online event.
      autoSyncStatus.set('pending');
    } else {
      autoSyncStatus.set('error');
      schedule(); // transient (e.g. network) — retry later
    }
  } finally {
    pushing = false;
  }
}

/**
 * Resolve a background push conflict by merging rather than choosing a side. Pull the
 * remote World, union it with ours per entity, persist + push the merge, then refresh
 * the open stores so any records that arrived from the other device appear immediately.
 * Only if the merge itself can't settle (or needs sign-in) do we fall back to a held
 * conflict / pending state for the user to handle from Settings.
 */
async function mergeRemote(od: SyncProvider): Promise<void> {
  dirty = false; // fold the current edits into this merge; edits during it re-set dirty
  try {
    const { etag } = await reconcile(od, { interactive: false });
    await Promise.all([refreshPlayers(), refreshGames()]);
    markSynced(Date.now());
    setActiveBackupEtag(etag);
    conflicted = false;
    if (dirty) {
      schedule(); // more edits arrived while merging
    } else {
      autoSyncStatus.set('synced');
    }
  } catch (e) {
    dirty = true;
    if (e instanceof InteractionRequiredError) {
      autoSyncStatus.set('pending');
    } else if (e instanceof ConflictError) {
      // The remote kept moving and we couldn't win the conditional push after several
      // tries — hand off to a manual resolve so we never spin or clobber.
      conflicted = true;
      autoSyncStatus.set('conflict');
    } else {
      autoSyncStatus.set('error');
      schedule(); // transient (e.g. network) — retry later
    }
  }
}

/**
 * Foreground catch-up — the *read* side of sync. Unlike {@link run} (which only fires when this
 * device has local edits to push), this pulls the remote World and merges it in even with no
 * pending changes, so a passive device converges to other devices' edits on
 * focus/visibility/online/connect. Never starts an interactive sign-in; a pure catch-up doesn't
 * write back (see {@link pullMerge}), so two idle devices don't ping-pong.
 */
async function catchUp(): Promise<void> {
  if (pushing || !active() || conflicted) return;
  const now = Date.now();
  if (now - lastCatchUp < CATCHUP_MIN_GAP_MS) return; // throttle focus/online bursts
  lastCatchUp = now;
  if (!isOnline()) {
    autoSyncStatus.set('offline');
    return;
  }

  let od: SyncProvider;
  try {
    od = await getOneDrive();
  } catch {
    return; // provider failed to load — nothing we can do in the background
  }
  if (!od.isConfigured()) return;

  // Reuse the provider's cached session; never start an interactive sign-in here.
  try {
    await od.prepare();
  } catch {
    /* fall through to the signed-in check below */
  }
  if (!od.isSignedIn()) {
    autoSyncStatus.set('pending');
    return;
  }

  pushing = true;
  autoSyncStatus.set('syncing');
  try {
    const res = await pullMerge(od, { interactive: false });
    if (res) {
      setActiveBackupEtag(res.etag); // track the version we're now aligned to
      if (res.changedLocal) await Promise.all([refreshPlayers(), refreshGames()]);
      markSynced(Date.now());
    }
    if (dirty) {
      schedule(); // edits arrived during catch-up — push them next
    } else if (res) {
      autoSyncStatus.set('synced');
    } else {
      autoSyncStatus.set('idle'); // connected but nothing backed up yet
    }
  } catch (e) {
    if (e instanceof ConflictError) {
      // The remote kept moving and we couldn't win the conditional push — hand off to a
      // manual resolve so we never spin or clobber.
      conflicted = true;
      autoSyncStatus.set('conflict');
    } else if (e instanceof InteractionRequiredError) {
      autoSyncStatus.set('pending');
    } else {
      autoSyncStatus.set('error');
    }
  } finally {
    pushing = false;
  }
}

function onOnline(): void {
  // Reconnected — pull others' changes; catchUp also re-pushes our own pending edits.
  if (active()) void catchUp();
}

function onVisibility(): void {
  if (document.visibilityState === 'hidden') {
    // Best-effort flush when the tab is backgrounded, so a pending edit isn't stranded
    // if the user navigates away before the debounce fires.
    if (dirty && active() && isOnline()) void run();
  } else {
    // Foregrounded — pull in whatever changed on other devices while we were away.
    void catchUp();
  }
}

/** Wire the auto-sync controller once, at app start. Safe to call repeatedly. */
export function startAutoSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  lastVersion = get(dataVersion);
  wasActive = active();

  dataVersion.subscribe((v) => {
    if (v === lastVersion) return; // skip the initial replay
    lastVersion = v;
    onLocalChange();
  });

  settings.subscribe((s) => {
    // Backed-up preferences live outside the db, so dataVersion never moves when
    // one changes. Watch them here so e.g. a theme or text-size tweak is pushed
    // too. Only the portable subset counts — reacting to autoSync/connection or
    // the lastSync/lastRestore stamps would loop, since a push writes lastSync.
    const sig = JSON.stringify(getBackupSettings());
    if (lastPortableSig === undefined) {
      lastPortableSig = sig; // initial subscribe replay — capture the baseline
    } else if (sig !== lastPortableSig) {
      lastPortableSig = sig;
      onLocalChange();
    }

    const now = s.autoSync && s.oneDriveConnected;
    if (now !== wasActive) {
      wasActive = now;
      if (now) {
        void catchUp(); // just connected/enabled — pull whatever is already in the cloud
        if (dirty) schedule(); // and push changes made while we were disconnected
      } else {
        cancelTimer(); // turned off or disconnected — stop automatic uploads
        conflicted = false; // a fresh connection starts without a stale conflict
        autoSyncStatus.set('idle');
      }
    }
  });

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibility);

  // On launch, catch up to anything other devices backed up while this one was closed.
  if (active()) void catchUp();
}

/**
 * Clear the pending-changes marker (and reflect success) without scheduling a
 * push. Call after a manual "Back up now" or a Restore so the controller doesn't
 * re-upload state that is already — or freshly — in sync. Also clears any conflict
 * flag, since a manual back-up/restore is how the user resolves one.
 */
export function markSyncSettled(): void {
  dirty = false;
  conflicted = false;
  cancelTimer();
  autoSyncStatus.set('synced');
}
