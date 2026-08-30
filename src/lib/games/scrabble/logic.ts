import type { ID } from '../../types';

/**
 * Scrabble scoring — pure, Svelte-free, fully unit-testable. `index.ts` and the editor both
 * import from here so the exact math the game plays is the exact math the tests exercise.
 *
 * Score King can't see the board, so premium squares (double/triple letter or word) are
 * handled physically at the table and entered here as a single word-value number per turn.
 * Two things this module *does* compute:
 *
 * 1. The bingo bonus — +50 for using all 7 tiles in one turn — a simple toggle per turn.
 * 2. The end-game rack adjustment — once a player empties their rack and the bag is empty,
 *    every other player subtracts the value of their unplayed tiles from their own score,
 *    and the finisher adds the sum of everyone else's unplayed tiles to theirs. That's
 *    recorded as one special "final tally" round rather than a turn.
 */

/** Standard English-language Scrabble tile values. Blanks are always worth 0. */
export const LETTER_VALUES: Record<string, number> = {
  A: 1,
  E: 1,
  I: 1,
  O: 1,
  U: 1,
  L: 1,
  N: 1,
  S: 1,
  T: 1,
  R: 1,
  D: 2,
  G: 2,
  B: 3,
  C: 3,
  M: 3,
  P: 3,
  F: 4,
  H: 4,
  V: 4,
  W: 4,
  Y: 4,
  K: 5,
  J: 8,
  X: 8,
  Q: 10,
  Z: 10,
};

/** Letters grouped by their point value, in ascending order — for the reference table. */
export const LETTER_GROUPS: { value: number; letters: string }[] = [
  { value: 1, letters: 'A E I O U L N S T R' },
  { value: 2, letters: 'D G' },
  { value: 3, letters: 'B C M P' },
  { value: 4, letters: 'F H V W Y' },
  { value: 5, letters: 'K' },
  { value: 8, letters: 'J X' },
  { value: 10, letters: 'Q Z' },
];

/** Bonus for playing every tile in your rack (7) in a single turn. */
export const BINGO_BONUS = 50;

/** The value of a single tile letter. Blank / unknown characters are worth 0. */
export function letterValue(letter: string): number {
  const l = (letter ?? '').trim().toUpperCase();
  if (l.length !== 1) return 0;
  return LETTER_VALUES[l] ?? 0;
}

/** Sum of tile values across a rack of letters (any non-letter character, e.g. a blank
 * marker like `_` or `?`, contributes 0). Case-insensitive. */
export function rackValue(letters: string): number {
  let total = 0;
  for (const ch of (letters ?? '').toUpperCase()) {
    total += letterValue(ch);
  }
  return total;
}

export interface TurnInput {
  kind: 'turn';
  /** Whose turn this was. */
  playerId: ID | null;
  /** The word value scored this turn (premium squares already applied at the table). */
  points: number;
  /** Used all 7 tiles this turn — +50. */
  bingo: boolean;
}

export interface FinalTallyInput {
  kind: 'final';
  /** Who emptied their rack first (the bag was already empty). */
  finisherId: ID | null;
  /** Each OTHER player's unplayed tile value, keyed by player id. */
  remaining: Record<ID, number>;
}

export type ScrabbleInput = TurnInput | FinalTallyInput;

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** A fresh turn, defaulting to whichever player's turn it is by simple round-robin. */
export function emptyTurnInput(playerIds: readonly ID[], roundIndex: number): TurnInput {
  const playerId = playerIds.length
    ? playerIds[((roundIndex % playerIds.length) + playerIds.length) % playerIds.length]
    : null;
  return { kind: 'turn', playerId, points: 0, bingo: false };
}

/** A fresh final-tally round, zeroed for every player. */
export function emptyFinalInput(playerIds: readonly ID[]): FinalTallyInput {
  return {
    kind: 'final',
    finisherId: null,
    remaining: Object.fromEntries(playerIds.map((id) => [id, 0])),
  };
}

/** The default round input: an ordinary turn for whoever's up. */
export function emptyInput(playerIds: readonly ID[], roundIndex: number): ScrabbleInput {
  return emptyTurnInput(playerIds, roundIndex);
}

export function isTurn(input: ScrabbleInput | undefined | null): input is TurnInput {
  return !!input && input.kind === 'turn';
}

export function isFinalTally(input: ScrabbleInput | undefined | null): input is FinalTallyInput {
  return !!input && input.kind === 'final';
}

/** Points a turn is worth: the word value, plus the bingo bonus when it applies. */
export function turnTotal(input: TurnInput): number {
  return Math.max(0, Math.trunc(numOr(input.points, 0))) + (input.bingo ? BINGO_BONUS : 0);
}

/** Total unplayed-tile value the final tally will move, across every other player. */
export function finalTallySwing(input: FinalTallyInput, playerIds: readonly ID[]): number {
  let sum = 0;
  for (const id of playerIds) {
    if (id === input.finisherId) continue;
    sum += Math.max(0, Math.trunc(numOr(input.remaining?.[id], 0)));
  }
  return sum;
}

/** Compute per-player point deltas for a round — a turn, or the end-game adjustment. */
export function scoreRound(input: ScrabbleInput, playerIds: readonly ID[]): Record<ID, number> {
  const out: Record<ID, number> = Object.fromEntries(playerIds.map((id) => [id, 0]));

  if (isTurn(input)) {
    if (input.playerId && input.playerId in out) out[input.playerId] = turnTotal(input);
    return out;
  }

  if (!input.finisherId || !(input.finisherId in out)) return out;
  let sum = 0;
  for (const id of playerIds) {
    if (id === input.finisherId) continue;
    const rem = Math.max(0, Math.trunc(numOr(input.remaining?.[id], 0)));
    out[id] = rem > 0 ? -rem : 0;
    sum += rem;
  }
  out[input.finisherId] += sum;
  return out;
}

/** Validate a round. Null when good, else a friendly, specific message. */
export function validateRound(
  input: ScrabbleInput,
  players: readonly { id: ID; name: string }[],
): string | null {
  if (isTurn(input)) {
    if (!input.playerId || !players.some((p) => p.id === input.playerId)) {
      return 'Choose who just played.';
    }
    if (!Number.isFinite(input.points) || input.points < 0) {
      return "Enter this turn's word value (0 or more).";
    }
    return null;
  }
  if (!input.finisherId || !players.some((p) => p.id === input.finisherId)) {
    return 'Choose who went out — emptied their rack with the bag empty.';
  }
  return null;
}

/** A compact one-liner summarizing a saved round, for the round history. */
export function describeRound(
  input: ScrabbleInput | undefined,
  players: readonly { id: ID; name: string }[],
): string {
  const name = (id: ID | null) => players.find((p) => p.id === id)?.name ?? '?';
  if (!input) return 'no turn recorded';

  if (isFinalTally(input)) {
    const swing = finalTallySwing(
      input,
      players.map((p) => p.id),
    );
    return swing > 0
      ? `🏁 ${name(input.finisherId)} went out — +${swing} from opponents' racks`
      : `🏁 ${name(input.finisherId)} went out`;
  }

  if (!input.playerId) return 'no turn recorded';
  const total = turnTotal(input);
  return input.bingo
    ? `${name(input.playerId)} scored ${total} (🎉 BINGO! +${BINGO_BONUS})`
    : `${name(input.playerId)} scored ${total}`;
}
