import type { ID, Round } from './types';

export function computeTotals(rounds: Round[], playerIds: ID[]): Record<ID, number> {
  const totals: Record<ID, number> = {};
  for (const id of playerIds) totals[id] = 0;
  for (const r of rounds) {
    for (const [id, d] of Object.entries(r.deltas)) {
      totals[id] = (totals[id] ?? 0) + d;
    }
  }
  return totals;
}

export interface Standing {
  playerId: ID;
  total: number;
  rank: number;
}

export function standings(
  totals: Record<ID, number>,
  lowerIsBetter = false,
): Standing[] {
  const entries = Object.entries(totals).map(([playerId, total]) => ({ playerId, total }));
  entries.sort((a, b) => (lowerIsBetter ? a.total - b.total : b.total - a.total));
  const out: Standing[] = [];
  let rank = 0;
  let prev: number | null = null;
  entries.forEach((e, i) => {
    if (prev === null || e.total !== prev) {
      rank = i + 1;
      prev = e.total;
    }
    out.push({ ...e, rank });
  });
  return out;
}
