import { writable, derived } from 'svelte/store';
import type { Player, ID } from '../types';
import type { BackupSettings } from './settings';
import * as db from '../storage/db';
import { pickColor, generateHandle } from '../util';
import { pruneDeletedPlayers } from './presets';

/** Every member, archived included — Stats and History need the full roster. */
export const players = writable<Player[]>([]);

/** Active (non-archived) members: the roster shown for play and selection. */
export const activePlayers = derived(players, ($players) =>
  $players.filter((p) => !p.archived),
);

export async function refreshPlayers(): Promise<void> {
  players.set(await db.getAllPlayers());
}

/** Create a claimed member from a name the user typed. */
export async function createPlayer(name: string): Promise<Player> {
  const existing = await db.getAllPlayers();
  const player = await db.addPlayer(name, pickColor(existing.map((p) => p.color)), true);
  await refreshPlayers();
  return player;
}

/** Create an unclaimed member with a generated whimsical handle. */
export async function generatePlayer(): Promise<Player> {
  const existing = await db.getAllPlayers();
  const handle = generateHandle(existing.map((p) => p.name));
  const player = await db.addPlayer(handle, pickColor(existing.map((p) => p.color)), false);
  await refreshPlayers();
  return player;
}

/** Renaming the handle claims the identity. */
export async function renamePlayer(player: Player, name: string): Promise<void> {
  await db.updatePlayer({ ...player, name: name.trim(), claimed: true });
  await refreshPlayers();
}

export async function recolorPlayer(player: Player, color: string): Promise<void> {
  await db.updatePlayer({ ...player, color });
  await refreshPlayers();
}

/** Soft-delete: hide from the active roster while keeping history and stats intact. */
export async function archivePlayer(player: Player): Promise<void> {
  await db.updatePlayer({ ...player, archived: true, archivedAt: Date.now() });
  await refreshPlayers();
}

export async function restorePlayer(player: Player): Promise<void> {
  await db.updatePlayer({ ...player, archived: false, archivedAt: undefined });
  await refreshPlayers();
}

/** Persist a member's portable preferences (used by the identity store). */
export async function savePlayerPrefs(
  player: Player,
  prefs: Partial<BackupSettings>,
): Promise<void> {
  await db.updatePlayer({ ...player, prefs });
  await refreshPlayers();
}

/** Permanently remove a member and forget them entirely. */
export async function removePlayer(id: ID): Promise<void> {
  await db.deletePlayer(id);
  // A permanent removal: strip the ghost id from any saved presets so it can't linger or re-sync.
  pruneDeletedPlayers([id]);
  await refreshPlayers();
}

void refreshPlayers();
