import type { ID } from '../../types';

/**
 * Rummy scoring — pure and Svelte-free so it can be unit-tested directly and reused by
 * the editor for live previews (see README "Adding a game").
 *
 * Classic (basic) Rummy: play in melds/sets/runs until one player goes out (empties
 * their hand). That player scores the value of every card left in EVERYONE ELSE's
 * hand — the deadwood. Card values:
 *  - Number cards (2–10): pip/face value.
 *  - Face cards (J, Q, K): 10 each.
 *  - Aces: `aceHigh` config — 1 (low, classic) or 15 (high, some house rules).
 *
 * Optional house rule: going "Rummy" — going out in a single turn with no prior melds
 * laid down — doubles the winner's score for that hand. It's a per-round flag the
 * scorekeeper sets, gated by the `allowRummyBonus` config toggle.
 *
 * Card values are counted by the scorekeeper into a single leftover total per player
 * (pips = summed number-card value, faces = count of face cards, aces = count of
 * aces), so the stored round is just "who went out" + "how many points each hand
 * held" + "was it a Rummy" — scoring is a pure function of that, which keeps history
 * re-scorable and the logic trivially pure.
 */

export interface RummyConfig {
  /** Race-to score that ends the game (default 100). 0 = play forever. */
  target: number;
  /** Ace value: low = 1 point each (classic), high = 15 points each (house rule). */
  aceHigh: boolean;
  /** Whether the "went Rummy" (no prior melds) double-bonus is offered in the editor. */
  allowRummyBonus: boolean;
}

/**
 * A leftover hand tallied by card kind, so the editor can add cards by *type* (the way
 * you actually read a fanned-out hand) instead of pre-summing points in your head:
 *  - `pips`: the summed face value of the number cards (2–10) left in hand
 *  - `faces`: how many face cards (J, Q, K) are left
 *  - `aces`: how many Aces are left
 * Purely an entry convenience — the authoritative points value is always {@link RummyInput.left},
 * which the editor keeps in sync via {@link handValue}. Absent on rounds saved before the
 * per-kind tally existed, which still score fine from `left` alone.
 */
export interface RummyHand {
  pips: number;
  faces: number;
  aces: number;
}

export interface RummyInput {
  /** The player who emptied their hand to end the round. */
  out: ID | null;
  /** Each player's leftover card points at round end. The player who went out holds 0. */
  left: Record<ID, number>;
  /**
   * Optional per-kind breakdown behind each player's {@link left} total, so re-opening a
   * round restores the exact card counts. `left` stays authoritative for scoring; this is
   * a display/editing aid only and may be absent (older rounds, or a hand typed as a lump).
   */
  hands?: Record<ID, RummyHand>;
  /**
   * Whether the winner went "Rummy" this hand — went out in one turn with no melds laid
   * down beforehand. Doubles the scored points when `allowRummyBonus` is on. Ignored (and
   * never applied) with no winner.
   */
  wentRummy?: boolean;
}

export const RUMMY_DEFAULTS: RummyConfig = {
  target: 100,
  aceHigh: false,
  allowRummyBonus: true,
};

/** Read a raw config bag into a validated {@link RummyConfig}, falling back on defaults. */
export function readConfig(config: Record<string, unknown> | undefined): RummyConfig {
  const c = config ?? {};
  const num = (v: unknown, d: number): number => {
    if (v === null || v === undefined || v === '') return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
  return {
    target: num(c.target, RUMMY_DEFAULTS.target),
    aceHigh: bool(c.aceHigh, RUMMY_DEFAULTS.aceHigh),
    allowRummyBonus: bool(c.allowRummyBonus, RUMMY_DEFAULTS.allowRummyBonus),
  };
}

/** Points a single Ace is worth given the configured ace value. */
export function aceValue(cfg: Pick<RummyConfig, 'aceHigh'>): number {
  return cfg.aceHigh ? 15 : 1;
}

/** A fresh, zeroed round input for the current roster. */
export function createRummyInput(playerIds: ID[]): RummyInput {
  return {
    out: null,
    left: Object.fromEntries(playerIds.map((id) => [id, 0])),
    hands: Object.fromEntries(playerIds.map((id) => [id, emptyHand()])),
    wentRummy: false,
  };
}

/** A fresh, empty per-kind hand (no cards counted yet). */
export function emptyHand(): RummyHand {
  return { pips: 0, faces: 0, aces: 0 };
}

/** Points a per-kind hand is worth given the card values in play. Clamps to ≥ 0. */
export function handValue(
  hand: RummyHand | undefined,
  cfg: Pick<RummyConfig, 'aceHigh'>,
): number {
  if (!hand) return 0;
  const pips = Math.max(0, Number(hand.pips) || 0);
  const faces = Math.max(0, Number(hand.faces) || 0);
  const aces = Math.max(0, Number(hand.aces) || 0);
  return pips + faces * 10 + aces * aceValue(cfg);
}

/** A player's leftover points, clamped to a non-negative number. */
export function leftOf(input: RummyInput, id: ID): number {
  return Math.max(0, Number(input.left[id]) || 0);
}

/** Sum of the leftover points held by everyone except the player who went out. */
export function opponentsTotal(input: RummyInput, playerIds: ID[]): number {
  return playerIds.reduce((sum, id) => (id === input.out ? sum : sum + leftOf(input, id)), 0);
}

export function validateRummy(
  input: RummyInput,
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

/**
 * Compute per-player point deltas for a hand. The player who went out scoops every
 * opponent's leftover deadwood; a "went Rummy" hand (no prior melds) doubles it when
 * the house rule is enabled.
 */
export function scoreRummy(
  input: RummyInput,
  playerIds: ID[],
  config: Record<string, unknown> | undefined,
): Record<ID, number> {
  const cfg = readConfig(config);
  const out: Record<ID, number> = {};
  if (!input.out) {
    for (const id of playerIds) out[id] = 0;
    return out;
  }
  let scooped = opponentsTotal(input, playerIds);
  if (cfg.allowRummyBonus && input.wentRummy) scooped *= 2;
  for (const id of playerIds) out[id] = id === input.out ? scooped : 0;
  return out;
}

/** Game ends when any total reaches the target. */
export function isRummyFinished(
  totals: Record<ID, number>,
  config: Record<string, unknown> | undefined,
): boolean {
  const { target } = readConfig(config);
  if (target <= 0) return false;
  const vals = Object.values(totals);
  return vals.length > 0 && vals.some((t) => t >= target);
}
