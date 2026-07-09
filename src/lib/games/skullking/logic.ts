import type { ID } from '../../types';

/**
 * Skull King scoring — pure, Svelte-free. Everything the module and its tests need to
 * turn recorded bids / tricks / bonuses into per-player point deltas lives here, so a
 * `*.test.ts` can exercise the real scoring without pulling in the round editor.
 *
 * Each round `n` (1-based) deals `n` cards, so exactly `n` tricks are up for grabs.
 * Hit your bid and you score 20 × bid; a successful **zero bid** is worth 10 × n
 * (its risk scales with the round). Miss a bid of 1+ and you lose 10 per trick you
 * were off; miss a zero bid and you lose 10 × n. Bonus points (captured 14s, the
 * Skull King, Mermaids, …) are entered as a lump sum and, by default, only count when
 * the bid is made.
 */

export interface SKRow {
  bid: number;
  actual: number;
  bonus: number;
}

export interface SKInput {
  rows: Record<ID, SKRow>;
}

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** A fresh, unbid row. */
export function emptyRow(): SKRow {
  return { bid: 0, actual: 0, bonus: 0 };
}

/** Bonuses come in ±10 chunks in every edition — the stepper increment. */
export const BONUS_STEP = 10;

/** Score a single player's row. Round `n` has `n` tricks. */
export function scoreRow(row: SKRow, n: number, bonusesRequireBid: boolean): number {
  const bid = numOr(row?.bid, 0);
  const actual = numOr(row?.actual, 0);
  const made = actual === bid;
  let pts: number;
  if (bid === 0) {
    pts = made ? 10 * n : -10 * n;
  } else {
    pts = made ? 20 * bid : -10 * Math.abs(actual - bid);
  }
  const bonus = numOr(row?.bonus, 0);
  if (bonus && (!bonusesRequireBid || made)) pts += bonus;
  return pts;
}

/** Per-player deltas for one round. `n` is the 1-based round number. */
export function scoreRound(
  input: SKInput,
  players: readonly { id: ID }[],
  n: number,
  bonusesRequireBid: boolean,
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const p of players) out[p.id] = scoreRow(input?.rows?.[p.id] ?? emptyRow(), n, bonusesRequireBid);
  return out;
}

/** Sum of every player's declared bid — the table's contract for the round. */
export function totalBid(input: SKInput, players: readonly { id: ID }[]): number {
  return players.reduce((a, p) => a + numOr(input?.rows?.[p.id]?.bid, 0), 0);
}

/** Sum of every player's recorded tricks. */
export function totalTricks(input: SKInput, players: readonly { id: ID }[]): number {
  return players.reduce((a, p) => a + numOr(input?.rows?.[p.id]?.actual, 0), 0);
}

/**
 * Validate one round. Returns null when good, otherwise a friendly message.
 * `n` is the 1-based round number (round n has n tricks).
 */
export function validateRound(
  input: SKInput,
  players: readonly { id: ID; name: string }[],
  n: number,
): string | null {
  let won = 0;
  for (const p of players) {
    const row = input?.rows?.[p.id] ?? emptyRow();
    const bid = numOr(row.bid, 0);
    const actual = numOr(row.actual, 0);
    const bonus = numOr(row.bonus, 0);
    if (bid < 0 || bid > n) return `${p.name}: bid must be between 0 and ${n}.`;
    if (actual < 0 || actual > n) return `${p.name}: tricks won must be between 0 and ${n}.`;
    if (!Number.isInteger(actual)) return `${p.name}: tricks must be a whole number.`;
    if (bonus < 0) return `${p.name}: bonus can't be negative.`;
    if (!Number.isInteger(bonus)) return `${p.name}: bonus must be a whole number.`;
    won += actual;
  }
  if (won > n) return `Total tricks won (${won}) can't exceed the ${n} available this round.`;
  return null;
}
