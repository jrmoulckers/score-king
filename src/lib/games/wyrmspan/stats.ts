import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt } from '../../stats/format';
import { cleanValue, scoreRow, type WyrmspanInput } from './logic';

interface WyrmAgg {
  games: number;
  dragonVP: number;
  eggs: number;
  cached: number;
  tucked: number;
  best: number;
}

/**
 * Wyrmspan stats, derived purely from each game's final scoresheet. Category counts
 * (dragon VP, eggs, tucked) come straight from the recorded entries; the best score
 * prefers the round's recorded deltas (config-correct) and falls back to a recompute.
 * Pure — no Svelte — so it's independently testable and safe for the engine to import.
 */
export function wyrmspanStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, WyrmAgg>();
  const get = (id: ID): WyrmAgg => {
    let a = per.get(id);
    if (!a) {
      a = { games: 0, dragonVP: 0, eggs: 0, cached: 0, tucked: 0, best: 0 };
      per.set(id, a);
    }
    return a;
  };

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as WyrmspanInput | undefined;
    if (!input?.rows) continue;
    const deltas = r.deltas ?? {};
    for (const [pid, row] of Object.entries(input.rows)) {
      if (!row) continue;
      const a = get(canonical(pid));
      a.games += 1;
      a.dragonVP += cleanValue(row.dragons);
      a.eggs += cleanValue(row.eggs);
      a.cached += cleanValue(row.cached);
      a.tucked += cleanValue(row.tucked);
      const score = pid in deltas ? deltas[pid] : scoreRow(row);
      if (score > a.best) a.best = score;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totGames = 0;
  let topScore = 0;
  for (const [id, a] of per) {
    if (!a.games) continue;
    totGames += a.games;
    if (a.best > topScore) topScore = a.best;
    const metrics: Metric[] = [
      { key: 'wy_dragons', label: 'Dragon VP / game', value: fmtAvg(a.dragonVP / a.games), emoji: '🐉' },
      { key: 'wy_best', label: 'Best hoard', value: fmtInt(a.best), emoji: '🏆' },
    ];
    if (a.eggs) metrics.push({ key: 'wy_eggs', label: 'Eggs laid', value: fmtInt(a.eggs), emoji: '🥚' });
    if (a.tucked) metrics.push({ key: 'wy_tucked', label: 'Cards tucked', value: fmtInt(a.tucked), emoji: '🗂️' });
    perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (topScore > 0) {
    global.push({ key: 'wy_top', label: 'Biggest hoard', value: fmtInt(topScore), emoji: '🐲' });
  }
  if (totGames > 0) {
    global.push({ key: 'wy_games', label: 'Scoresheets tallied', value: fmtInt(totGames), emoji: '📜' });
  }
  return { perPlayer, global };
}
