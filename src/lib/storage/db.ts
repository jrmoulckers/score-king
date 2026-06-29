import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Game, ID, Player, Round } from '../types';
import { uid } from '../util';

interface ScoreKingDB extends DBSchema {
  players: { key: string; value: Player };
  games: { key: string; value: Game; indexes: { byCreated: number } };
  rounds: { key: string; value: Round; indexes: { byGame: string } };
}

let dbp: Promise<IDBPDatabase<ScoreKingDB>> | null = null;

/** Strip Svelte $state proxies so values are structured-clonable for IndexedDB. */
const raw = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function db(): Promise<IDBPDatabase<ScoreKingDB>> {
  if (!dbp) {
    dbp = openDB<ScoreKingDB>('score-king', 1, {
      upgrade(database) {
        database.createObjectStore('players', { keyPath: 'id' });
        const games = database.createObjectStore('games', { keyPath: 'id' });
        games.createIndex('byCreated', 'createdAt');
        const rounds = database.createObjectStore('rounds', { keyPath: 'id' });
        rounds.createIndex('byGame', 'gameId');
      },
    });
  }
  return dbp;
}

// ---- Players ----
export async function getAllPlayers(): Promise<Player[]> {
  const all = await (await db()).getAll('players');
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addPlayer(name: string, color: string): Promise<Player> {
  const player: Player = { id: uid(), name: name.trim(), color, createdAt: Date.now() };
  await (await db()).put('players', player);
  return player;
}

export async function updatePlayer(player: Player): Promise<void> {
  await (await db()).put('players', raw(player));
}

export async function deletePlayer(id: ID): Promise<void> {
  await (await db()).delete('players', id);
}

// ---- Games ----
export async function getAllGames(): Promise<Game[]> {
  const all = await (await db()).getAllFromIndex('games', 'byCreated');
  return all.reverse();
}

export async function getGame(id: ID): Promise<Game | undefined> {
  return (await db()).get('games', id);
}

export async function putGame(game: Game): Promise<void> {
  await (await db()).put('games', raw(game));
}

export async function deleteGame(id: ID): Promise<void> {
  const database = await db();
  const tx = database.transaction(['games', 'rounds'], 'readwrite');
  await tx.objectStore('games').delete(id);
  const rounds = await tx.objectStore('rounds').index('byGame').getAllKeys(id);
  for (const key of rounds) await tx.objectStore('rounds').delete(key);
  await tx.done;
}

// ---- Rounds ----
export async function getRounds(gameId: ID): Promise<Round[]> {
  const all = await (await db()).getAllFromIndex('rounds', 'byGame', gameId);
  return all.sort((a, b) => a.index - b.index);
}

export async function putRound(round: Round): Promise<void> {
  await (await db()).put('rounds', raw(round));
}

export async function deleteRound(id: ID): Promise<void> {
  await (await db()).delete('rounds', id);
}

// ---- Bulk (used by sync restore) ----
export async function replaceAll(data: {
  players: Player[];
  games: Game[];
  rounds: Round[];
}): Promise<void> {
  const database = await db();
  const tx = database.transaction(['players', 'games', 'rounds'], 'readwrite');
  await tx.objectStore('players').clear();
  await tx.objectStore('games').clear();
  await tx.objectStore('rounds').clear();
  for (const p of data.players) await tx.objectStore('players').put(raw(p));
  for (const g of data.games) await tx.objectStore('games').put(raw(g));
  for (const r of data.rounds) await tx.objectStore('rounds').put(raw(r));
  await tx.done;
}

export async function getAllRounds(): Promise<Round[]> {
  return (await db()).getAll('rounds');
}
