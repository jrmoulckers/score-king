import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';
import { gardensPoints, scoreRow, type DominionInput } from './logic';

interface DomAgg {
  games: number;
  sum: number;
  best: number;
  provinces: number;
  curses: number;
  gardensPts: number;
}

/**
 * Dominion stats, derived purely from each game's single final scoresheet. A Dominion
 * game is one round (the scoresheet), so every recorded round is a full game total.
 * Pure — no Svelte — so it is independently unit-testable and safe for the engine.
 */
export function dominionStats({
  games,
  rounds,
  players,
  canonical,
}: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const per = new Map<ID, DomAgg>();
  const get = (id: ID): DomAgg => {
    let a = per.get(id);
    if (!a) {
      a = { games: 0, sum: 0, best: 0, provinces: 0, curses: 0, gardensPts: 0 };
      per.set(id, a);
    }
    return a;
  };

  let topScore = -Infinity;
  let topHolder: ID | undefined;
  let winSum = 0;
  let winGames = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as DominionInput | undefined;
    if (!input?.values) continue;
    let gameBest = -Infinity;
    for (const [pid, row] of Object.entries(input.values)) {
      const id = canonical(pid);
      const a = get(id);
      const total = scoreRow(row);
      a.games += 1;
      a.sum += total;
      if (total > a.best) a.best = total;
      a.provinces += Number(row?.provinces) || 0;
      a.curses += Number(row?.curses) || 0;
      a.gardensPts += gardensPoints(row);
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
      { key: 'dm_avg', label: 'Avg VP', value: fmtInt(a.sum / a.games), emoji: '🏰' },
      { key: 'dm_best', label: 'Best VP', value: fmtInt(a.best), emoji: '⭐' },
    ];
    if (a.provinces) {
      metrics.push({
        key: 'dm_provinces',
        label: 'Provinces claimed',
        value: fmtInt(a.provinces),
        emoji: '⭐',
      });
    }
    if (a.curses) {
      metrics.push({ key: 'dm_curses', label: 'Curses taken', value: fmtInt(a.curses), emoji: '💀' });
    }
    perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (winGames) {
    global.push({
      key: 'dm_avgwin',
      label: 'Avg winning VP',
      value: fmtInt(winSum / winGames),
      emoji: '🏅',
    });
  }
  if (topHolder) {
    global.push({
      key: 'dm_top',
      label: 'Grandest estate',
      value: fmtInt(topScore),
      sub: nameById.get(topHolder),
      emoji: '🏰',
    });
  }
  return { perPlayer, global };
}
