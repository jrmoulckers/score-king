import { writable } from 'svelte/store';
import type { Game, ID, Round } from '../types';
import { defaultWinners } from '../types';
import * as db from '../storage/db';
import { uid } from '../util';
import { getModule } from '../games/registry';
import { computeTotals } from '../scoring';

export const games = writable<Game[]>([]);

export async function refreshGames(): Promise<void> {
  games.set(await db.getAllGames());
}

export async function createGame(
  type: string,
  playerIds: ID[],
  config: Record<string, unknown>,
  name?: string,
): Promise<Game> {
  const game: Game = {
    id: uid(),
    type,
    name,
    config,
    playerIds,
    status: 'active',
    createdAt: Date.now(),
    roundCount: 0,
  };
  await db.putGame(game);
  await refreshGames();
  return game;
}

export async function appendRound(
  game: Game,
  input: unknown,
  deltas: Record<ID, number>,
): Promise<Round> {
  const existing = await db.getRounds(game.id);
  const round: Round = {
    id: uid(),
    gameId: game.id,
    index: existing.length,
    input,
    deltas,
    createdAt: Date.now(),
  };
  await db.putRound(round);
  await db.putGame({ ...game, roundCount: existing.length + 1 });
  await refreshGames();
  return round;
}

export async function updateRound(
  round: Round,
  input: unknown,
  deltas: Record<ID, number>,
): Promise<void> {
  await db.putRound({ ...round, input, deltas });
}

export async function removeRound(round: Round, game: Game): Promise<void> {
  await db.deleteRound(round.id);
  const remaining = (await db.getRounds(game.id)).sort((a, b) => a.index - b.index);
  // re-index so rounds stay contiguous
  remaining.forEach((r, i) => {
    r.index = i;
  });
  for (const r of remaining) await db.putRound(r);
  await db.putGame({ ...game, roundCount: remaining.length });
  await refreshGames();
}

/** Re-insert a previously removed round at its original position (undo). */
export async function restoreRound(game: Game, round: Round): Promise<void> {
  const existing = (await db.getRounds(game.id)).sort((a, b) => a.index - b.index);
  const at = Math.max(0, Math.min(round.index, existing.length));
  existing.splice(at, 0, { ...round });
  existing.forEach((r, i) => {
    r.index = i;
  });
  for (const r of existing) await db.putRound(r);
  await db.putGame({ ...game, roundCount: existing.length });
  await refreshGames();
}

export async function finishGame(game: Game): Promise<Game> {
  const rounds = await db.getRounds(game.id);
  const totals = computeTotals(rounds, game.playerIds);
  const module = getModule(game.type);
  let winners: ID[] = [];
  if (module) {
    winners = module.pickWinners
      ? module.pickWinners(totals, game.config)
      : defaultWinners(module, totals, game.config);
  }
  const updated: Game = {
    ...game,
    status: 'finished',
    finishedAt: Date.now(),
    winnerIds: winners,
    roundCount: rounds.length,
  };
  await db.putGame(updated);
  await refreshGames();
  return updated;
}

export async function reopenGame(game: Game): Promise<Game> {
  const updated: Game = { ...game, status: 'active', finishedAt: undefined, winnerIds: undefined };
  await db.putGame(updated);
  await refreshGames();
  return updated;
}

export async function removeGame(id: ID): Promise<void> {
  await db.deleteGame(id);
  await refreshGames();
}

/** Re-create a deleted game and its rounds (undo). */
export async function restoreGame(game: Game, rounds: Round[]): Promise<void> {
  await db.putGame(game);
  for (const r of rounds) await db.putRound(r);
  await refreshGames();
}

void refreshGames();
