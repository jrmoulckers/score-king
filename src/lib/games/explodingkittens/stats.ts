import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg } from '../../stats/format';
import { finishingPositions, type EKInput } from './logic';

interface EKAgg {
  firstOut: number;
  runnerUp: number;
  finishSum: number;
  finishCount: number;
}

/**
 * Exploding Kittens flavour stats, derived from each match's recorded survivor and
 * elimination order. The generic engine already carries match wins (the leaderboard
 * is literally "most matches won"), so this hook adds only what it can't: who blows
 * up first, who keeps reaching the final two, and average finishing position. All
 * pure; mirrors the module's own `finishingPositions`. With "track elimination
 * order" off there's no order data, so this gracefully contributes nothing.
 */
export function explodingKittensStats({
  games,
  rounds,
  canonical,
}: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, EKAgg>();
  const get = (id: ID): EKAgg => {
    let a = per.get(id);
    if (!a) {
      a = { firstOut: 0, runnerUp: 0, finishSum: 0, finishCount: 0 };
      per.set(id, a);
    }
    return a;
  };

  let totalExploded = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const raw = r.input as EKInput | undefined;
    if (!raw) continue;

    const order = (raw.order ?? []).map(canonical);
    const winner = raw.winner ? canonical(raw.winner) : null;
    const players = [...new Set(Object.keys(r.deltas).map(canonical))];

    totalExploded += order.length;
    if (order.length) get(order[0]).firstOut += 1;

    // Finishing positions only make sense for a completed match (everyone but the
    // survivor exploded); guard so avg finish isn't skewed by a partial entry.
    const complete = !!winner && order.length === players.length - 1 && order.length > 0;
    if (complete) {
      const pos = finishingPositions({ winner, order }, players);
      for (const [id, p] of Object.entries(pos)) {
        const a = get(id);
        a.finishSum += p;
        a.finishCount += 1;
        if (p === 2) a.runnerUp += 1;
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.firstOut) {
      metrics.push({ key: 'ek_first', label: 'First to explode', value: `${a.firstOut}`, emoji: '💥' });
    }
    if (a.runnerUp) {
      metrics.push({ key: 'ek_runnerup', label: 'Runner-up', value: `${a.runnerUp}`, emoji: '🥈' });
    }
    if (a.finishCount) {
      metrics.push({
        key: 'ek_finish',
        label: 'Avg finish',
        value: fmtAvg(a.finishSum / a.finishCount),
        emoji: '🏁',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totalExploded) {
    global.push({ key: 'ek_boom', label: 'Kittens exploded', value: `${totalExploded}`, emoji: '💥' });
  }

  return { perPlayer, global };
}
