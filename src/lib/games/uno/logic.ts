import type { ID } from '../../types';

/**
 * Uno scoring — pure and Svelte-free so it can be unit-tested directly and reused by
 * the editor for live previews (see README "Adding a game").
 *
 * A hand ends when one player "goes out" (empties their hand). What happens to the
 * points left in the other hands depends on the scoring mode:
 *  - `winner` (standard): the player who went out scoops the SUM of everyone else's
 *    leftover cards. Highest total wins, race to `target` (default 500).
 *  - `golf`: every player banks the value of the cards left in their OWN hand each
 *    round; the one who went out banks nothing. Lowest total wins.
 *
 * Card values are counted by the scorekeeper into a single leftover total per player
 * (number cards = face value, action cards = `actionValue`, wilds = `wildValue`), so
 * the stored round is just "who went out" + "how many points each hand held" — mode is
 * a pure function of that, which keeps history re-scorable and the logic trivially pure.
 */

export type UnoMode = 'winner' | 'golf';

export interface UnoConfig {
  /** Race-to score that ends the game (default 500). 0 = play forever. */
  target: number;
  /** How leftover cards turn into points at the end of a hand. */
  mode: UnoMode;
  /** Points for each Skip / Reverse / Draw Two left in a hand (editor quick-add). */
  actionValue: number;
  /** Points for each Wild / Wild Draw Four left in a hand (editor quick-add). */
  wildValue: number;
}

export interface UnoInput {
  /** The player who emptied their hand to end the round. */
  out: ID | null;
  /** Each player's leftover card points at round end. The player who went out holds 0. */
  left: Record<ID, number>;
}

export const UNO_DEFAULTS: UnoConfig = {
  target: 500,
  mode: 'winner',
  actionValue: 20,
  wildValue: 50,
};

/** Read a raw config bag into a validated {@link UnoConfig}, falling back on defaults. */
export function readConfig(config: Record<string, unknown> | undefined): UnoConfig {
  const c = config ?? {};
  const num = (v: unknown, d: number): number => {
    if (v === null || v === undefined || v === '') return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  return {
    target: num(c.target, UNO_DEFAULTS.target),
    mode: c.mode === 'golf' ? 'golf' : 'winner',
    actionValue: num(c.actionValue, UNO_DEFAULTS.actionValue),
    wildValue: num(c.wildValue, UNO_DEFAULTS.wildValue),
  };
}

/** A fresh, zeroed round input for the current roster. */
export function createUnoInput(playerIds: ID[]): UnoInput {
  return {
    out: null,
    left: Object.fromEntries(playerIds.map((id) => [id, 0])),
  };
}

/** A player's leftover points, clamped to a non-negative number. */
export function leftOf(input: UnoInput, id: ID): number {
  return Math.max(0, Number(input.left[id]) || 0);
}

/** Sum of the leftover points held by everyone except the player who went out. */
export function opponentsTotal(input: UnoInput, playerIds: ID[]): number {
  return playerIds.reduce(
    (sum, id) => (id === input.out ? sum : sum + leftOf(input, id)),
    0,
  );
}

export function validateUno(
  input: UnoInput,
  players: { id: ID; name: string }[],
): string | null {
  if (!input.out) return 'Tap the player who went out (emptied their hand).';
  if (!players.some((p) => p.id === input.out)) {
    return 'The player who went out is not in this game.';
  }
  for (const p of players) {
    const raw = input.left[p.id];
    if (raw == null) continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) {
      return `${p.name}'s leftover points must be 0 or more.`;
    }
  }
  return null;
}

/** Compute per-player point deltas for a hand. */
export function scoreUno(
  input: UnoInput,
  playerIds: ID[],
  config: Record<string, unknown> | undefined,
): Record<ID, number> {
  const { mode } = readConfig(config);
  const out: Record<ID, number> = {};
  if (mode === 'golf') {
    // Everyone banks the points still in their own hand; the winner banks nothing.
    for (const id of playerIds) out[id] = id === input.out ? 0 : leftOf(input, id);
  } else {
    // The player who went out scoops every opponent's leftover cards.
    const scooped = input.out ? opponentsTotal(input, playerIds) : 0;
    for (const id of playerIds) out[id] = id === input.out ? scooped : 0;
  }
  return out;
}

/** Game ends when any total reaches the target (both modes; low wins in golf). */
export function isUnoFinished(
  totals: Record<ID, number>,
  config: Record<string, unknown> | undefined,
): boolean {
  const { target } = readConfig(config);
  if (target <= 0) return false;
  const vals = Object.values(totals);
  return vals.length > 0 && vals.some((t) => t >= target);
}
