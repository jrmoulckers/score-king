import type { ID } from '../../types';
import type { SKInput } from './index';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct } from '../../stats/format';

interface SKAgg {
  bids: number;
  made: number;
  zero: number;
  zeroMade: number;
  bonus: number;
}

/**
 * Skull King stats, derived purely from each round's recorded bids/tricks.
 * A bid is "made" when actual === bid; round n has n tricks. Pure — no Svelte,
 * so it's independently unit-testable and safe for the engine to import.
 */
export function skullkingStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, SKAgg>();
  const get = (id: ID): SKAgg => {
    let a = per.get(id);
    if (!a) {
      a = { bids: 0, made: 0, zero: 0, zeroMade: 0, bonus: 0 };
      per.set(id, a);
    }
    return a;
  };

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as SKInput | undefined;
    if (!input?.rows) continue;
    for (const [pid, row] of Object.entries(input.rows)) {
      const a = get(canonical(pid));
      const bid = Number(row.bid) || 0;
      const actual = Number(row.actual) || 0;
      const made = actual === bid;
      a.bids += 1;
      if (made) a.made += 1;
      if (bid === 0) {
        a.zero += 1;
        if (made) a.zeroMade += 1;
      }
      a.bonus += Number(row.bonus) || 0;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totBids = 0;
  let totMade = 0;
  for (const [id, a] of per) {
    totBids += a.bids;
    totMade += a.made;
    const metrics: Metric[] = [];
    if (a.bids) {
      metrics.push({ key: 'sk_acc', label: 'Bid accuracy', value: fmtPct(a.made / a.bids), emoji: '🎯' });
    }
    if (a.zero) {
      metrics.push({ key: 'sk_zero', label: 'Zero-bid success', value: `${a.zeroMade}/${a.zero}`, emoji: '🥚' });
    }
    if (a.bonus) {
      metrics.push({ key: 'sk_bonus', label: 'Bonus hunted', value: fmtInt(a.bonus), emoji: '💰' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totBids) {
    global.push({ key: 'sk_acc_all', label: 'Bid accuracy', value: fmtPct(totMade / totBids), emoji: '🎯' });
  }
  return { perPlayer, global };
}
