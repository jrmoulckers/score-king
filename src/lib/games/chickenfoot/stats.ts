import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt } from '../../stats/format';
import type { ChickenFootInput } from './logic';

interface CFAgg {
  rounds: number;
  out: number;
  blanks: number;
  pips: number;
}

/**
 * Chicken Foot stats, derived purely from each round's recorded hand. Lower-is-better,
 * so a tight average hand and a habit of going out are the marks of a strong player.
 * Pure — no Svelte — so it's independently testable and safe for the engine to import.
 */
export function chickenfootStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, CFAgg>();
  const get = (id: ID): CFAgg => {
    let a = per.get(id);
    if (!a) {
      a = { rounds: 0, out: 0, blanks: 0, pips: 0 };
      per.set(id, a);
    }
    return a;
  };

  let totalOut = 0;
  let biggestHand = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as ChickenFootInput | undefined;
    if (!input?.pips) continue;

    const outId = input.outId ? canonical(input.outId) : null;
    const blankId = input.blankId ? canonical(input.blankId) : null;

    for (const [pid, pips] of Object.entries(input.pips)) {
      const id = canonical(pid);
      const a = get(id);
      a.rounds += 1;
      a.pips += Math.max(0, Number(pips) || 0);
      if (outId === id) a.out += 1;
      if (blankId === id) a.blanks += 1;
    }
    if (outId) totalOut += 1;

    for (const v of Object.values(r.deltas ?? {})) {
      if (v > biggestHand) biggestHand = v;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.out) metrics.push({ key: 'cf_out', label: 'Went out', value: fmtInt(a.out), emoji: '🐔' });
    if (a.blanks) {
      metrics.push({ key: 'cf_blank', label: 'Goose egg caught', value: fmtInt(a.blanks), emoji: '🥚' });
    }
    if (a.rounds) {
      metrics.push({ key: 'cf_pips', label: 'Avg pips left', value: fmtAvg(a.pips / a.rounds), emoji: '✋' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totalOut) global.push({ key: 'cf_out_all', label: 'Times gone out', value: fmtInt(totalOut), emoji: '🐔' });
  if (biggestHand > 0) {
    global.push({ key: 'cf_big', label: 'Biggest hand left', value: fmtInt(biggestHand), emoji: '💥' });
  }
  return { perPlayer, global };
}
