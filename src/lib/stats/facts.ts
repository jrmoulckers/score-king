import type { Game, ID, Round } from '../types';
import { standings } from '../scoring';
import { canonicalDeltas, canonicalIds } from './identity';

/** Sorting/range anchor for a game: when it finished, falling back to creation. */
export function gameTime(g: Game): number {
  return g.finishedAt ?? g.createdAt;
}

/** Derived, canonicalized facts about one finished game — the unit every stat builds on. */
export interface GameFacts {
  game: Game;
  rounds: Round[]; // sorted by index
  /** Canonical, deduped participants. */
  playerIds: ID[];
  totals: Record<ID, number>;
  /** Inferred from winners vs totals so the engine never needs the game module. */
  dir: 'higher' | 'lower';
  /** Best → worst finishing order (canonical). */
  order: ID[];
  /** 1-based finishing rank; ties share a rank. */
  rankOf: Record<ID, number>;
  /** Canonical winners (from winnerIds, falling back to rank-1 on legacy data). */
  winners: ID[];
  /** |winner − best non-winner|; undefined when there's no opponent. */
  margin?: number;
  /** Winners who trailed (rank > 1) at some round before winning. */
  comeback: Set<ID>;
  /** Winners who held rank 1 at every round. */
  wireToWire: Set<ID>;
  /** Largest single-round delta in this game (for records). */
  topRound?: { playerId: ID; value: number; index: number };
}

/** Decide win direction from the recorded winners: do they hold the max or the min total? */
function inferDirection(totals: Record<ID, number>, winners: ID[]): 'higher' | 'lower' {
  const vals = Object.values(totals);
  if (winners.length === 0 || vals.length === 0) return 'higher';
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  if (max === min) return 'higher';
  const winnerVals = winners.map((w) => totals[w] ?? 0);
  const allMax = winnerVals.every((v) => v === max);
  const allMin = winnerVals.every((v) => v === min);
  if (allMin && !allMax) return 'lower';
  return 'higher';
}

function marginOf(
  totals: Record<ID, number>,
  winners: ID[],
  playerIds: ID[],
  dir: 'higher' | 'lower',
): number | undefined {
  const losers = playerIds.filter((id) => !winners.includes(id));
  if (winners.length === 0 || losers.length === 0) return undefined;
  const better = (a: number, b: number) => (dir === 'lower' ? a < b : a > b);
  let winTotal = totals[winners[0]];
  for (const w of winners) if (better(totals[w], winTotal)) winTotal = totals[w];
  let bestLoser = totals[losers[0]];
  for (const l of losers) if (better(totals[l], bestLoser)) bestLoser = totals[l];
  return Math.abs(winTotal - bestLoser);
}

/** Replay round-by-round to classify comeback / wire-to-wire wins and find the biggest swing. */
function replay(
  rounds: Round[],
  playerIds: ID[],
  winners: ID[],
  dir: 'higher' | 'lower',
  canonical: (id: ID) => ID,
): Pick<GameFacts, 'comeback' | 'wireToWire' | 'topRound'> {
  const run: Record<ID, number> = {};
  for (const id of playerIds) run[id] = 0;
  const trailed = new Set<ID>();
  const ledThroughout = new Set<ID>(winners);
  let topRound: GameFacts['topRound'];

  for (const r of rounds) {
    const cd = canonicalDeltas(r.deltas, canonical);
    for (const [id, v] of Object.entries(cd)) {
      run[id] = (run[id] ?? 0) + v;
      if (!topRound || v > topRound.value) topRound = { playerId: id, value: v, index: r.index };
    }
    const ranked = standings(run, dir === 'lower');
    const rank: Record<ID, number> = {};
    for (const s of ranked) rank[s.playerId] = s.rank;
    for (const w of winners) {
      if ((rank[w] ?? Infinity) > 1) {
        trailed.add(w);
        ledThroughout.delete(w);
      }
    }
  }
  return { comeback: trailed, wireToWire: ledThroughout, topRound };
}

export function computeGameFacts(
  game: Game,
  gameRounds: Round[],
  canonical: (id: ID) => ID,
): GameFacts {
  const rounds = [...gameRounds].sort((a, b) => a.index - b.index);
  const playerIds = canonicalIds(game.playerIds, canonical);

  const totals: Record<ID, number> = {};
  for (const id of playerIds) totals[id] = 0;
  for (const r of rounds) {
    const cd = canonicalDeltas(r.deltas, canonical);
    for (const [id, v] of Object.entries(cd)) totals[id] = (totals[id] ?? 0) + v;
  }

  const declared = canonicalIds(game.winnerIds ?? [], canonical).filter((id) => id in totals);
  const dir = inferDirection(totals, declared);
  const ranked = standings(totals, dir === 'lower');
  const rankOf: Record<ID, number> = {};
  for (const s of ranked) rankOf[s.playerId] = s.rank;
  const order = ranked.map((s) => s.playerId);
  const winners = declared.length ? declared : order.filter((id) => rankOf[id] === 1);

  const margin = marginOf(totals, winners, playerIds, dir);
  const { comeback, wireToWire, topRound } = replay(rounds, playerIds, winners, dir, canonical);

  return { game, rounds, playerIds, totals, dir, order, rankOf, winners, margin, comeback, wireToWire, topRound };
}
