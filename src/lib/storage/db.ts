import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Game, ID, Player, Round } from '../types';
import type { CustomGameDef } from '../games/custom/types';
import { uid } from '../util';
import { markDataChanged } from './changes';

interface ScoreKingDB extends DBSchema {
  players: { key: string; value: Player };
  games: { key: string; value: Game; indexes: { byCreated: number } };
  rounds: { key: string; value: Round; indexes: { byGame: string } };
  gameDefs: { key: string; value: CustomGameDef };
}

let dbp: Promise<IDBPDatabase<ScoreKingDB>> | null = null;

/** Strip Svelte $state proxies so values are structured-clonable for IndexedDB. */
const raw = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function db(): Promise<IDBPDatabase<ScoreKingDB>> {
  if (!dbp) {
    dbp = openDB<ScoreKingDB>('score-king', 2, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          database.createObjectStore('players', { keyPath: 'id' });
          const games = database.createObjectStore('games', { keyPath: 'id' });
          games.createIndex('byCreated', 'createdAt');
          const rounds = database.createObjectStore('rounds', { keyPath: 'id' });
          rounds.createIndex('byGame', 'gameId');
        }
        // v2: user-authored custom game definitions (part of the World).
        if (oldVersion < 2) {
          database.createObjectStore('gameDefs', { keyPath: 'id' });
        }
      },
    });
  }
  return dbp;
}

// ---- Players ----
/** Default identity fields that legacy records (pre-Member) won't have on disk. */
function normalizePlayer(p: Player): Player {
  return { ...p, claimed: p.claimed ?? true, archived: p.archived ?? false };
}

export async function getAllPlayers(): Promise<Player[]> {
  const all = await (await db()).getAll('players');
  return all
    .filter((p) => !p.deleted)
    .map(normalizePlayer)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addPlayer(name: string, color: string, claimed: boolean): Promise<Player> {
  const now = Date.now();
  const player: Player = {
    id: uid(),
    name: name.trim(),
    color,
    createdAt: now,
    updatedAt: now,
    claimed,
    archived: false,
  };
  await (await db()).put('players', player);
  markDataChanged();
  return player;
}

export async function updatePlayer(player: Player): Promise<void> {
  await (await db()).put('players', raw({ ...player, updatedAt: Date.now() }));
  markDataChanged();
}

export async function deletePlayer(id: ID): Promise<void> {
  const database = await db();
  const existing = await database.get('players', id);
  if (existing) {
    const now = Date.now();
    await database.put('players', raw({ ...existing, deleted: now, updatedAt: now }));
  }
  markDataChanged();
}

// ---- Games ----
export async function getAllGames(): Promise<Game[]> {
  const all = await (await db()).getAllFromIndex('games', 'byCreated');
  return all.filter((g) => !g.deleted).reverse();
}

export async function getGame(id: ID): Promise<Game | undefined> {
  const game = await (await db()).get('games', id);
  return game && !game.deleted ? game : undefined;
}

export async function putGame(game: Game): Promise<void> {
  await (await db()).put('games', raw({ ...game, updatedAt: Date.now() }));
  markDataChanged();
}

export async function deleteGame(id: ID): Promise<void> {
  const database = await db();
  const now = Date.now();
  const tx = database.transaction(['games', 'rounds'], 'readwrite');
  const game = await tx.objectStore('games').get(id);
  if (game) await tx.objectStore('games').put(raw({ ...game, deleted: now, updatedAt: now }));
  // Tombstone the game's rounds too, so the cascade delete propagates on merge.
  const rounds = await tx.objectStore('rounds').index('byGame').getAll(id);
  for (const r of rounds) {
    await tx.objectStore('rounds').put(raw({ ...r, deleted: now, updatedAt: now }));
  }
  await tx.done;
  markDataChanged();
}

// ---- Rounds ----
export async function getRounds(gameId: ID): Promise<Round[]> {
  const all = await (await db()).getAllFromIndex('rounds', 'byGame', gameId);
  return all.filter((r) => !r.deleted).sort((a, b) => a.index - b.index);
}

export async function putRound(round: Round): Promise<void> {
  await (await db()).put('rounds', raw({ ...round, updatedAt: Date.now() }));
  markDataChanged();
}

export async function deleteRound(id: ID): Promise<void> {
  const database = await db();
  const existing = await database.get('rounds', id);
  if (existing) {
    const now = Date.now();
    await database.put('rounds', raw({ ...existing, deleted: now, updatedAt: now }));
  }
  markDataChanged();
}

// ---- Custom game definitions ----
/** Live custom game definitions (tombstones hidden). Includes archived defs so games,
 *  history and stats of a retired custom type still resolve. */
export async function getAllGameDefs(): Promise<CustomGameDef[]> {
  const all = await (await db()).getAll('gameDefs');
  return all.filter((d) => !d.deleted).sort((a, b) => a.createdAt - b.createdAt);
}

export async function putGameDef(def: CustomGameDef): Promise<void> {
  await (await db()).put('gameDefs', raw({ ...def, updatedAt: Date.now() }));
  markDataChanged();
}

/** Hard-delete a custom game definition (tombstoned so the delete propagates on merge).
 *  Only used for a type that was never played; a played type is archived instead. */
export async function deleteGameDef(id: ID): Promise<void> {
  const database = await db();
  const existing = await database.get('gameDefs', id);
  if (existing) {
    const now = Date.now();
    await database.put('gameDefs', raw({ ...existing, deleted: now, updatedAt: now }));
  }
  markDataChanged();
}

// ---- Bulk (used by sync restore) ----
export async function replaceAll(data: {
  players: Player[];
  games: Game[];
  rounds: Round[];
  gameDefs?: CustomGameDef[];
}): Promise<void> {
  const database = await db();
  const tx = database.transaction(['players', 'games', 'rounds', 'gameDefs'], 'readwrite');
  await tx.objectStore('players').clear();
  await tx.objectStore('games').clear();
  await tx.objectStore('rounds').clear();
  await tx.objectStore('gameDefs').clear();
  for (const p of data.players) await tx.objectStore('players').put(raw(p));
  for (const g of data.games) await tx.objectStore('games').put(raw(g));
  for (const r of data.rounds) await tx.objectStore('rounds').put(raw(r));
  for (const d of data.gameDefs ?? []) await tx.objectStore('gameDefs').put(raw(d));
  await tx.done;
}

export async function getAllRounds(): Promise<Round[]> {
  const all = await (await db()).getAll('rounds');
  return all.filter((r) => !r.deleted);
}

/**
 * Everything in the World, tombstones INCLUDED — the raw material for a backup
 * snapshot and per-entity merge. The live getters above hide tombstones; sync must
 * keep them so deletions propagate to (and survive a merge with) other devices.
 */
export async function getAllForSync(): Promise<{
  players: Player[];
  games: Game[];
  rounds: Round[];
  gameDefs: CustomGameDef[];
}> {
  const database = await db();
  const [players, games, rounds, gameDefs] = await Promise.all([
    database.getAll('players'),
    database.getAll('games'),
    database.getAll('rounds'),
    database.getAll('gameDefs'),
  ]);
  return { players: players.map(normalizePlayer), games, rounds, gameDefs };
}
