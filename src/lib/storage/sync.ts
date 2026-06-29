import * as db from './db';
import type { Game, Player, Round } from '../types';

export interface Snapshot {
  players: Player[];
  games: Game[];
  rounds: Round[];
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
  push(snapshot: Snapshot, opts?: PushOptions): Promise<void>;
  pull(): Promise<Snapshot | null>;
}

export async function buildSnapshot(): Promise<Snapshot> {
  const [players, games, rounds] = await Promise.all([
    db.getAllPlayers(),
    db.getAllGames(),
    db.getAllRounds(),
  ]);
  return { players, games, rounds, exportedAt: Date.now() };
}

export async function restoreSnapshot(snapshot: Snapshot): Promise<void> {
  await db.replaceAll({
    players: snapshot.players,
    games: snapshot.games,
    rounds: snapshot.rounds,
  });
}

/** Lazy-load the OneDrive provider (keeps MSAL + SheetJS out of the main bundle). */
export async function getOneDrive(): Promise<SyncProvider> {
  const mod = await import('./onedrive');
  return mod.oneDrive;
}
