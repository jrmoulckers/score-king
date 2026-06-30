import { get, writable } from 'svelte/store';
import { settings, markSynced, getBackupSettings } from '../stores/settings';
import { dataVersion } from './changes';
import { buildSnapshot, getOneDrive, InteractionRequiredError } from './sync';
import type { SyncProvider } from './sync';

export type AutoSyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'pending'
  | 'offline'
  | 'error';

/** Live status for the Settings indicator. */
export const autoSyncStatus = writable<AutoSyncStatus>('idle');

/** Debounce window: coalesce a burst of edits into a single upload. */
const DEBOUNCE_MS = 2500;

let started = false;
let dirty = false; // local changes awaiting upload
let pushing = false; // an upload is in flight
let timer: ReturnType<typeof setTimeout> | undefined;
let lastVersion = 0;
let wasActive = false;
let lastPortableSig: string | undefined; // JSON of the last-seen portable settings

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
  if (!active()) return;
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
  if (pushing || !dirty || !active()) return;
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
    await od.push(await buildSnapshot(), { interactive: false });
    markSynced(Date.now());
    if (dirty) {
      schedule(); // more edits arrived mid-upload
    } else {
      autoSyncStatus.set('synced');
    }
  } catch (e) {
    dirty = true; // keep the changes pending
    if (e instanceof InteractionRequiredError) {
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

function onOnline(): void {
  if (dirty && active()) void run();
}

function onVisibility(): void {
  // Best-effort flush when the tab is backgrounded, so a pending edit isn't
  // stranded if the user navigates away before the debounce fires.
  if (document.visibilityState === 'hidden' && dirty && active() && isOnline()) {
    void run();
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
        if (dirty) schedule(); // turned on / just connected with changes waiting
      } else {
        cancelTimer(); // turned off or disconnected — stop automatic uploads
        autoSyncStatus.set('idle');
      }
    }
  });

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibility);
}

/**
 * Clear the pending-changes marker (and reflect success) without scheduling a
 * push. Call after a manual "Back up now" or a Restore so the controller doesn't
 * re-upload state that is already — or freshly — in sync.
 */
export function markSyncSettled(): void {
  dirty = false;
  cancelTimer();
  autoSyncStatus.set('synced');
}
