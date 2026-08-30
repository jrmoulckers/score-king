import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct } from '../../stats/format';
import { scoreRow, type WizardInput } from './logic';

interface WizardAgg {
  bids: number;
  hits: number;
  zeroBids: number;
  zeroHits: number;
  bestRound: number;
  worstRound: number;
}

/**
 * Wizard stats, replayed purely from each round's recorded bids/tricks. A bid
 * is "hit" when tricks === bid. Pure — no Svelte, no I/O — so it's independently
 * unit-testable and safe for the stats engine to import.
 */
export function wizardStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, WizardAgg>();
  const get = (id: ID): WizardAgg => {
    let a = per.get(id);
    if (!a) {
      a = { bids: 0, hits: 0, zeroBids: 0, zeroHits: 0, bestRound: -Infinity, worstRound: Infinity };
      per.set(id, a);
    }
    return a;
  };

  let totBids = 0;
  let totHits = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as WizardInput | undefined;
    if (!input?.rows) continue;
    for (const [pid, row] of Object.entries(input.rows)) {
      const a = get(canonical(pid));
      const bid = Number(row.bid) || 0;
      const tricks = Number(row.tricks) || 0;
      const hit = bid === tricks;
      a.bids += 1;
      totBids += 1;
      if (hit) {
        a.hits += 1;
        totHits += 1;
      }
      if (bid === 0) {
        a.zeroBids += 1;
        if (hit) a.zeroHits += 1;
      }
      const delta = scoreRow(row);
      if (delta > a.bestRound) a.bestRound = delta;
      if (delta < a.worstRound) a.worstRound = delta;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.bids) {
      metrics.push({
        key: 'wz_acc',
        label: 'Bids nailed',
        value: fmtPct(a.hits / a.bids),
        emoji: '🎯',
      });
    }
    if (a.zeroBids) {
      metrics.push({
        key: 'wz_zero',
        label: 'Zero-bid success',
        value: `${a.zeroHits}/${a.zeroBids}`,
        emoji: '🫙',
      });
    }
    if (a.bestRound > -Infinity) {
      metrics.push({
        key: 'wz_best',
        label: 'Best round',
        value: `+${fmtInt(a.bestRound)}`,
        emoji: '✨',
      });
    }
    if (a.worstRound < Infinity && a.worstRound < 0) {
      metrics.push({
        key: 'wz_worst',
        label: 'Worst round',
        value: fmtInt(a.worstRound),
        emoji: '💥',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totBids) {
    global.push({
      key: 'wz_acc_all',
      label: 'Bids nailed',
      value: fmtPct(totHits / totBids),
      emoji: '🎯',
    });
  }

  return { perPlayer, global };
}
