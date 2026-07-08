import type { ID, Round, RoundContext } from '../../types';

/**
 * Fluff — the bluffing dice game in the Liar's Dice / Perudo family. Pure, Svelte-free
 * logic so it can be unit-tested (see `fluff.test.ts`) without importing the editor.
 *
 * ## The tracker model
 * Fluff is an *elimination* game: every player starts with a cup of dice; each challenge
 * resolves with exactly one player being wrong and **losing a die** (or, with the
 * spot-on variant, a correct exact-caller **regaining** one). A player is out at zero
 * dice; the **last player standing wins**.
 *
 * We map that onto the generic score engine by making each recorded round one challenge
 * and letting `totals[id]` accumulate **dice lost** (so `lowerIsBetter` — fewest lost
 * leads). Dice *remaining* is derived as `startDice − lost`. Deltas are a position-free
 * ±1, so the running totals stay correct even when a round is deleted and the rest are
 * re-indexed (the engine re-indexes without re-scoring).
 */

export type FluffResult = 'lose' | 'gain';

export interface FluffInput {
  /** The player affected by this challenge — the one who lost (or, spot-on, regained) a die. */
  playerId: ID | null;
  /** `'lose'` = down a die (a busted bid or bad call); `'gain'` = up a die (a correct spot-on call). */
  result: FluffResult;
}

export const DEFAULT_START_DICE = 5;

/** Dice each player starts with, from config (defaults to 5, clamped to a sane 1–6). */
export function startDice(config: Record<string, unknown>): number {
  const n = Math.floor(Number(config.startDice));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_START_DICE;
  return Math.min(6, n);
}

/** Whether "ones are wild" is on (flavor/house-rule — reflected in copy & help, not scoring). */
export function onesWild(config: Record<string, unknown>): boolean {
  return config.onesWild !== false;
}

/** Whether "spot-on" (exact) calls are enabled — a correct exact call lets a player regain a die. */
export function spotOnEnabled(config: Record<string, unknown>): boolean {
  return config.spotOn === true;
}

/** Cumulative dice a player has lost so far (never negative). */
export function diceLost(totals: Record<ID, number>, id: ID): number {
  return Math.max(0, Number(totals[id]) || 0);
}

/** Dice a player still has in their cup, clamped to `[0, start]`. */
export function diceRemaining(totals: Record<ID, number>, id: ID, start: number): number {
  return Math.max(0, Math.min(start, start - diceLost(totals, id)));
}

/** Still in the game (has at least one die). */
export function isAlive(totals: Record<ID, number>, id: ID, start: number): boolean {
  return diceRemaining(totals, id, start) > 0;
}

/** Ids of every player who still has dice. */
export function survivors(totals: Record<ID, number>, ids: ID[], start: number): ID[] {
  return ids.filter((id) => diceRemaining(totals, id, start) > 0);
}

/** Total dice still on the table across everyone still playing. */
export function diceInPlay(totals: Record<ID, number>, ids: ID[], start: number): number {
  return ids.reduce((sum, id) => sum + diceRemaining(totals, id, start), 0);
}

/**
 * Per-player point deltas for one challenge. A challenge touches exactly one player:
 * `lose` costs a die (+1 lost), a spot-on `gain` returns one (−1 lost). Everyone else 0.
 */
export function scoreRound(input: FluffInput, ctx: RoundContext): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const p of ctx.players) out[p.id] = 0;
  const id = input.playerId;
  if (id && id in out) {
    out[id] = input.result === 'gain' ? -1 : 1;
  }
  return out;
}

/** Null when the round is valid, otherwise a friendly, specific error. */
export function validateRound(input: FluffInput, ctx: RoundContext): string | null {
  const start = startDice(ctx.config);
  const id = input.playerId;
  if (!id) return 'Tap the player who lost the challenge.';

  const player = ctx.players.find((p) => p.id === id);
  if (!player) return 'Pick a player who is still in the game.';

  const remaining = diceRemaining(ctx.totals, id, start);
  if (remaining <= 0) return `${player.name} is already out.`;

  if (input.result === 'gain') {
    if (!spotOnEnabled(ctx.config)) return 'Spot-on calls are turned off for this game.';
    if (remaining >= start) return `${player.name} already has all ${start} dice.`;
  } else {
    // Refuse to empty the table: once one player is left, the game is won.
    const othersAlive = ctx.players.some(
      (p) => p.id !== id && diceRemaining(ctx.totals, p.id, start) > 0,
    );
    if (!othersAlive) return 'Only one player left — tap “Finish & record winner”.';
  }
  return null;
}

/** The game ends when at most one player still has dice. */
export function isFinished(
  totals: Record<ID, number>,
  info: { config: Record<string, unknown> },
): boolean {
  const start = startDice(info.config);
  const ids = Object.keys(totals);
  if (ids.length === 0) return false;
  return survivors(totals, ids, start).length <= 1;
}

/**
 * The winner is the last player standing. If forced to finish early (more than one still
 * alive), the leader(s) — the player(s) with the fewest dice lost — take it.
 */
export function pickWinners(totals: Record<ID, number>, config: Record<string, unknown>): ID[] {
  const start = startDice(config);
  const ids = Object.keys(totals);
  if (ids.length === 0) return [];
  const alive = survivors(totals, ids, start);
  const pool = alive.length ? alive : ids;
  const fewest = Math.min(...pool.map((id) => diceLost(totals, id)));
  return pool.filter((id) => diceLost(totals, id) === fewest);
}

/** One-line summary of a recorded challenge for the history table. */
export function describeRound(round: Round, players: { id: ID; name: string }[]): string {
  const input = round.input as FluffInput | undefined;
  if (!input || !input.playerId) return 'no change';
  const name = players.find((p) => p.id === input.playerId)?.name ?? '?';
  return input.result === 'gain' ? `🎲 ${name} won a die back` : `💀 ${name} lost a die`;
}
