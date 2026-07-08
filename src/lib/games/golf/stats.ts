import type { ID } from '../../types';
import type { GolfInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt } from '../../stats/format';

interface GolfAgg {
  holes: number;
  sum: number;
  best: number;
  birdies: number;
}

/**
 * Golf stats, derived purely from each recorded hole. A "birdie" here is a hole
 * scored below zero (all pairs cancelled with red cards to spare); "best hole" is
 * a player's single lowest hole. Pure — no Svelte — so it is unit-testable and
 * safe for the stats engine to import.
 */
export function golfStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, GolfAgg>();
  const get = (id: ID): GolfAgg => {
    let a = per.get(id);
    if (!a) {
      a = { holes: 0, sum: 0, best: Infinity, birdies: 0 };
      per.set(id, a);
    }
    return a;
  };

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as GolfInput | undefined;
    if (!input?.scores) continue;
    for (const [pid, raw] of Object.entries(input.scores)) {
      const v = Math.trunc(Number(raw) || 0);
      const a = get(canonical(pid));
      a.holes += 1;
      a.sum += v;
      if (v < a.best) a.best = v;
      if (v < 0) a.birdies += 1;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let courseRecord = Infinity;
  for (const [id, a] of per) {
    if (!a.holes) continue;
    if (a.best < courseRecord) courseRecord = a.best;
    const metrics: Metric[] = [
      { key: 'golf_best', label: 'Best hole', value: fmtInt(a.best), emoji: '🏌️' },
      { key: 'golf_avg', label: 'Avg per hole', value: fmtAvg(a.sum / a.holes), emoji: '⛳' },
    ];
    if (a.birdies) {
      metrics.push({
        key: 'golf_birdie',
        label: 'Birdies',
        value: fmtInt(a.birdies),
        sub: 'holes under par (0)',
        emoji: '🐦',
      });
    }
    perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (Number.isFinite(courseRecord)) {
    global.push({ key: 'golf_record', label: 'Lowest hole', value: fmtInt(courseRecord), emoji: '🏌️' });
  }

  return { perPlayer, global };
}
