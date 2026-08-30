import type { ID, Player } from '../../types';

/**
 * Pure, Svelte-free Wizard scoring. No I/O, no DOM — independently unit-testable
 * and safe for the stats engine to import.
 *
 * Wizard is played with a 60-card deck (the standard 52 plus 4 Wizards and 4
 * Jesters). Round `n` (1-based) deals `n` cards to every player, so the game
 * runs for as many rounds as the deck allows: 20 rounds at 3 players, 15 at 4,
 * 12 at 5, 10 at 6 (`floor(60 / playerCount)`).
 *
 * Every round, every player bids the exact number of tricks they'll take, then
 * the table plays the hand. Scoring rewards precision, not tricks:
 * - Bid met exactly:   20 + 10 × bid
 * - Bid missed:        −10 × |bid − tricks taken|
 *
 * Because a trick is won by exactly one player and round `n` deals out `n`
 * tricks, the tricks recorded across the table must always sum to `n`.
 */

export interface WizardRow {
  bid: number;
  tricks: number;
}

export interface WizardInput {
  rows: Record<ID, WizardRow>;
}

/** Points for landing exactly on a bid. */
export const HIT_BASE = 20;
/** Points per bid trick when the bid is hit. */
export const HIT_PER_TRICK = 10;
/** Points lost per trick over/under a missed bid. */
export const MISS_PENALTY = 10;

/** A fresh, unbid row. */
export function emptyRow(): WizardRow {
  return { bid: 0, tricks: 0 };
}

/** Cards dealt (and tricks available) in round `roundIndex` (0-based). */
export function cardsForRound(roundIndex: number): number {
  return roundIndex + 1;
}

/**
 * Total rounds the 60-card deck supports for `playerCount` players — the deck
 * is dealt out one more card per round until it can't deal a full round to
 * everyone. `floor(60 / playerCount)`: 20 rounds at 3p, 15 at 4p, 12 at 5p,
 * 10 at 6p.
 */
export function roundsForPlayerCount(playerCount: number): number {
  if (playerCount <= 0) return 0;
  return Math.floor(60 / playerCount);
}

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Score a single player's row: hit the bid exactly, or pay per trick off. */
export function scoreRow(row: WizardRow | undefined): number {
  const bid = numOr(row?.bid, 0);
  const tricks = numOr(row?.tricks, 0);
  if (bid === tricks) return HIT_BASE + HIT_PER_TRICK * bid;
  return -MISS_PENALTY * Math.abs(bid - tricks);
}

/** Per-player point deltas for one round. */
export function scoreRound(
  input: WizardInput,
  players: readonly { id: ID }[],
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const p of players) out[p.id] = scoreRow(input?.rows?.[p.id]);
  return out;
}

/**
 * Validate one round. Bids and tricks must fall within the cards dealt this
 * round, and — because every trick is won by exactly one player — the tricks
 * recorded across the table must sum to exactly the cards dealt.
 */
export function validateRound(
  input: WizardInput,
  players: readonly { id: ID; name: string }[],
  roundIndex: number,
): string | null {
  const n = cardsForRound(roundIndex);
  let totalTricks = 0;

  for (const p of players) {
    const row = input?.rows?.[p.id] ?? emptyRow();
    const bid = numOr(row.bid, 0);
    if (!Number.isInteger(bid) || bid < 0 || bid > n) {
      return `${p.name}: bid must be a whole number between 0 and ${n}.`;
    }
    const tricks = numOr(row.tricks, 0);
    if (!Number.isInteger(tricks) || tricks < 0 || tricks > n) {
      return `${p.name}: tricks must be a whole number between 0 and ${n}.`;
    }
    totalTricks += tricks;
  }

  if (totalTricks !== n) {
    return `Tricks must total ${n} (currently ${totalTricks}).`;
  }
  return null;
}

/** Short per-player summary of a recorded round, e.g. "Ada 3/3 · Bo 1/0". */
export function describeRound(input: WizardInput | undefined, players: Player[]): string {
  return players
    .map((p) => {
      const row = input?.rows?.[p.id];
      if (!row) return '';
      return `${p.name} ${row.bid}/${row.tricks}`;
    })
    .filter(Boolean)
    .join(' · ');
}
