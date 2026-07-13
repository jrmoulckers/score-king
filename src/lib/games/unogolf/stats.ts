import type { ID } from '../../types';
import type { UnoGolfInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt } from '../../stats/format';

interface UGAgg {
  /** Holes the member appeared in. */
  holes: number;
  /** Holes they sank (went out → 0 strokes). */
  sunk: number;
  /** Total strokes accumulated across holes. */
  strokes: number;
  /** Fewest strokes carried on a single hole — their best hole. */
  best: number;
  /** Wild cards (Wild / Wild Draw Four) left in hand across holes — the pricey ones. */
  wilds: number;
}

/**
 * Uno Golf stats, derived purely from each hole's recorded hands. Strokes come
 * straight from the round's stored deltas (already scored with that game's card
 * values), so they stay correct regardless of a game's action/wild config. Pure —
 * no Svelte — so it's independently unit-testable and safe for the engine.
 */
export function unogolfStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, UGAgg>();
  const get = (id: ID): UGAgg => {
    let a = per.get(id);
    if (!a) {
      a = { holes: 0, sunk: 0, strokes: 0, best: Infinity, wilds: 0 };
      per.set(id, a);
    }
    return a;
  };

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as UnoGolfInput | undefined;
    if (!input?.hands) continue;
    for (const [pid, hand] of Object.entries(input.hands)) {
      const a = get(canonical(pid));
      a.holes += 1;
      const strokes = Number(r.deltas?.[pid]) || 0;
      a.strokes += strokes;
      if (strokes < a.best) a.best = strokes;
      a.wilds += Math.max(0, Number(hand?.wilds) || 0);
    }
    if (input.out) get(canonical(input.out)).sunk += 1;
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totSunk = 0;
  let courseRecord = Infinity;
  for (const [id, a] of per) {
    totSunk += a.sunk;
    if (a.holes && a.best < courseRecord) courseRecord = a.best;
    const metrics: Metric[] = [];
    if (a.holes) {
      metrics.push({
        key: 'ug_avg',
        label: 'Scoring average',
        value: fmtAvg(a.strokes / a.holes),
        sub: 'strokes per hole',
        emoji: '📊',
      });
      metrics.push({
        key: 'ug_best',
        label: 'Best hole',
        value: fmtInt(a.best),
        sub: 'fewest strokes',
        emoji: '🏌️',
      });
    }
    if (a.sunk) {
      metrics.push({ key: 'ug_sunk', label: 'Holes sunk', value: fmtInt(a.sunk), emoji: '⛳' });
    }
    if (a.wilds) {
      metrics.push({ key: 'ug_wilds', label: 'Wilds caught', value: fmtInt(a.wilds), emoji: '🌈' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totSunk) {
    global.push({ key: 'ug_sunk_all', label: 'Holes sunk', value: fmtInt(totSunk), emoji: '⛳' });
  }
  if (Number.isFinite(courseRecord)) {
    global.push({ key: 'ug_record', label: 'Best hole', value: fmtInt(courseRecord), emoji: '🏌️' });
  }
  return { perPlayer, global };
}
