import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct } from '../../stats/format';
import { resolveMode, scoreGame, unitsFor, type SpadesInput } from './logic';

interface SpadesAgg {
  /** Unit-hands this member took part in. */
  hands: number;
  contractsMade: number;
  /** Bags their unit accrued (shared with a partner). */
  bags: number;
  nilTries: number;
  nilMade: number;
  blindTries: number;
  blindMade: number;
}

/**
 * Spades stats, replayed purely from each game's recorded bids + tricks. Contract
 * accuracy and bags are team outcomes shared by both partners; nils are personal.
 * No Svelte, no I/O — independently unit-testable and safe for the stats engine.
 */
export function spadesStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const per = new Map<ID, SpadesAgg>();
  const get = (id: ID): SpadesAgg => {
    let a = per.get(id);
    if (!a) {
      a = { hands: 0, contractsMade: 0, bags: 0, nilTries: 0, nilMade: 0, blindTries: 0, blindMade: 0 };
      per.set(id, a);
    }
    return a;
  };

  let unitHands = 0;
  let unitMade = 0;
  let totalBags = 0;

  for (const g of games) {
    const seats = g.playerIds.map((id) => ({ id }));
    const inputs = rounds
      .filter((r) => r.gameId === g.id)
      .sort((a, b) => a.index - b.index)
      .map((r) => r.input as SpadesInput);
    if (!inputs.length) continue;

    const units = unitsFor(seats, resolveMode(g.config, seats.length));
    const outcomes = scoreGame(inputs, seats, g.config);

    for (const outcome of outcomes) {
      for (const u of units) {
        const res = outcome.perUnit[u.key];
        if (!res) continue;
        unitHands += 1;
        if (res.made) unitMade += 1;
        totalBags += res.bags;
        for (const mid of u.memberIds) {
          const a = get(canonical(mid));
          a.hands += 1;
          if (res.made) a.contractsMade += 1;
          a.bags += res.bags;
        }
      }
    }

    for (const input of inputs) {
      for (const [pid, row] of Object.entries(input?.rows ?? {})) {
        const a = get(canonical(pid));
        const took = (Number(row.tricks) || 0) === 0;
        if (row.nil === 'nil') {
          a.nilTries += 1;
          if (took) a.nilMade += 1;
        } else if (row.nil === 'blind') {
          a.blindTries += 1;
          if (took) a.blindMade += 1;
        }
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totNilTries = 0;
  let totNilMade = 0;
  for (const [id, a] of per) {
    totNilTries += a.nilTries + a.blindTries;
    totNilMade += a.nilMade + a.blindMade;
    const metrics: Metric[] = [];
    if (a.hands) {
      metrics.push({ key: 'sp_acc', label: 'Contracts made', value: fmtPct(a.contractsMade / a.hands), emoji: '🎯' });
    }
    if (a.nilTries) {
      metrics.push({ key: 'sp_nil', label: 'Nils nailed', value: `${a.nilMade}/${a.nilTries}`, emoji: '🚫' });
    }
    if (a.blindTries) {
      metrics.push({ key: 'sp_blind', label: 'Blind nils', value: `${a.blindMade}/${a.blindTries}`, emoji: '🙈' });
    }
    if (a.bags) {
      metrics.push({ key: 'sp_bags', label: 'Bags collected', value: fmtInt(a.bags), emoji: '🛍️' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (unitHands) {
    global.push({ key: 'sp_acc_all', label: 'Contracts made', value: fmtPct(unitMade / unitHands), emoji: '🎯' });
  }
  if (totalBags) global.push({ key: 'sp_bags_all', label: 'Bags collected', value: fmtInt(totalBags), emoji: '🛍️' });
  if (totNilTries) global.push({ key: 'sp_nil_all', label: 'Nils nailed', value: `${totNilMade}/${totNilTries}`, emoji: '🚫' });

  return { perPlayer, global };
}
