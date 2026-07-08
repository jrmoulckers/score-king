import type { ID } from '../../types';
import type { RummikubInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';

interface RKAgg {
  /** Rounds this member went out ("Rummikub!"). */
  wentOut: number;
  /** Biggest single-round pot this member collected. */
  bestHaul: number;
  /** Jokers this member was caught holding when a round ended. */
  jokersStranded: number;
}

/**
 * Rummikub stats derived purely from each round's recorded winner + leftover hands
 * (and the winner's recorded delta = the pot they collected). Pure — no Svelte —
 * so it's independently unit-testable and safe for the stats engine to import.
 */
export function rummikubStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, RKAgg>();
  const get = (id: ID): RKAgg => {
    let a = per.get(id);
    if (!a) {
      a = { wentOut: 0, bestHaul: 0, jokersStranded: 0 };
      per.set(id, a);
    }
    return a;
  };

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as RummikubInput | undefined;
    if (!input?.winner) continue;

    const winner = get(canonical(input.winner));
    winner.wentOut += 1;
    const haul = Number(r.deltas?.[input.winner]) || 0;
    if (haul > winner.bestHaul) winner.bestHaul = haul;

    for (const [pid, hand] of Object.entries(input.hands ?? {})) {
      if (pid === input.winner) continue;
      get(canonical(pid)).jokersStranded += Math.max(0, Math.round(Number(hand?.jokers) || 0));
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totalJokers = 0;
  let biggestHaul = 0;
  for (const [id, a] of per) {
    totalJokers += a.jokersStranded;
    if (a.bestHaul > biggestHaul) biggestHaul = a.bestHaul;
    const metrics: Metric[] = [];
    if (a.wentOut) {
      metrics.push({ key: 'rk_out', label: 'Went out', value: fmtInt(a.wentOut), emoji: '🏆' });
    }
    if (a.bestHaul) {
      metrics.push({ key: 'rk_haul', label: 'Best haul', value: `+${fmtInt(a.bestHaul)}`, emoji: '💰' });
    }
    if (a.jokersStranded) {
      metrics.push({ key: 'rk_joker', label: 'Jokers stranded', value: fmtInt(a.jokersStranded), emoji: '🃏' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (biggestHaul) {
    global.push({ key: 'rk_haul_all', label: 'Biggest haul', value: `+${fmtInt(biggestHaul)}`, emoji: '💰' });
  }
  if (totalJokers) {
    global.push({ key: 'rk_joker_all', label: 'Jokers stranded', value: fmtInt(totalJokers), emoji: '🃏' });
  }
  return { perPlayer, global };
}
