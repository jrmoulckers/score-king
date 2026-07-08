import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt } from '../../stats/format';
import { scoreRow, type WingspanInput } from './logic';

interface WSAgg {
  games: number;
  total: number;
  birds: number;
  eggs: number;
  best: number;
}

/**
 * Wingspan stats, derived purely from each recorded scoresheet — no Svelte, so it's
 * independently unit-testable and safe for the engine to import. Mirrors `skullkingStats`:
 * one aggregate per canonical member, folded into per-player + global metrics.
 */
export function wingspanStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, WSAgg>();
  const get = (id: ID): WSAgg => {
    let a = per.get(id);
    if (!a) {
      a = { games: 0, total: 0, birds: 0, eggs: 0, best: 0 };
      per.set(id, a);
    }
    return a;
  };

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as WingspanInput | undefined;
    if (!input?.rows) continue;
    for (const [pid, row] of Object.entries(input.rows)) {
      const a = get(canonical(pid));
      const total = scoreRow(row);
      a.games += 1;
      a.total += total;
      a.birds += Number(row?.birds) || 0;
      a.eggs += Number(row?.eggs) || 0;
      if (total > a.best) a.best = total;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let grandTotal = 0;
  let grandGames = 0;
  let highScore = 0;
  for (const [id, a] of per) {
    if (!a.games) continue;
    grandTotal += a.total;
    grandGames += a.games;
    if (a.best > highScore) highScore = a.best;

    const metrics: Metric[] = [
      { key: 'ws_avg', label: 'Avg score', value: fmtAvg(a.total / a.games), emoji: '🪶' },
      { key: 'ws_birds', label: 'Avg birds', value: fmtAvg(a.birds / a.games), emoji: '🐦' },
      { key: 'ws_eggs', label: 'Avg eggs', value: fmtAvg(a.eggs / a.games), emoji: '🥚' },
      { key: 'ws_best', label: 'Best game', value: fmtInt(a.best), emoji: '⭐' },
    ];
    perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (grandGames) {
    global.push({ key: 'ws_avg_all', label: 'Avg final score', value: fmtAvg(grandTotal / grandGames), emoji: '🪶' });
    global.push({ key: 'ws_high', label: 'High score', value: fmtInt(highScore), emoji: '⭐' });
  }
  return { perPlayer, global };
}
