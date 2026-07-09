import type { ID, Round } from './types';

export function computeTotals(rounds: Round[], playerIds: ID[]): Record<ID, number> {
  const totals: Record<ID, number> = {};
  for (const id of playerIds) totals[id] = 0;
  for (const r of rounds) {
    for (const [id, d] of Object.entries(r.deltas)) {
      totals[id] = (totals[id] ?? 0) + d;
    }
  }
  return totals;
}

/**
 * The best total among the players who did *not* win — the runner-up's score.
 * Used to show a glanceable margin of victory ("won by N") in History without
 * re-reading a game's rounds. Returns `undefined` when there is no non-winner to
 * compare against (a solo game, or an all-tie where everyone is a winner).
 */
export function runnerUpTotal(
  totals: Record<ID, number>,
  winnerIds: ID[],
  lowerIsBetter = false,
): number | undefined {
  const winners = new Set(winnerIds);
  const others = Object.keys(totals).filter((id) => !winners.has(id));
  if (others.length === 0) return undefined;
  const vals = others.map((id) => totals[id] ?? 0);
  return lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
}

export interface Standing {
  playerId: ID;
  total: number;
  rank: number;
}

/**
 * The player ID(s) strictly ahead of everyone else — the current leader(s).
 *
 * Returns an empty set until scores actually diverge: while every player shares
 * the same total (including the opening 0-0, or any mid-game all-tie) there is
 * no leader yet, so the 👑 and the gold `.lead` number stay hidden. A solo game
 * has no rival to lead, so it also returns empty. This is the single source of
 * truth for "who gets Crown Gold right now" so the scarcity rule can't drift
 * between the scoreboard and the scorecard footer.
 */
export function leaders(
  totals: Record<ID, number>,
  playerIds: ID[],
  lowerIsBetter = false,
): Set<ID> {
  const ids = new Set<ID>();
  if (playerIds.length < 2) return ids;
  const vals = playerIds.map((id) => totals[id] ?? 0);
  const best = lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
  if (vals.every((v) => v === best)) return ids; // nobody has pulled ahead
  for (const id of playerIds) if ((totals[id] ?? 0) === best) ids.add(id);
  return ids;
}

export function standings(
  totals: Record<ID, number>,
  lowerIsBetter = false,
): Standing[] {
  const entries = Object.entries(totals).map(([playerId, total]) => ({ playerId, total }));
  entries.sort((a, b) => (lowerIsBetter ? a.total - b.total : b.total - a.total));
  const out: Standing[] = [];
  let rank = 0;
  let prev: number | null = null;
  entries.forEach((e, i) => {
    if (prev === null || e.total !== prev) {
      rank = i + 1;
      prev = e.total;
    }
    out.push({ ...e, rank });
  });
  return out;
}
