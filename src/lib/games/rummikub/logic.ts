import type { ID } from '../../types';

/**
 * Pure Rummikub scoring — no Svelte, no I/O — so `index.ts` and `rummikub.test.ts`
 * both import the *real* scoring functions. Rummikub is scored per round: when a
 * player goes out ("Rummikub!") the round ends and
 *
 *   • the winner scores the **sum of every opponent's leftover tile value** (positive), and
 *   • every other player scores the **negative of the tiles left on their own rack**.
 *
 * A numbered tile is worth its face value; a stranded joker is worth `jokerValue`
 * (30 by the official rules, house-configurable). The round is zero-sum by
 * construction: the winner's gain equals exactly what the table loses.
 */

/** The tiles a single player is caught holding when the round ends. */
export interface RummikubHand {
  /** Sum of the face values (1–13) of the numbered tiles left on the rack. */
  tiles: number;
  /** Number of jokers stranded on the rack — each worth `jokerValue`. */
  jokers: number;
}

export interface RummikubInput {
  /** The player who went out and emptied their rack. `null` until one is marked. */
  winner: ID | null;
  /** Leftover hands keyed by player id. The winner's own hand is ignored (empty). */
  hands: Record<ID, RummikubHand>;
}

/** Official joker penalty: a joker left on your rack costs 30 points. */
export const DEFAULT_JOKER_VALUE = 30;

/** A safe, non-negative integer from possibly-dirty draft input. */
function clampCount(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return v > 0 ? v : 0;
}

/**
 * Points a leftover hand is worth: face-value tiles + jokers × `jokerValue`.
 * Undefined/empty hands (e.g. the winner's) are worth 0. Never negative.
 */
export function handPenalty(
  hand: RummikubHand | undefined,
  jokerValue: number = DEFAULT_JOKER_VALUE,
): number {
  if (!hand) return 0;
  const perJoker = Math.max(0, Number(jokerValue) || 0);
  return clampCount(hand.tiles) + clampCount(hand.jokers) * perJoker;
}

/**
 * Score one Rummikub round. Returns a delta for *every* player id (the winner and
 * each opponent). Winner-positive is **derived** from the opponents' leftovers, so
 * the caller only records what everyone was left holding.
 *
 * Guards against a missing/invalid winner by returning an all-zero no-op round —
 * `validateRummikub` blocks that case before a round is ever saved.
 */
export function scoreRummikub(
  input: RummikubInput,
  playerIds: ID[],
  jokerValue: number = DEFAULT_JOKER_VALUE,
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = 0;

  const winner = input.winner;
  if (!winner || !playerIds.includes(winner)) return out;

  let pot = 0;
  for (const id of playerIds) {
    if (id === winner) continue;
    const penalty = handPenalty(input.hands?.[id], jokerValue);
    out[id] = penalty === 0 ? 0 : -penalty; // avoid a stored/displayed "-0"
    pot += penalty;
  }
  out[winner] = pot;
  return out;
}

/** Return `null` when the round is valid, otherwise a human-readable reason. */
export function validateRummikub(input: RummikubInput, playerIds: ID[]): string | null {
  if (!input.winner) return 'Tap the player who went out (emptied their rack).';
  if (!playerIds.includes(input.winner)) {
    return 'The player who went out is no longer in this game.';
  }
  for (const id of playerIds) {
    if (id === input.winner) continue;
    const hand = input.hands?.[id];
    if ((Number(hand?.tiles) || 0) < 0) return 'Leftover tile totals can’t be negative.';
    if ((Number(hand?.jokers) || 0) < 0) return 'Joker counts can’t be negative.';
  }
  return null;
}
