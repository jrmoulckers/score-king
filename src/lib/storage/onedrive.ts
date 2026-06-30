import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import { get } from 'svelte/store';
import { settings } from '../stores/settings';
import { ONEDRIVE_CLIENT_ID } from '../config';
import type { Snapshot, SyncProvider } from './sync';
import { InteractionRequiredError } from './sync';
import type { Game, Player, Round } from '../types';
import type { Settings } from '../stores/settings';

const FILE_NAME = 'Score King.xlsx';
const GRAPH = 'https://graph.microsoft.com/v1.0';

// Where to send the user back to after a full-page Microsoft sign-in redirect.
const RETURN_KEY = 'sk_od_return';
// Set once a redirect sign-in completes, so the UI can confirm success a single time.
const JUST_CONNECTED_KEY = 'sk_od_justConnected';

function folderMode(): 'app' | 'custom' {
  return get(settings).oneDriveFolderMode === 'custom' ? 'custom' : 'app';
}

/**
 * Permissions requested at sign-in (dynamic consent — no app-registration change needed).
 * - App-folder mode is sandboxed to /Apps/Score King via Files.ReadWrite.AppFolder: the app
 *   cannot see any of the user's other files.
 * - Custom mode can write anywhere, which Graph only allows via the broad Files.ReadWrite scope
 *   (delegated permissions can't be limited to a single arbitrary folder).
 */
function scopes(): string[] {
  return folderMode() === 'custom'
    ? ['Files.ReadWrite', 'User.Read']
    : ['Files.ReadWrite.AppFolder', 'User.Read'];
}

function encodePath(p: string): string {
  return p
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

/** Folder segments for custom mode, trimmed and emptied of blanks (root => []). */
function customFolderSegments(): string[] {
  return (get(settings).oneDriveCustomPath || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Graph addressing for the workbook's content, per the chosen storage location. */
function contentPath(): string {
  const file = encodeURIComponent(FILE_NAME);
  if (folderMode() === 'custom') {
    const folder = encodePath(get(settings).oneDriveCustomPath || '');
    return `/me/drive/root:${folder ? '/' + folder : ''}/${file}:/content`;
  }
  return `/me/drive/special/approot:/${file}:/content`;
}

let pca: PublicClientApplication | null = null;
let account: AccountInfo | null = null;
let initializedFor = '';

function clientId(): string {
  // Per-user override (Settings) wins; otherwise the shared app's public client ID.
  return (get(settings).oneDriveClientId.trim() || ONEDRIVE_CLIENT_ID).trim();
}

async function ensureApp(): Promise<PublicClientApplication> {
  const id = clientId();
  if (!id) throw new Error('No OneDrive client ID configured (add it in Settings).');
  if (!pca || initializedFor !== id) {
    pca = new PublicClientApplication({
      auth: {
        clientId: id,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'localStorage' },
    });
    await pca.initialize();
    // Process a returning sign-in redirect (if any) and reconcile cached state. This must run
    // before any other MSAL call and also clears a stuck "interaction_in_progress".
    try {
      const result = await pca.handleRedirectPromise();
      if (result?.account) account = result.account;
    } catch {
      /* nothing to handle */
    }
    initializedFor = id;
    if (!account) {
      const accounts = pca.getAllAccounts();
      if (accounts.length) account = accounts[0];
    }
    if (account) pca.setActiveAccount(account);
  }
  return pca;
}

/**
 * Finish a Microsoft sign-in that used the full-page redirect flow. Called once at app
 * startup when the URL carries the redirect response; returns the path the user started
 * from (so the app can navigate back there), or null.
 */
export async function completeRedirect(): Promise<string | null> {
  if (!clientId()) return null;
  try {
    await ensureApp();
  } catch {
    return null;
  }
  const ret = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  if (account) sessionStorage.setItem(JUST_CONNECTED_KEY, '1');
  return ret;
}

async function token(interactive = true): Promise<string> {
  const app = await ensureApp();
  if (!account) {
    // Background auto-sync must never yank the user to Microsoft — fail quietly.
    if (!interactive) throw new InteractionRequiredError('Not signed in to OneDrive');
    // Not signed in yet — hand off to a full-page redirect; this call does not return.
    sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);
    await app.loginRedirect({ scopes: scopes() });
    throw new Error('Redirecting to Microsoft to sign in…');
  }
  try {
    const res = await app.acquireTokenSilent({ scopes: scopes(), account });
    return res.accessToken;
  } catch {
    if (!interactive)
      throw new InteractionRequiredError('Silent OneDrive token refresh failed');
    sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);
    await app.acquireTokenRedirect({ scopes: scopes(), account });
    throw new Error('Redirecting to Microsoft to refresh sign-in…');
  }
}

async function graph(path: string, init: RequestInit, accessToken: string): Promise<Response> {
  return fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` },
  });
}

function parse<T>(value: unknown, fallback: T): T {
  try {
    return value ? (JSON.parse(String(value)) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function toWorkbook(s: Snapshot): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name ?? id;

  const players = s.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    createdAt: new Date(p.createdAt).toISOString(),
  }));
  const games = s.games.map((g) => ({
    id: g.id,
    type: g.type,
    name: g.name ?? '',
    status: g.status,
    created: new Date(g.createdAt).toISOString(),
    finished: g.finishedAt ? new Date(g.finishedAt).toISOString() : '',
    players: g.playerIds.map(nameOf).join(', '),
    winners: (g.winnerIds ?? []).map(nameOf).join(', '),
    config: JSON.stringify(g.config),
    playerIds: JSON.stringify(g.playerIds),
  }));
  const rounds = s.rounds.map((r) => ({
    id: r.id,
    gameId: r.gameId,
    round: r.index + 1,
    created: new Date(r.createdAt).toISOString(),
    input: JSON.stringify(r.input),
    deltas: JSON.stringify(r.deltas),
  }));
  const scores: Array<Record<string, unknown>> = [];
  for (const r of s.rounds) {
    for (const [pid, delta] of Object.entries(r.deltas)) {
      scores.push({ gameId: r.gameId, round: r.index + 1, player: nameOf(pid), delta });
    }
  }
  // Portable preferences, one row per key with a JSON-encoded value (matching how
  // config/inputs are stored in the other sheets) so any value type round-trips.
  const settings = Object.entries(s.settings ?? {}).map(([key, value]) => ({
    key,
    value: JSON.stringify(value),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(players), 'Players');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(games), 'Games');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rounds), 'Rounds');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scores), 'RoundScores');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(settings), 'Settings');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

async function fromWorkbook(buf: ArrayBuffer): Promise<Snapshot> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = (name: string): Record<string, unknown>[] =>
    wb.Sheets[name] ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]) : [];

  const players: Player[] = sheet('Players').map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    color: String(r.color ?? '#7c5cff'),
    createdAt: Date.parse(String(r.createdAt)) || Date.now(),
  }));
  const games: Game[] = sheet('Games').map((r) => ({
    id: String(r.id),
    type: String(r.type),
    name: r.name ? String(r.name) : undefined,
    status: r.status === 'finished' ? 'finished' : 'active',
    config: parse(r.config, {}),
    playerIds: parse(r.playerIds, [] as string[]),
    createdAt: Date.parse(String(r.created)) || Date.now(),
    finishedAt: r.finished ? Date.parse(String(r.finished)) || undefined : undefined,
    winnerIds: undefined,
    roundCount: 0,
  }));
  const rounds: Round[] = sheet('Rounds').map((r) => ({
    id: String(r.id),
    gameId: String(r.gameId),
    index: (Number(r.round) || 1) - 1,
    input: parse(r.input, null),
    deltas: parse(r.deltas, {} as Record<string, number>),
    createdAt: Date.parse(String(r.created)) || Date.now(),
  }));
  for (const g of games) g.roundCount = rounds.filter((r) => r.gameId === g.id).length;

  // Portable preferences (JSON-encoded values). applyBackupSettings ignores any
  // non-portable keys, so we read permissively here.
  const restoredSettings: Partial<Settings> = {};
  for (const r of sheet('Settings')) {
    const key = String(r.key ?? '').trim();
    if (key) (restoredSettings as Record<string, unknown>)[key] = parse<unknown>(r.value, undefined);
  }
  return { players, games, rounds, settings: restoredSettings, exportedAt: Date.now() };
}

/** PUT the workbook bytes to the configured content path (overwrites; last-write-wins). */
function putContent(buf: ArrayBuffer, accessToken: string): Promise<Response> {
  return graph(
    contentPath(),
    {
      method: 'PUT',
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      body: buf,
    },
    accessToken,
  );
}

/**
 * Create the custom-folder path if it's missing — e.g. the user deleted the folder in OneDrive —
 * so a subsequent upload to a file inside it succeeds. Each segment is created with
 * conflictBehavior 'fail', so existing folders (and their contents) are left untouched (a 409 just
 * means "already there"). App-folder mode needs nothing here: Graph provisions the sandboxed
 * approot automatically on write.
 */
async function ensureCustomFolder(accessToken: string): Promise<void> {
  let parentPath = '';
  for (const name of customFolderSegments()) {
    const childrenPath = parentPath
      ? `/me/drive/root:/${encodePath(parentPath)}:/children`
      : '/me/drive/root/children';
    const res = await graph(
      childrenPath,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        }),
      },
      accessToken,
    );
    if (!res.ok && res.status !== 409) {
      throw new Error(`Could not create OneDrive folder "${name}" (HTTP ${res.status}).`);
    }
    parentPath = parentPath ? `${parentPath}/${name}` : name;
  }
}

export const oneDrive: SyncProvider = {
  id: 'onedrive',
  label: 'OneDrive',
  isConfigured() {
    return !!clientId();
  },
  isSignedIn() {
    return !!account;
  },
  async prepare() {
    if (!clientId()) return false;
    await ensureApp();
    return !!account;
  },
  async signIn() {
    const app = await ensureApp();
    // Full-page redirect to Microsoft. Remember where we are so we can return here after.
    sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);
    await app.loginRedirect({ scopes: scopes() });
  },
  async signOut() {
    if (pca && account) {
      // Local sign-out: forget this app's cached tokens without a full-page logout redirect.
      try {
        await pca.clearCache({ account });
      } catch {
        /* ignore */
      }
      pca.setActiveAccount(null);
    }
    account = null;
  },
  async push(snapshot, opts) {
    const accessToken = await token(opts?.interactive ?? true);
    const buf = await toWorkbook(snapshot);
    let res = await putContent(buf, accessToken);
    // A custom-folder target 404s when its parent folder was deleted (or never created).
    // Recreate the folder hierarchy and retry once so backup self-heals. App-folder mode
    // doesn't need this — writing to approot re-provisions the sandboxed folder automatically.
    if (res.status === 404 && folderMode() === 'custom') {
      await ensureCustomFolder(accessToken);
      res = await putContent(buf, accessToken);
    }
    if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status}).`);
  },
  async pull() {
    const accessToken = await token();
    // cache: 'no-store' bypasses the browser HTTP cache for this GET *and* the CDN download URL
    // that Graph 302-redirects to (the cache mode is inherited across the redirect chain), so a
    // single Restore always returns the latest remote content — no disconnect/reconnect needed.
    const res = await graph(contentPath(), { method: 'GET', cache: 'no-store' }, accessToken);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
    return fromWorkbook(await res.arrayBuffer());
  },
};
