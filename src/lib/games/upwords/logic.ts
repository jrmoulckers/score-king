import type { ID } from '../../types';

/**
 * Pure Upwords scoring — no Svelte, no I/O — so `index.ts`, the editor and
 * `upwords.test.ts` all share the exact same math.
 *
 * Upwords is a stacking word game (Hasbro): letters carry no individual value —
 * a word scores by *height*, not by letter rarity. Rules verified against the
 * official Hasbro instructions (also mirrored by UltraBoardGames/Geeky Hobbies):
 *
 *   • Flat word (every tile exactly one layer high): 2 points per letter.
 *   • Stacked word (any tile two or more layers high): 1 point for every tile
 *     under every letter — i.e. the SUM of each letter's stack height.
 *   • +2 bonus for using the "Qu" tile, but ONLY in a flat word (no bonus if
 *     any of its letters are stacked).
 *   • +20 bonus for using all 7 rack tiles in a single turn (a "bingo").
 *   • A turn can form more than one word at once (the main play plus any
 *     crossing words it completes/changes) — every word formed scores.
 *   • Game end: −5 points for every tile left unplayed on a player's rack.
 *
 * Score King doesn't model the physical board — a turn's word(s) are entered
 * as (letter count, flat-or-stacked, stack-height total) tuples and this module
 * computes the point value, matching exactly what a player would tally by hand.
 *
 * Ambiguity resolved: the official rules only ever describe a *single* Qu bonus
 * and a single bingo bonus per turn (not per word), so both are modeled as
 * turn-level flags rather than per-word fields.
 */

/** Points per letter for an all-flat (single-layer) word. */
export const FLAT_POINTS_PER_LETTER = 2;
/** Points per letter — and per stacked tile beneath it — for a stacked word. */
export const STACKED_POINTS_PER_TILE = 1;
/** Bonus for playing the "Qu" tile in a flat word. No bonus if the word is stacked. */
export const QU_BONUS = 2;
/** Bonus for using all seven rack tiles in one turn (a "bingo"). */
export const BINGO_BONUS = 20;
/** End-of-game penalty per tile left unplayed on a rack. */
export const UNPLAYED_TILE_PENALTY = 5;
/** Tiles cannot be stacked higher than this (official rule). */
export const MAX_STACK_HEIGHT = 5;

/** One word formed/changed during a turn. */
export interface UpwordsWordEntry {
  /** Letters in the word (>= 2 — Upwords requires at least a two-letter word). */
  letters: number;
  /** True when every tile in the word is exactly one layer high. */
  flat: boolean;
  /**
   * Sum of each letter's stack height (e.g. DEAR built 2/1/3/1 high = 7).
   * Only meaningful — and only used — when `flat` is false.
   */
  stackHeight: number;
}

/** A full turn's entered scoring, ready to be saved as a round. */
export interface UpwordsInput {
  /** Whose turn this round records. `null` until chosen. */
  activePlayerId: ID | null;
  /** 'turn' scores one player's play; 'endgame' applies the unplayed-tile penalty to everyone. */
  mode: 'turn' | 'endgame';
  /** Every word formed/changed this turn (usually one, sometimes more). */
  words: UpwordsWordEntry[];
  /** Used the "Qu" tile in a flat word this turn (+2). */
  quBonus: boolean;
  /** Played all 7 rack tiles this turn (+20). */
  bingo: boolean;
  /** End-of-game only: tiles left unplayed on each player's rack. */
  unplayedTiles: Record<ID, number>;
}

/** A fresh, empty word entry — a flat two-letter word, the smallest legal play. */
export function emptyWordEntry(): UpwordsWordEntry {
  return { letters: 2, flat: true, stackHeight: 2 };
}

/** A fresh turn-mode input for the current roster. */
export function createTurnInput(playerIds: ID[], activePlayerId: ID | null = null): UpwordsInput {
  return {
    activePlayerId,
    mode: 'turn',
    words: [emptyWordEntry()],
    quBonus: false,
    bingo: false,
    unplayedTiles: Object.fromEntries(playerIds.map((id) => [id, 0])),
  };
}

/** A fresh end-of-game penalty input for the current roster. */
export function createEndgameInput(playerIds: ID[]): UpwordsInput {
  return {
    activePlayerId: null,
    mode: 'endgame',
    words: [],
    quBonus: false,
    bingo: false,
    unplayedTiles: Object.fromEntries(playerIds.map((id) => [id, 0])),
  };
}

/** A safe, non-negative integer from possibly-dirty draft input. */
function clampCount(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return v > 0 ? v : 0;
}

/** Points a single word is worth: flat = 2/letter, stacked = sum of tile heights. */
export function wordScore(entry: UpwordsWordEntry): number {
  const letters = clampCount(entry.letters);
  if (letters < 2) return 0;
  if (entry.flat) return letters * FLAT_POINTS_PER_LETTER;
  // Stacked: at minimum one tile per letter (height 1), so never score below that floor.
  const height = Math.max(letters, clampCount(entry.stackHeight));
  return height * STACKED_POINTS_PER_TILE;
}

/** Total points for a turn: every word formed, plus the Qu and bingo bonuses. */
export function turnScore(input: UpwordsInput): number {
  const words = input.words ?? [];
  const wordsTotal = words.reduce((sum, w) => sum + wordScore(w), 0);
  const allFlat = words.length > 0 && words.every((w) => w.flat);
  const quPoints = input.quBonus && allFlat ? QU_BONUS : 0;
  const bingoPoints = input.bingo ? BINGO_BONUS : 0;
  return wordsTotal + quPoints + bingoPoints;
}

/** End-of-game penalty for one player's leftover rack. Always <= 0 (never a "-0"). */
export function endgamePenalty(unplayedTiles: number): number {
  const penalty = clampCount(unplayedTiles) * UNPLAYED_TILE_PENALTY;
  return penalty === 0 ? 0 : -penalty;
}

/** Compute per-player deltas for a recorded round (turn play or end-game penalties). */
export function scoreUpwords(input: UpwordsInput, playerIds: ID[]): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = 0;

  if (input.mode === 'endgame') {
    for (const id of playerIds) {
      const penalty = endgamePenalty(input.unplayedTiles?.[id]);
      out[id] = penalty === 0 ? 0 : penalty; // avoid a stored/displayed "-0"
    }
    return out;
  }

  const active = input.activePlayerId;
  if (active && playerIds.includes(active)) out[active] = turnScore(input);
  return out;
}

/** Return `null` when the round is valid, otherwise a human-readable reason. */
export function validateUpwords(input: UpwordsInput, playerIds: ID[]): string | null {
  if (input.mode === 'endgame') {
    for (const id of playerIds) {
      if ((Number(input.unplayedTiles?.[id]) || 0) < 0) {
        return 'Unplayed tile counts can’t be negative.';
      }
    }
    return null;
  }

  if (!input.activePlayerId) return 'Pick whose turn this is.';
  if (!playerIds.includes(input.activePlayerId)) {
    return 'The active player is no longer in this game.';
  }
  const words = input.words ?? [];
  if (words.length === 0) return 'Add at least one word formed this turn.';
  for (const w of words) {
    if (clampCount(w.letters) < 2) return 'Every word needs at least 2 letters.';
    if (!w.flat) {
      const letters = clampCount(w.letters);
      const height = clampCount(w.stackHeight);
      if (height < letters) return 'A stacked word’s tile total can’t be less than its letters.';
      if (height > letters * MAX_STACK_HEIGHT) {
        return `Tiles can’t stack higher than ${MAX_STACK_HEIGHT} — check the stack total.`;
      }
    }
  }
  return null;
}
