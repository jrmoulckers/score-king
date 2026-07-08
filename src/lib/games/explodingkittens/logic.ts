import type { ID } from '../../types';

/**
 * Exploding Kittens is an *elimination* game: players draw until someone flips an
 * Exploding Kitten they can't Defuse — they're OUT — and play continues until a
 * single player is left standing, who wins the match. There are no points to add
 * up inside a match, so we model it against Score King's point-oriented contract
 * by making **one round = one match** and scoring a **match win as +1** for the
 * lone survivor (everyone else +0). Cumulative totals are therefore each player's
 * match-win tally, and the leaderboard is "most matches won". This file is pure
 * (no Svelte, no I/O) so `explodingkittens.test.ts` can exercise the real rules.
 */
export interface EKInput {
  /** The last player standing — the winner of this match. */
  winner: ID | null;
  /**
   * Elimination order, earliest first: `order[0]` was the first to explode (💥),
   * the final entry was the runner-up. Populated when "track elimination order"
   * is on; left empty when the group only records who survived.
   */
  order: ID[];
}

/** A fresh, empty match: nobody eliminated, no survivor crowned yet. */
export function emptyInput(): EKInput {
  return { winner: null, order: [] };
}

/**
 * Score one match: the survivor banks a match win (+1); everyone else scores 0 so
 * they still appear on the scorecard. Keyed over the match's players, not just the
 * winner, so `computeTotals` sees a delta for each seat.
 */
export function scoreMatch(input: EKInput, playerIds: ID[]): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = 0;
  if (input.winner && Object.prototype.hasOwnProperty.call(out, input.winner)) {
    out[input.winner] = 1;
  }
  return out;
}

/**
 * Validate a recorded match. When `trackOrder` is on we require a *complete*
 * elimination order — everyone but the survivor exploded, exactly how a real match
 * ends — which also gives clean finishing positions for stats. When it's off we
 * only need the survivor. Returns `null` when valid, else a human-readable reason.
 */
export function validateMatch(
  input: EKInput,
  playerIds: ID[],
  trackOrder: boolean,
): string | null {
  const known = new Set(playerIds);
  const seen = new Set<ID>();
  for (const id of input.order) {
    if (!known.has(id)) return 'Elimination order lists a player who isn’t in this game.';
    if (seen.has(id)) return 'A player can only explode once per match.';
    seen.add(id);
  }
  if (input.winner && seen.has(input.winner)) {
    return 'The survivor can’t also be in the elimination pile.';
  }

  if (trackOrder) {
    const remaining = playerIds.filter((id) => !seen.has(id));
    if (remaining.length > 1) {
      const left = remaining.length;
      return `Tap each kitten as they explode — ${left} still in play.`;
    }
    if (remaining.length === 0) {
      return 'Someone has to survive — bring the last kitten back in.';
    }
    if (!input.winner || input.winner !== remaining[0]) {
      return 'Crown the last kitten standing as the survivor.';
    }
    return null;
  }

  if (!input.winner) return 'Tap the last player standing to record the survivor.';
  if (!known.has(input.winner)) return 'The survivor must be one of the players.';
  return null;
}

/**
 * Match leaders: the player(s) with the most match wins. Ties return everyone tied
 * for the lead. Before anyone has won a match there is no leader, so return `[]`
 * rather than crowning the whole table.
 */
export function pickMatchLeaders(totals: Record<ID, number>): ID[] {
  const ids = Object.keys(totals);
  if (ids.length === 0) return [];
  const best = Math.max(...ids.map((id) => totals[id] ?? 0));
  if (best <= 0) return [];
  return ids.filter((id) => (totals[id] ?? 0) === best);
}

/**
 * Finishing positions for a match (1 = survivor). With `n` players, the player who
 * exploded first (`order[0]`) finishes last (`n`), the runner-up finishes 2nd, and
 * the survivor finishes 1st. Players outside `order`/`winner` are omitted.
 */
export function finishingPositions(input: EKInput, playerIds: ID[]): Record<ID, number> {
  const known = new Set(playerIds);
  const pos: Record<ID, number> = {};
  const order = input.order.filter((id) => known.has(id));
  const n = playerIds.length;
  order.forEach((id, i) => {
    pos[id] = n - i;
  });
  if (input.winner && known.has(input.winner)) pos[input.winner] = 1;
  return pos;
}

/** Read the number of matches to play; 0 (or unset) means open-ended. */
export function matchLimit(config: Record<string, unknown>): number | null {
  const m = Number(config.matches) || 0;
  return m > 0 ? m : null;
}
