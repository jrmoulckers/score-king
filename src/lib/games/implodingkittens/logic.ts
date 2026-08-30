import type { ID } from '../../types';

/**
 * Imploding Kittens is the Exploding Kittens expansion's *elimination* game, same
 * shape as the base deck: players draw until only one is left standing. The twist
 * is the Imploding Kitten — drawn face down it can't be Defused, so its drawer
 * secretly slips it back into the draw pile face up; the next player to draw it is
 * eliminated on the spot, no Nope, no defense. That changes *how* someone goes out,
 * never *whether* a match has a single survivor, so it fits Score King's contract
 * exactly like Exploding Kittens does: **one round = one match**, and a match win
 * banks **+1** for the lone survivor (everyone else +0). Cumulative totals are each
 * player's match-win tally, and the leaderboard is "most matches won". This file is
 * pure (no Svelte, no I/O) so `implodingkittens.test.ts` can exercise the real rules.
 */
export interface ImplodingKittensInput {
  /** The last player standing — the winner of this match. */
  winner: ID | null;
  /**
   * Elimination order, earliest first: `order[0]` was the first to implode (🕳️),
   * the final entry was the runner-up. Populated when "track elimination order"
   * is on; left empty when the group only records who survived.
   */
  order: ID[];
}

/** A fresh, empty match: nobody eliminated, no survivor crowned yet. */
export function emptyInput(): ImplodingKittensInput {
  return { winner: null, order: [] };
}

/**
 * Score one match: the survivor banks a match win (+1); everyone else scores 0 so
 * they still appear on the scorecard. Keyed over the match's players, not just the
 * winner, so `computeTotals` sees a delta for each seat.
 */
export function scoreMatch(input: ImplodingKittensInput, playerIds: ID[]): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = 0;
  if (input.winner && Object.prototype.hasOwnProperty.call(out, input.winner)) {
    out[input.winner] = 1;
  }
  return out;
}

/**
 * Validate a recorded match. When `trackOrder` is on we require a *complete*
 * elimination order — everyone but the survivor imploded, exactly how a real match
 * ends — which also gives clean finishing positions for stats. When it's off we
 * only need the survivor. Returns `null` when valid, else a human-readable reason.
 */
export function validateMatch(
  input: ImplodingKittensInput,
  playerIds: ID[],
  trackOrder: boolean,
): string | null {
  const known = new Set(playerIds);
  const seen = new Set<ID>();
  for (const id of input.order) {
    if (!known.has(id)) return 'Elimination order lists a player who isn’t in this game.';
    if (seen.has(id)) return 'A player can only implode once per match.';
    seen.add(id);
  }
  if (input.winner && seen.has(input.winner)) {
    return 'The survivor can’t also be in the elimination pile.';
  }

  if (trackOrder) {
    const remaining = playerIds.filter((id) => !seen.has(id));
    if (remaining.length > 1) {
      const left = remaining.length;
      return `Tap each kitten as they implode — ${left} still in play.`;
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
 * imploded first (`order[0]`) finishes last (`n`), the runner-up finishes 2nd, and
 * the survivor finishes 1st. Players outside `order`/`winner` are omitted.
 */
export function finishingPositions(
  input: ImplodingKittensInput,
  playerIds: ID[],
): Record<ID, number> {
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

/**
 * Read the target number of match wins that ends the game; 0 (or unset) means
 * open-ended. Unlike a round cap, this is checked against cumulative totals via
 * {@link isFinished} — the game ends the moment someone *reaches* the target, not
 * after a fixed number of matches have been played.
 */
export function targetWins(config: Record<string, unknown>): number {
  const t = Number(config.targetWins);
  return Number.isFinite(t) && t > 0 ? Math.floor(t) : 0;
}

/** True once any player's match-win total has reached the configured target. */
export function isFinished(totals: Record<ID, number>, config: Record<string, unknown>): boolean {
  const target = targetWins(config);
  if (target <= 0) return false;
  return Object.values(totals).some((v) => (v ?? 0) >= target);
}
