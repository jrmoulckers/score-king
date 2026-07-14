import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct } from '../../stats/format';
import { BAGS_PER_SIDE, type CornholeInput, type SideThrow, sideRaw } from './logic';

interface SideAgg {
  /** Bags sunk in the hole ("dranos"). */
  inHole: number;
  /** Bags landed on the board ("woodies"). */
  onBoard: number;
  /** Rounds where this side put all four bags in the hole. */
  fourBaggers: number;
  /** Rounds this side threw in. */
  rounds: number;
  /** Canonical player ids that made up this side (one for singles, two for doubles). */
  members: Set<ID>;
}

/**
 * Cornhole stats from each round's recorded bags. Pure and dependency-free (mirrors the
 * module's own `sideRaw`), so a finished game contributes stats the same way it scores.
 * A side's bags are credited to every player on that side, so in doubles both partners
 * carry the side's dranos and four-baggers — matching how the side banks its score. Global
 * totals count each side once. Legacy rounds (before the team builder) treated each side as
 * a single player, so their player-keyed `sides` map is read as one-member sides.
 */
export function cornholeStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  // Aggregated per SIDE (team). Keyed by team id (new shape) or player id (legacy).
  const per = new Map<string, SideAgg>();
  const get = (key: string): SideAgg => {
    let a = per.get(key);
    if (!a) {
      a = { inHole: 0, onBoard: 0, fourBaggers: 0, rounds: 0, members: new Set() };
      per.set(key, a);
    }
    return a;
  };

  let washes = 0;
  let scoredRounds = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as CornholeInput | undefined;
    if (!input) continue;

    // Resolve each round into (sideKey, members[], throw) tuples for both shapes.
    const sides: { key: string; members: ID[]; bag: SideThrow | undefined }[] = [];
    if (Array.isArray(input.teams) && input.teams.length) {
      for (const t of input.teams) {
        sides.push({ key: t.id, members: t.memberIds.map(canonical), bag: input.throws?.[t.id] });
      }
    } else if (input.sides) {
      for (const [pid, bag] of Object.entries(input.sides)) {
        const id = canonical(pid);
        sides.push({ key: id, members: [id], bag });
      }
    } else {
      continue;
    }

    const raws: number[] = [];
    for (const s of sides) {
      const a = get(s.key);
      const inHole = Math.max(0, Math.trunc(Number(s.bag?.inHole) || 0));
      const onBoard = Math.max(0, Math.trunc(Number(s.bag?.onBoard) || 0));
      a.inHole += inHole;
      a.onBoard += onBoard;
      a.rounds += 1;
      if (inHole >= BAGS_PER_SIDE) a.fourBaggers += 1;
      for (const m of s.members) a.members.add(m);
      raws.push(sideRaw(s.bag));
    }

    scoredRounds += 1;
    if (raws.length === 2 && raws[0] === raws[1]) washes += 1;
  }

  // Expand each side's aggregate onto its members for the per-player metrics.
  const perId = new Map<ID, SideAgg>();
  const mergeInto = (id: ID, a: SideAgg) => {
    let m = perId.get(id);
    if (!m) {
      m = { inHole: 0, onBoard: 0, fourBaggers: 0, rounds: 0, members: new Set([id]) };
      perId.set(id, m);
    }
    m.inHole += a.inHole;
    m.onBoard += a.onBoard;
    m.fourBaggers += a.fourBaggers;
    m.rounds += a.rounds;
  };

  let totalInHole = 0;
  let totalFourBaggers = 0;
  for (const a of per.values()) {
    // Global counts each side once (not once per member).
    totalInHole += a.inHole;
    totalFourBaggers += a.fourBaggers;
    for (const id of a.members) mergeInto(id, a);
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of perId) {
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
