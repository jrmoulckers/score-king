import type { ID } from '../../types';
import { penaltyFor, wentOutIds, type KingsCornersInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt, fmtPct } from '../../stats/format';

interface KingsCornersAgg {
  rounds: number;
  wentOut: number;
  points: number;
  worst: number;
}

/**
 * Kings Corners stats from each round's recorded Kings/other-card counts. Lower-is-better,
 * so "went out" (zero penalty) is the round's best outcome. Pure; mirrors the module's own
 * `wentOutIds()`/`penaltyFor()`.
 */
export function kingsCornersStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, KingsCornersAgg>();
  const get = (id: ID): KingsCornersAgg => {
    let a = per.get(id);
    if (!a) {
      a = { rounds: 0, wentOut: 0, points: 0, worst: 0 };
      per.set(id, a);
    }
    return a;
  };

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as KingsCornersInput | undefined;
    if (!input?.kingsLeft) continue;
    const rawIds = Object.keys(input.kingsLeft);
    const outs = new Set(wentOutIds(input, rawIds).map(canonical));
    for (const pid of rawIds) {
      const id = canonical(pid);
      const a = get(id);
      a.rounds += 1;
      const points = penaltyFor(input, pid);
      a.points += points;
      if (points > a.worst) a.worst = points;
      if (outs.has(id)) a.wentOut += 1;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totWentOut = 0;
  for (const [id, a] of per) {
    totWentOut += a.wentOut;
    const metrics: Metric[] = [];
    if (a.rounds) {
      metrics.push({
        key: 'kc_out_pct',
        label: 'Went out',
        value: fmtPct(a.wentOut / a.rounds),
        emoji: '👑',
      });
      metrics.push({
        key: 'kc_avg',
        label: 'Avg penalty',
        value: fmtAvg(a.points / a.rounds),
        emoji: '🂡',
      });
      metrics.push({ key: 'kc_worst', label: 'Worst hand', value: fmtInt(a.worst), emoji: '😱' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totWentOut)
    global.push({ key: 'kc_out_all', label: 'Times gone out', value: `${totWentOut}`, emoji: '👑' });
  return { perPlayer, global };
}
