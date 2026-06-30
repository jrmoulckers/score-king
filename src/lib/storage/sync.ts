import * as db from './db';
import type { Game, Player, Round } from '../types';
import type { Settings } from '../stores/settings';
import { getBackupSettings, applyBackupSettings } from '../stores/settings';

export interface Snapshot {
  players: Player[];
  games: Game[];
  rounds: Round[];
  /**
   * Backed-up user preferences (the portable subset of {@link Settings}).
   * Optional so older backups — and JSON files written before settings sync —
   * still restore cleanly; when absent, local preferences are left as-is.
   */
  settings?: Partial<Settings>;
  exportedAt: number;
}

/** Options for a provider push. */
export interface PushOptions {
  /**
   * When false, the provider must NOT trigger any interactive sign-in (e.g. a
   * full-page redirect to Microsoft). If it can't get a token silently it throws
   * {@link InteractionRequiredError} instead. Used by background auto-sync so it
   * never yanks the user away mid-use. Defaults to true (manual backups).
   */
  interactive?: boolean;
}

/** Thrown by a silent (non-interactive) push when the user must sign in again. */
export class InteractionRequiredError extends Error {
  constructor(message = 'Interactive sign-in required') {
    super(message);
    this.name = 'InteractionRequiredError';
  }
}

export interface SyncProvider {
  id: string;
  label: string;
  isConfigured(): boolean;
  isSignedIn(): boolean;
  /** Initialize and restore any cached session; resolves to whether a user is signed in. */
  prepare(): Promise<boolean>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Upload a full snapshot, overwriting any existing remote copy (last-write-wins; no conflict
   * errors). Implementations MUST create the backing file — and any missing parent folders — if
   * it doesn't exist yet, so a backup succeeds even after the file/folder was deleted remotely.
   */
  push(snapshot: Snapshot, opts?: PushOptions): Promise<void>;
  /**
   * Fetch the latest remote snapshot, bypassing any HTTP/CDN caches so a single call always
   * reflects the most recent remote edit. Resolves to null (rather than throwing) when no backup
   * exists yet — e.g. the file was never created or was deleted.
   */
  pull(): Promise<Snapshot | null>;
}

export async function buildSnapshot(): Promise<Snapshot> {
  const [players, games, rounds] = await Promise.all([
    db.getAllPlayers(),
    db.getAllGames(),
    db.getAllRounds(),
  ]);
  return { players, games, rounds, settings: getBackupSettings(), exportedAt: Date.now() };
}

export async function restoreSnapshot(snapshot: Snapshot): Promise<void> {
  await db.replaceAll({
    players: snapshot.players,
    games: snapshot.games,
    rounds: snapshot.rounds,
  });
  applyBackupSettings(snapshot.settings);
}

/** Lazy-load the OneDrive provider (keeps MSAL + SheetJS out of the main bundle). */
export async function getOneDrive(): Promise<SyncProvider> {
  const mod = await import('./onedrive');
  return mod.oneDrive;
}
