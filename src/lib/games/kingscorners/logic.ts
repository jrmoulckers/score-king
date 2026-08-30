import type { ID } from '../../types';

/**
 * Kings Corners scoring — pure, Svelte-free. Everything the module, its editor, and its
 * tests need to turn a recorded round into per-player point deltas lives here.
 *
 * Kings Corners (Kings in the Corner) is a Solitaire-family layout game: a cross of four
 * piles fans out from a central stock, with the four corners reserved for Kings. Play
 * continues around the table until one player empties their hand — the instant that
 * happens, the round ends and everyone else counts the penalty value of the cards still
 * stuck in their hand: 10 per King, 1 for every other card. Lower is better — you're
 * racing to empty your hand and dodging penalty cards left over, not chasing points. The
 * match runs until someone's running total reaches a threshold (25 by default, 50 for a
 * longer game); the LOWEST total at that point wins.
 */

export interface KingsCornersInput {
  /** Kings still stuck in each player's hand this round (10 pts each). */
  kingsLeft: Record<ID, number>;
  /** Every other card still stuck in each player's hand this round (1 pt each). */
  othersLeft: Record<ID, number>;
}

export interface KingsCornersConfig {
  /** End the game the moment any total reaches this. */
  endScore: number;
}

export const DEFAULT_CONFIG: KingsCornersConfig = { endScore: 25 };

/** Penalty value of a King left in hand. */
export const KING_PENALTY = 10;
/** Penalty value of any other card left in hand. */
export const CARD_PENALTY = 1;
/** Kings in a standard deck — the stepper ceiling for "Kings left". */
export const MAX_KINGS = 4;

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function readConfig(config: Record<string, unknown> = {}): KingsCornersConfig {
  return {
    endScore: Math.max(1, numOr(config.endScore, DEFAULT_CONFIG.endScore)),
  };
}

/** A fresh, empty round with every player holding zero penalty cards. */
export function emptyInput(playerIds: readonly ID[]): KingsCornersInput {
  return {
    kingsLeft: Object.fromEntries(playerIds.map((id) => [id, 0])),
    othersLeft: Object.fromEntries(playerIds.map((id) => [id, 0])),
  };
}

/** This player's penalty for the round: 10 per King left, 1 per other card left. */
export function penaltyFor(input: KingsCornersInput, id: ID): number {
  const kings = numOr(input.kingsLeft?.[id], 0) || 0;
  const others = numOr(input.othersLeft?.[id], 0) || 0;
  return kings * KING_PENALTY + others * CARD_PENALTY;
}

/**
 * The player(s) recorded with an empty hand (zero Kings, zero other cards) this round —
 * normally just the one player whose empty hand ended the round. Order follows `playerIds`.
 */
export function wentOutIds(input: KingsCornersInput, playerIds: readonly ID[]): ID[] {
  return playerIds.filter((id) => penaltyFor(input, id) === 0);
}

/** Per-player point deltas for a round — a direct pass-through of each seat's penalty. */
export function scoreRound(
  input: KingsCornersInput,
  playerIds: readonly ID[],
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = penaltyFor(input, id);
  return out;
}

/** Validate a round. Null when good, else a friendly, specific message. */
export function validateRound(
  input: KingsCornersInput,
  players: readonly { id: ID; name: string }[],
  _config: Record<string, unknown>,
): string | null {
  const ids = players.map((p) => p.id);
  if (ids.length === 0) return null;
  const outs = wentOutIds(input, ids);
  if (outs.length === 0) {
    return 'Mark who went out — one player must be left holding zero cards.';
  }
  if (outs.length === ids.length) {
    return "Everyone can't be at zero — enter the penalty cards left for the rest of the table.";
  }
  return null;
}

/** True once any total has reached the end score — the match's finish line. */
export function isFinished(totals: Record<ID, number>, config: Record<string, unknown>): boolean {
  const end = readConfig(config).endScore;
  return Object.values(totals).some((t) => t >= end);
}

/**
 * A compact one-liner summarizing a saved round, for the round history. Pure; the
 * module's `describeRound` just resolves ids to names through this.
 */
export function describeRound(
  input: KingsCornersInput | undefined,
  players: readonly { id: ID; name: string }[],
): string {
  if (!input?.kingsLeft) return 'no cards';
  const name = (id: ID) => players.find((p) => p.id === id)?.name ?? '?';
  const ids = players.map((p) => p.id);
  const outs = wentOutIds(input, ids);
  const outNames = outs.map(name).join(' & ');

  const heaviest = [...ids]
    .filter((id) => !outs.includes(id))
    .sort((a, b) => penaltyFor(input, b) - penaltyFor(input, a))[0];

  if (!heaviest || penaltyFor(input, heaviest) === 0) {
    return outNames ? `👑 ${outNames} went out — clean sweep` : 'no cards recorded';
  }
  return `👑 ${outNames} went out — ${name(heaviest)} +${penaltyFor(input, heaviest)}`;
}
