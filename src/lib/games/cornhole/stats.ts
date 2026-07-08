import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct } from '../../stats/format';
import { BAGS_PER_SIDE, type CornholeInput, sideRaw } from './logic';

interface SideAgg {
  /** Bags sunk in the hole ("dranos"). */
  inHole: number;
  /** Bags landed on the board ("woodies"). */
  onBoard: number;
  /** Rounds where this side put all four bags in the hole. */
  fourBaggers: number;
  /** Rounds this side threw in. */
  rounds: number;
}

/**
 * Cornhole stats from each round's recorded bags. Pure and dependency-free (mirrors the
 * module's own `sideRaw`), so a finished game contributes stats the same way it scores.
 * Every "player" here is a SIDE (1v1 or 2v2), matching how the game is modeled.
 */
export function cornholeStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, SideAgg>();
  const get = (id: ID): SideAgg => {
    let a = per.get(id);
    if (!a) {
      a = { inHole: 0, onBoard: 0, fourBaggers: 0, rounds: 0 };
      per.set(id, a);
    }
    return a;
  };

  let washes = 0;
  let scoredRounds = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as CornholeInput | undefined;
    if (!input?.sides) continue;

    const raws: number[] = [];
    for (const [pid, t] of Object.entries(input.sides)) {
      const id = canonical(pid);
      const a = get(id);
      const inHole = Math.max(0, Math.trunc(Number(t?.inHole) || 0));
      const onBoard = Math.max(0, Math.trunc(Number(t?.onBoard) || 0));
      a.inHole += inHole;
      a.onBoard += onBoard;
      a.rounds += 1;
      if (inHole >= BAGS_PER_SIDE) a.fourBaggers += 1;
      raws.push(sideRaw(t));
    }

    scoredRounds += 1;
    if (raws.length === 2 && raws[0] === raws[1]) washes += 1;
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totalInHole = 0;
  let totalFourBaggers = 0;

  for (const [id, a] of per) {
    totalInHole += a.inHole;
    totalFourBaggers += a.fourBaggers;
    const metrics: Metric[] = [];
    if (a.inHole) metrics.push({ key: 'ch_hole', label: 'Bags in the hole', value: fmtInt(a.inHole), emoji: '🕳️' });
    if (a.fourBaggers) metrics.push({ key: 'ch_four', label: 'Four-baggers', value: fmtInt(a.fourBaggers), emoji: '💣' });
    const bags = a.inHole + a.onBoard;
    if (bags) metrics.push({ key: 'ch_acc', label: 'On-target bags', value: fmtPct((a.inHole + a.onBoard) / (a.rounds * BAGS_PER_SIDE)), emoji: '🎯' });
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totalInHole) global.push({ key: 'ch_hole_all', label: 'Bags in the hole', value: fmtInt(totalInHole), emoji: '🕳️' });
  if (totalFourBaggers) global.push({ key: 'ch_four_all', label: 'Four-baggers', value: fmtInt(totalFourBaggers), emoji: '💣' });
  if (scoredRounds) global.push({ key: 'ch_wash', label: 'Washed rounds', value: fmtPct(washes / scoredRounds), emoji: '🧺' });

  return { perPlayer, global };
}
