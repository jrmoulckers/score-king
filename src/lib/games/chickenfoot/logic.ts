import type { ID, Player, Round } from '../../types';

/**
 * Pure Chicken Foot scoring — no Svelte, no I/O — so it's independently unit-testable
 * and safe for the stats engine to import. The GameModule in `index.ts` is a thin
 * adapter over these helpers; the editor imports the display helpers straight from here.
 *
 * Chicken Foot is a dominoes game played as a countdown of rounds — one per starting
 * double, from the highest double down to double-blank. Each round one player empties
 * their hand to end it; then EVERY player adds the pip count still in their hand to a
 * running total. Lowest total wins.
 */
export interface ChickenFootInput {
  /** The leading double this round is built on (startDouble − roundIndex; 0 = double-blank). */
  double: number;
  /** Pips still in each player's hand at round's end (a blank side counts 0). */
  pips: Record<ID, number>;
  /** Who emptied their hand to end the round. `null` when the round was blocked. */
  outId: ID | null;
  /** Who was caught holding the single 0–0 tile — scored via the double-blank penalty. */
  blankId: ID | null;
}

/** The starting doubles Score King offers, and how many rounds each implies (double + 1). */
export const START_DOUBLES = [6, 9, 12] as const;

/** Parse the configured starting double, defaulting to double-9. */
export function startDouble(config: Record<string, unknown>): number {
  const n = Number(config.startDouble);
  return (START_DOUBLES as readonly number[]).includes(n) ? n : 9;
}

/** One round per double, from the starting double down to double-blank. */
export function totalRounds(config: Record<string, unknown>): number {
  return startDouble(config) + 1;
}

/** The leading double for a 0-based round index, clamped at 0 (double-blank). */
export function leadingDouble(config: Record<string, unknown>, roundIndex: number): number {
  return Math.max(0, startDouble(config) - roundIndex);
}

/** Friendly name for a leading double: "Double-7", or "Double-blank" for the 0–0 round. */
export function doubleLabel(d: number): string {
  return d <= 0 ? 'Double-blank' : `Double-${d}`;
}

/** Penalty for being caught with the 0–0 tile; 0 means it scores as a plain blank. */
export function blankValue(config: Record<string, unknown>): number {
  const n = Number(config.doubleBlankValue);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Coerce a raw pip entry to a non-negative number (missing/blank/NaN → 0). */
function pipsOf(input: ChickenFootInput, id: ID): number {
  const n = Number(input.pips?.[id]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Points a single player scores this round: 0 if they went out (empty hand),
 * otherwise their leftover pips plus the double-blank penalty when they hold the 0–0.
 */
export function playerRoundScore(input: ChickenFootInput, id: ID, blankVal: number): number {
  if (input.outId === id) return 0;
  return pipsOf(input, id) + (input.blankId === id ? blankVal : 0);
}

/** Per-player point deltas for the round. */
export function scoreRound(
  input: ChickenFootInput,
  players: readonly Pick<Player, 'id'>[],
  blankVal: number,
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const p of players) out[p.id] = playerRoundScore(input, p.id, blankVal);
  return out;
}

/** Return null when the round is valid, otherwise a friendly, specific message. */
export function validateRound(
  input: ChickenFootInput,
  players: readonly Pick<Player, 'id' | 'name'>[],
): string | null {
  for (const p of players) {
    const raw = input.pips?.[p.id];
    if (raw == null) continue; // unset entry is treated as 0 pips
    const n = Number(raw);
    if (!Number.isFinite(n)) return `${p.name}: enter a pip count.`;
    if (n < 0) return `${p.name}: pip count can’t be negative.`;
  }
  // A player who emptied their hand can't also be holding the double-blank tile.
  if (input.blankId && input.blankId === input.outId) {
    return 'Whoever went out has an empty hand — they can’t hold the double-blank.';
  }
  return null;
}

/** Short one-line summary for the history table, driven by the round's recorded deltas. */
export function describeRound(
  round: Round,
  players: readonly Pick<Player, 'id' | 'name'>[],
): string {
  const input = round.input as ChickenFootInput | undefined;
  const name = (id: ID | null) => players.find((p) => p.id === id)?.name ?? '?';
  const parts: string[] = [doubleLabel(input?.double ?? 0)];

  if (input?.outId) parts.push(`🐔 ${name(input.outId)} out`);
  else parts.push('🚫 blocked');

  let worstId: ID | null = null;
  let worst = 0;
  for (const [id, v] of Object.entries(round.deltas ?? {})) {
    if (v > worst) {
      worst = v;
      worstId = id;
    }
  }
  if (worstId && worst > 0) parts.push(`${name(worstId)} +${worst}`);
  return parts.join(' · ');
}
