import type { ID } from '../../types';

/**
 * Tally scoring — pure, Svelte-free, fully unit-testable. `index.ts` and the editor both
 * import from here so the exact math the game plays is the exact math the tests exercise.
 *
 * Tally is Score King's universal fallback counter: every round is just a per-player point
 * delta (which may be negative — some games subtract), summed into a running total. Highest
 * or lowest total wins, with an optional target that ends the game the moment anyone reaches
 * it. The target is a plain end threshold in BOTH directions: for a high-score game the first
 * to reach it is winning; for a low-score game reaching it ends the night and the LOWEST total
 * wins (Hearts-style). That keeps "Lowest + target" a real, useful combination instead of a
 * dead config.
 */

export type TallyDirection = 'high' | 'low';

/** A round's input: each player's point change for this round, keyed by player id. */
export interface TallyInput {
  deltas: Record<ID, number>;
}

/** Normalized, validated config the scorer actually runs on. */
export interface TallyConfig {
  /** Who wins on totals: highest ('high') or lowest ('low'). */
  direction: TallyDirection;
  /** End-threshold score (0 = no limit). Ends the game when any total reaches it. */
  target: number;
  /** The natural increment for this game — drives the stepper and quick-add chips. */
  step: number;
}

export const TALLY_DEFAULTS: TallyConfig = {
  direction: 'high',
  target: 0,
  step: 1,
};

/** Read a raw, possibly-untrusted config bag into a clean {@link TallyConfig}. */
export function readConfig(config: Record<string, unknown> | undefined): TallyConfig {
  const c = config ?? {};
  const target = Math.max(0, Math.trunc(Number(c.target)) || 0);
  const step = Math.max(1, Math.trunc(Number(c.step)) || 0) || TALLY_DEFAULTS.step;
  return {
    direction: c.direction === 'low' ? 'low' : 'high',
    target,
    step,
  };
}

/** True when the lowest total wins. */
export function lowerIsBetter(config: Record<string, unknown> | undefined): boolean {
  return readConfig(config).direction === 'low';
}

/** A fresh, zeroed round input for the current roster. */
export function createTallyInput(playerIds: ID[]): TallyInput {
  return { deltas: Object.fromEntries(playerIds.map((id) => [id, 0])) };
}

/** One player's delta for this round, coerced to a finite number (0 on garbage). */
export function deltaOf(input: TallyInput, id: ID): number {
  const v = Number(input?.deltas?.[id]);
  return Number.isFinite(v) ? v : 0;
}

/** Compute per-player point deltas for the round (a pass-through of the entered deltas). */
export function scoreTally(input: TallyInput): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of Object.keys(input?.deltas ?? {})) out[id] = deltaOf(input, id);
  return out;
}

/**
 * The game ends when any total reaches the target — the same "reach the threshold"
 * rule in both directions. For a high-score game the reacher is winning; for a low-score
 * game reaching the threshold ends the night and the lowest total wins. Off (returns
 * false) when there is no target.
 */
export function isTallyFinished(
  totals: Record<ID, number>,
  config: Record<string, unknown> | undefined,
): boolean {
  const { target } = readConfig(config);
  if (target <= 0) return false;
  const vals = Object.values(totals);
  return vals.length > 0 && vals.some((t) => t >= target);
}

/** A player's projected total if this round were saved as entered. */
export function projectedTotal(before: number, delta: number): number {
  return (Number(before) || 0) + (Number(delta) || 0);
}

/**
 * How far a projected total is from the target, as a non-negative "N to go". Returns null
 * when there is no target or the total has already reached it (nothing left to count down).
 */
export function remainingToTarget(projected: number, target: number): number | null {
  if (!target || target <= 0) return null;
  const remaining = target - (Number(projected) || 0);
  return remaining > 0 ? remaining : null;
}

/** True once a projected total has reached (or passed) the target. */
export function reachedTarget(projected: number, target: number): boolean {
  if (!target || target <= 0) return false;
  return (Number(projected) || 0) >= target;
}

/**
 * Fraction (0..1) of the way a projected total is toward the target, for a progress meter.
 * Returns null when there is no target. Clamped so an overshoot never renders past full.
 */
export function targetProgress(projected: number, target: number): number | null {
  if (!target || target <= 0) return null;
  const p = (Number(projected) || 0) / target;
  return Math.max(0, Math.min(1, p));
}
