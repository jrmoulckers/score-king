import type { ID } from '../../types';
import { shooter, type HeartsInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt, fmtPct } from '../../stats/format';

interface HeartsAgg {
  moons: number;
  queens: number;
  clean: number;
  rounds: number;
  /** Hands counted toward point averages — excludes moons, which flip scoring. */
  scored: number;
  /** Penalty points taken across scored hands. */
  points: number;
  /** Most points taken in a single (non-moon) hand. */
  worst: number;
}

/**
 * Hearts stats from each round's recorded hearts/♠Q. Lower-is-better, so a
 * "clean" round = took zero points. Pure; mirrors the module's own `shooter()`.
 * Moons are counted on their own but left out of the points averages, since
 * shooting the moon inverts the round and a raw 26 there isn't a "bad hand".
 */
export function heartsStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, HeartsAgg>();
  const get = (id: ID): HeartsAgg => {
    let a = per.get(id);
    if (!a) {
      a = { moons: 0, queens: 0, clean: 0, rounds: 0, scored: 0, points: 0, worst: 0 };
      per.set(id, a);
    }
    return a;
  };

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as HeartsInput | undefined;
    if (!input?.hearts) continue;
    const queenId = input.queen ? canonical(input.queen) : null;
    const moon = shooter(input);
    for (const [pid, h] of Object.entries(input.hearts)) {
      const id = canonical(pid);
      const a = get(id);
      a.rounds += 1;
      const tookQueen = queenId === id;
      if (tookQueen) a.queens += 1;
      const points = (Number(h) || 0) + (tookQueen ? 13 : 0);
      if (points === 0) a.clean += 1;
      // A moon flips the round on its head, so its raw 26 isn't a heavy hand —
      // keep it out of the "points eaten" averages.
      if (!moon) {
        a.scored += 1;
        a.points += points;
        if (points > a.worst) a.worst = points;
      }
    }
    if (moon) get(canonical(moon)).moons += 1;
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totMoons = 0;
  for (const [id, a] of per) {
    totMoons += a.moons;
    const metrics: Metric[] = [];
    if (a.moons)
      metrics.push({ key: 'h_moon', label: 'Moons shot', value: `${a.moons}`, emoji: '🌙' });
    if (a.queens)
      metrics.push({ key: 'h_queen', label: '♠Q taken', value: `${a.queens}`, emoji: '♠️' });
    if (a.rounds) {
      metrics.push({
        key: 'h_clean',
        label: 'Clean rounds',
        value: fmtPct(a.clean / a.rounds),
        emoji: '😇',
      });
    }
    if (a.scored) {
      metrics.push({
        key: 'h_avg',
        label: 'Avg per hand',
        value: fmtAvg(a.points / a.scored),
        emoji: '♥️',
      });
      metrics.push({ key: 'h_worst', label: 'Worst hand', value: fmtInt(a.worst), emoji: '😱' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totMoons)
    global.push({ key: 'h_moon_all', label: 'Moons shot', value: `${totMoons}`, emoji: '🌙' });
  return { perPlayer, global };
}
