import { writable } from 'svelte/store';
import type { Player, ID } from '../types';
import * as db from '../storage/db';
import { pickColor } from '../util';

export const players = writable<Player[]>([]);

export async function refreshPlayers(): Promise<void> {
  players.set(await db.getAllPlayers());
}

export async function createPlayer(name: string): Promise<Player> {
  const existing = await db.getAllPlayers();
  const player = await db.addPlayer(name, pickColor(existing.map((p) => p.color)));
  await refreshPlayers();
  return player;
}

export async function renamePlayer(player: Player, name: string): Promise<void> {
  await db.updatePlayer({ ...player, name: name.trim() });
  await refreshPlayers();
}

export async function recolorPlayer(player: Player, color: string): Promise<void> {
  await db.updatePlayer({ ...player, color });
  await refreshPlayers();
}

export async function removePlayer(id: ID): Promise<void> {
  await db.deletePlayer(id);
  await refreshPlayers();
}

void refreshPlayers();
