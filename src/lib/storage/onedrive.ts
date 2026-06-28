import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import { get } from 'svelte/store';
import { settings } from '../stores/settings';
import { ONEDRIVE_CLIENT_ID } from '../config';
import type { Snapshot, SyncProvider } from './sync';
import type { Game, Player, Round } from '../types';

const FILE_NAME = 'Score King.xlsx';
const SCOPES = ['Files.ReadWrite', 'User.Read'];
const GRAPH = 'https://graph.microsoft.com/v1.0';

let pca: PublicClientApplication | null = null;
let account: AccountInfo | null = null;
let initializedFor = '';

function clientId(): string {
  // Per-user override (Settings) wins; otherwise the shared app's public client ID.
  return (get(settings).oneDriveClientId.trim() || ONEDRIVE_CLIENT_ID).trim();
}

function isInteractionInProgress(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'errorCode' in e &&
    (e as { errorCode?: string }).errorCode === 'interaction_in_progress'
  );
}

/**
 * Run an interactive MSAL call, recovering from a stuck "interaction_in_progress"
 * left behind by a previously dismissed popup: reconcile state, then retry once.
 */
async function withInteractionRetry<T>(
  app: PublicClientApplication,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isInteractionInProgress(e)) {
      await app.handleRedirectPromise().catch(() => {});
      return await fn();
    }
    throw e;
  }
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
    // Reconcile any leftover state from a previous, possibly interrupted sign-in.
    // Clears a stuck "interaction_in_progress" after a popup is dismissed/closed.
    try {
      await pca.handleRedirectPromise();
    } catch {
      /* nothing to handle */
    }
    initializedFor = id;
    const accounts = pca.getAllAccounts();
    if (accounts.length) account = accounts[0];
  }
  return pca;
}

async function token(): Promise<string> {
  const app = await ensureApp();
  if (!account) {
    const res = await withInteractionRetry(app, () => app.loginPopup({ scopes: SCOPES }));
    account = res.account;
  }
  if (!account) throw new Error('Microsoft sign-in was cancelled.');
  try {
    const res = await app.acquireTokenSilent({ scopes: SCOPES, account });
    return res.accessToken;
  } catch {
    const res = await withInteractionRetry(app, () => app.acquireTokenPopup({ scopes: SCOPES }));
    account = res.account;
    return res.accessToken;
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

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(players), 'Players');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(games), 'Games');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rounds), 'Rounds');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scores), 'RoundScores');
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
  return { players, games, rounds, exportedAt: Date.now() };
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
    const res = await withInteractionRetry(app, () => app.loginPopup({ scopes: SCOPES }));
    account = res.account;
  },
  async signOut() {
    if (pca && account) await pca.logoutPopup({ account });
    account = null;
  },
  async push(snapshot) {
    const accessToken = await token();
    const buf = await toWorkbook(snapshot);
    const res = await graph(
      `/me/drive/root:/${encodeURIComponent(FILE_NAME)}:/content`,
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
    if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status}).`);
  },
  async pull() {
    const accessToken = await token();
    const res = await graph(
      `/me/drive/root:/${encodeURIComponent(FILE_NAME)}:/content`,
      { method: 'GET' },
      accessToken,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
    return fromWorkbook(await res.arrayBuffer());
  },
};
