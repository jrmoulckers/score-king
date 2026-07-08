import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';
import { scoreRow, type FinspanInput } from './logic';

interface FSAgg {
  games: number;
  sum: number;
  best: number;
  schools: number;
  eggsYoung: number;
}

/**
 * Finspan stats, derived purely from each game's single final scoresheet. A Finspan
 * game is one round (the scoresheet), so every recorded round is a full game total.
 * Pure — no Svelte — so it is independently unit-testable and safe for the engine.
 */
export function finspanStats({ games, rounds, players, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const per = new Map<ID, FSAgg>();
  const get = (id: ID): FSAgg => {
    let a = per.get(id);
    if (!a) {
      a = { games: 0, sum: 0, best: 0, schools: 0, eggsYoung: 0 };
      per.set(id, a);
    }
    return a;
  };

  let topScore = 0;
  let topHolder: ID | undefined;
  let winSum = 0;
  let winGames = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as FinspanInput | undefined;
    if (!input?.values) continue;
    let gameBest = -Infinity;
    for (const [pid, row] of Object.entries(input.values)) {
      const id = canonical(pid);
      const a = get(id);
      const total = scoreRow(row);
      a.games += 1;
      a.sum += total;
      if (total > a.best) a.best = total;
      a.schools += Number(row?.schools) || 0;
      a.eggsYoung += Number(row?.eggsYoung) || 0;
      if (total > topScore) {
        topScore = total;
        topHolder = id;
      }
      if (total > gameBest) gameBest = total;
    }
    if (gameBest > -Infinity) {
      winSum += gameBest;
      winGames += 1;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    if (!a.games) continue;
    const metrics: Metric[] = [
      { key: 'fs_avg', label: 'Avg ocean', value: fmtInt(a.sum / a.games), emoji: '🐟' },
      { key: 'fs_best', label: 'Best ocean', value: fmtInt(a.best), emoji: '⭐' },
    ];
    if (a.schools) {
      metrics.push({ key: 'fs_schools', label: 'Schools formed', value: fmtInt(a.schools), emoji: '🐠' });
    }
    perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (winGames) {
    global.push({ key: 'fs_avgwin', label: 'Avg winning ocean', value: fmtInt(winSum / winGames), emoji: '🏅' });
  }
  if (topHolder) {
    global.push({ key: 'fs_top', label: 'Deepest ocean', value: fmtInt(topScore), sub: nameById.get(topHolder), emoji: '🐟' });
  }
  return { perPlayer, global };
}
