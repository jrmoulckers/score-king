import * as db from './db';
import type { Game, Player, Round } from '../types';

export interface Snapshot {
  players: Player[];
  games: Game[];
  rounds: Round[];
  exportedAt: number;
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
  push(snapshot: Snapshot): Promise<void>;
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
