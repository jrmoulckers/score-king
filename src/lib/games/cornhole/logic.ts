import type { ID } from '../../types';

/**
 * Pure Cornhole scoring — no Svelte, no I/O, fully unit-testable. `index.ts` and the
 * editor import from here so the exact math the game plays is the exact math the tests
 * exercise. Cornhole is a two-SIDE game (1v1 or 2v2); in this app each side is one
 * "player" seat, so the board always shows two scores racing to the target.
 */

/** Bag in the hole ("drano" / "cornhole"). */
export const IN_HOLE_POINTS = 3;
/** Bag resting on the board ("woody"). */
export const ON_BOARD_POINTS = 1;
/** Bags each side throws per round (frame). */
export const BAGS_PER_SIDE = 4;
/** Where the bust variant sends an overshooting side. */
export const BUST_TO = 15;

/** One side's bags for a single round. */
export interface SideThrow {
  /** Bags that went in the hole (×3). */
  inHole: number;
  /** Bags resting on the board (×1). */
  onBoard: number;
}

/** A round's input: each side's bags, keyed by that side's player id. */
export interface CornholeInput {
  sides: Record<ID, SideThrow>;
}

export type CornholeFormat = '1v1' | '2v2';

/** Normalized, validated config the scorer actually runs on. */
export interface CornholeConfig {
  target: number;
  bust: boolean;
  winBy: number;
  format: CornholeFormat;
}

/** Full result of resolving one round — deltas plus the pieces the UI narrates. */
export interface RoundOutcome {
  /** Per-side point deltas to apply this round (the loser/wash side is 0). */
  deltas: Record<ID, number>;
  /** Raw round points for side A (first seat) before cancellation. */
  aRaw: number;
  /** Raw round points for side B (second seat) before cancellation. */
  bRaw: number;
  /** The side that scored this round, or null on a wash (tie). */
  gainerId: ID | null;
  /** Net points the leader won this round (after cancellation, before bust). */
  net: number;
  /** True when the bust rule pulled the scoring side back to {@link BUST_TO}. */
  busted: boolean;
}

/** Read raw, possibly-untrusted config into a clean {@link CornholeConfig}. */
export function readConfig(config: Record<string, unknown> = {}): CornholeConfig {
  const target = Math.max(1, Math.trunc(Number(config.target)) || 21);
  const winBy = Math.max(1, Math.trunc(Number(config.winBy)) || 1);
  return {
    target,
    bust: config.bust === true,
    winBy,
    format: config.format === '2v2' ? '2v2' : '1v1',
  };
}

/** A fresh, empty throw for one side. */
export function emptyThrow(): SideThrow {
  return { inHole: 0, onBoard: 0 };
}

/** Clamp a bag count to a sane non-negative integer. */
function bags(n: unknown): number {
  return Math.max(0, Math.trunc(Number(n) || 0));
}

/** Raw round points for one side: in-hole ×3 + on-board ×1. */
export function sideRaw(t: SideThrow | undefined): number {
  if (!t) return 0;
  return bags(t.inHole) * IN_HOLE_POINTS + bags(t.onBoard) * ON_BOARD_POINTS;
}

/** Cancellation: the higher side keeps the difference; equal is a wash. */
export function cancel(a: number, b: number): { gainer: 'a' | 'b' | null; net: number } {
  if (a > b) return { gainer: 'a', net: a - b };
  if (b > a) return { gainer: 'b', net: b - a };
  return { gainer: null, net: 0 };
}

/**
 * Apply the bust variant to a scoring side. Returns the delta to record (which can be
 * negative when a bust drags the side back to {@link BUST_TO}). Bust only bites when the
 * target is above 15 — otherwise "back to 15" wouldn't be a setback, so it's ignored.
 */
export function applyBust(
  oldTotal: number,
  net: number,
  cfg: Pick<CornholeConfig, 'target' | 'bust'>,
): { delta: number; busted: boolean } {
  const projected = oldTotal + net;
  if (cfg.bust && cfg.target > BUST_TO && projected > cfg.target) {
    return { delta: BUST_TO - oldTotal, busted: true };
  }
  return { delta: net, busted: false };
}

/**
 * Resolve a round for the two sides (in seat order). `totals` are the cumulative
 * scores BEFORE this round, needed so the bust rule can reset the scoring side.
 */
export function scoreCornhole(
  ids: [ID, ID],
  input: CornholeInput,
  totals: Record<ID, number>,
  cfg: CornholeConfig,
): RoundOutcome {
  const [aId, bId] = ids;
  const aRaw = sideRaw(input.sides?.[aId]);
  const bRaw = sideRaw(input.sides?.[bId]);
  const { gainer, net } = cancel(aRaw, bRaw);

  const deltas: Record<ID, number> = { [aId]: 0, [bId]: 0 };
  let gainerId: ID | null = null;
  let busted = false;

  if (gainer) {
    gainerId = gainer === 'a' ? aId : bId;
    const { delta, busted: b } = applyBust(Number(totals[gainerId]) || 0, net, cfg);
    deltas[gainerId] = delta;
    busted = b;
  }

  return { deltas, aRaw, bRaw, gainerId, net, busted };
}

/**
 * True once a side has won: it has reached the target AND leads by at least `winBy`.
 * With the default `winBy` of 1 this is simply "first side to the target".
 */
export function isWon(totals: Record<ID, number>, cfg: CornholeConfig): boolean {
  const vals = Object.values(totals);
  if (vals.length === 0) return false;
  const sorted = [...vals].sort((x, y) => y - x);
  const top = sorted[0] ?? 0;
  const second = sorted.length > 1 ? (sorted[1] ?? 0) : -Infinity;
  return top >= cfg.target && top - second >= cfg.winBy;
}
