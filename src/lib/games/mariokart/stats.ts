import type { ID } from '../../types';
import type { MarioKartInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt, fmtPct } from '../../stats/format';

interface MKAgg {
  races: number;
  finishSum: number;
  wins: number;
  podiums: number;
  best: number;
}

/**
 * Mario Kart stats, derived purely from each race's recorded finishing positions.
 * Position 1 is a race win; positions 1–3 are podiums; average finish is the mean
 * spot across every race a racer entered. Pure — no Svelte — so it's unit-testable
 * and safe for the stats engine to import.
 */
export function mariokartStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, MKAgg>();
  const get = (id: ID): MKAgg => {
    let a = per.get(id);
    if (!a) {
      a = { races: 0, finishSum: 0, wins: 0, podiums: 0, best: Infinity };
      per.set(id, a);
    }
    return a;
  };

  let races = 0;
  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as MarioKartInput | undefined;
    if (!input?.positions) continue;
    races += 1;
    for (const [pid, raw] of Object.entries(input.positions)) {
      const pos = Math.floor(Number(raw) || 0);
      if (pos < 1) continue;
      const a = get(canonical(pid));
      a.races += 1;
      a.finishSum += pos;
      if (pos === 1) a.wins += 1;
      if (pos <= 3) a.podiums += 1;
      if (pos < a.best) a.best = pos;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totWins = 0;
  for (const [id, a] of per) {
    totWins += a.wins;
    if (!a.races) continue;
    const metrics: Metric[] = [
      { key: 'mk_avg', label: 'Avg finish', value: fmtAvg(a.finishSum / a.races), emoji: '🏎️' },
    ];
    if (a.wins) {
      metrics.push({ key: 'mk_wins', label: 'Race wins', value: fmtInt(a.wins), emoji: '🥇' });
    }
    metrics.push({ key: 'mk_pod', label: 'Podium rate', value: fmtPct(a.podiums / a.races), emoji: '🏅' });
    perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (races) global.push({ key: 'mk_races', label: 'Races run', value: fmtInt(races), emoji: '🏁' });
  if (totWins) global.push({ key: 'mk_wins_all', label: 'Race wins', value: fmtInt(totWins), emoji: '🥇' });
  return { perPlayer, global };
}
