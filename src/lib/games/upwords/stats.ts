import type { ID } from '../../types';
import type { UpwordsInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';

interface UWAgg {
  /** Biggest single-turn score this member posted. */
  bestTurn: number;
  /** Turns this member played with a bingo (all 7 tiles). */
  bingos: number;
  /** Total end-of-game rack penalty points this member absorbed (positive count). */
  tilesStranded: number;
}

/**
 * Upwords stats derived purely from each recorded round's input + delta. Pure — no
 * Svelte — so it's independently unit-testable and safe for the stats engine to import.
 */
export function upwordsStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, UWAgg>();
  const get = (id: ID): UWAgg => {
    let a = per.get(id);
    if (!a) {
      a = { bestTurn: 0, bingos: 0, tilesStranded: 0 };
      per.set(id, a);
    }
    return a;
  };

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as UpwordsInput | undefined;
    if (!input) continue;

    if (input.mode === 'endgame') {
      for (const [pid, tiles] of Object.entries(input.unplayedTiles ?? {})) {
        const n = Math.max(0, Math.round(Number(tiles) || 0));
        if (n > 0) get(canonical(pid)).tilesStranded += n;
      }
      continue;
    }

    if (!input.activePlayerId) continue;
    const agg = get(canonical(input.activePlayerId));
    const score = Number(r.deltas?.[input.activePlayerId]) || 0;
    if (score > agg.bestTurn) agg.bestTurn = score;
    if (input.bingo) agg.bingos += 1;
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let biggestTurn = 0;
  let totalBingos = 0;
  for (const [id, a] of per) {
    if (a.bestTurn > biggestTurn) biggestTurn = a.bestTurn;
    totalBingos += a.bingos;
    const metrics: Metric[] = [];
    if (a.bestTurn) {
      metrics.push({
        key: 'uw_best_turn',
        label: 'Best turn',
        value: `+${fmtInt(a.bestTurn)}`,
        emoji: '🗼',
      });
    }
    if (a.bingos) {
      metrics.push({ key: 'uw_bingo', label: 'Bingos', value: fmtInt(a.bingos), emoji: '🎉' });
    }
    if (a.tilesStranded) {
      metrics.push({
        key: 'uw_stranded',
        label: 'Tiles stranded',
        value: fmtInt(a.tilesStranded),
        emoji: '🔤',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (biggestTurn) {
    global.push({
      key: 'uw_best_turn_all',
      label: 'Biggest turn',
      value: `+${fmtInt(biggestTurn)}`,
      emoji: '🗼',
    });
  }
  if (totalBingos) {
    global.push({ key: 'uw_bingo_all', label: 'Bingos', value: fmtInt(totalBingos), emoji: '🎉' });
  }
  return { perPlayer, global };
}
