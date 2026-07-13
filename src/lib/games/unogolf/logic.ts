import type { ID } from '../../types';

/**
 * Uno Golf — pure scoring & validation. NO Svelte imports so it stays trivially
 * unit-testable and safe for the stats engine to pull in.
 *
 * The game: a golf-style variant of Uno played over a fixed number of *holes*
 * (hands). Each hole one player goes out (empties their hand) and "sinks the hole"
 * for 0 strokes; every other player counts the cards left in their own hand as
 * strokes — number cards at face value, action cards at {@link UnoGolfConfig.actionValue}
 * each, wilds at {@link UnoGolfConfig.wildValue} each. Play the holes; **lowest**
 * cumulative score wins, exactly like golf.
 */

/** A player's leftover hand at the end of a hole, tallied by card kind. */
export interface UnoGolfHand {
  /** Sum of the face values of the number cards (0–9) left in hand. */
  numbers: number;
  /** Count of action cards left (Skip / Reverse / Draw Two). */
  actions: number;
  /** Count of wild cards left (Wild / Wild Draw Four). */
  wilds: number;
}

export interface UnoGolfInput {
  /** Per-player leftover-card tally for this hole. */
  hands: Record<ID, UnoGolfHand>;
  /** Who went out (emptied their hand). They sink the hole for 0 strokes. */
  out: ID | null;
}

/** How the game ends: a fixed number of holes, or the first to a target score. */
export type UnoGolfFormat = 'holes' | 'target';

export interface UnoGolfConfig {
  holes: number;
  format: UnoGolfFormat;
  target: number;
  actionValue: number;
  wildValue: number;
}

export const DEFAULTS: UnoGolfConfig = {
  holes: 9,
  format: 'holes',
  target: 100,
  actionValue: 20,
  wildValue: 50,
};

const toNum = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Resolve a raw config record into typed, sanitised values with defaults. */
export function resolveConfig(config: Record<string, unknown> | undefined): UnoGolfConfig {
  const c = config ?? {};
  return {
    holes: Math.max(1, Math.round(toNum(c.holes, DEFAULTS.holes))),
    format: c.format === 'target' ? 'target' : 'holes',
    target: Math.max(1, Math.round(toNum(c.target, DEFAULTS.target))),
    actionValue: Math.max(0, toNum(c.actionValue, DEFAULTS.actionValue)),
    wildValue: Math.max(0, toNum(c.wildValue, DEFAULTS.wildValue)),
  };
}

/** A fresh, empty leftover hand (no cards counted yet). */
export function emptyHand(): UnoGolfHand {
  return { numbers: 0, actions: 0, wilds: 0 };
}

type CardValues = Pick<UnoGolfConfig, 'actionValue' | 'wildValue'>;

/** Strokes a single leftover hand is worth, given the card values in play. */
export function handStrokes(hand: UnoGolfHand | undefined, cfg: CardValues): number {
  if (!hand) return 0;
  const numbers = Math.max(0, toNum(hand.numbers, 0));
  const actions = Math.max(0, toNum(hand.actions, 0));
  const wilds = Math.max(0, toNum(hand.wilds, 0));
  return numbers + actions * cfg.actionValue + wilds * cfg.wildValue;
}

/** Per-player strokes for one hole. The player who went out scores 0. */
export function scoreHole(
  input: UnoGolfInput,
  playerIds: ID[],
  cfg: CardValues,
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) {
    out[id] = input.out === id ? 0 : handStrokes(input.hands?.[id], cfg);
  }
  return out;
}

/**
 * "Closest to the pin": among the players who did NOT sink the hole, the one who
 * carried the fewest leftover strokes — a fun, golf-flavoured relative nod. Returns
 * that player's id, or `null` when there's no clear winner: nobody is out yet, fewer
 * than two players are counting strokes, or the lowest count is tied. Pure so the
 * editor and tests share one definition of who parked it closest.
 */
export function closestToPin(
  input: UnoGolfInput,
  playerIds: ID[],
  cfg: CardValues,
): ID | null {
  if (!input.out) return null;
  const counters = playerIds.filter((id) => id !== input.out);
  if (counters.length < 2) return null;
  let bestId: ID | null = null;
  let best = Infinity;
  let tied = false;
  for (const id of counters) {
    const s = handStrokes(input.hands?.[id], cfg);
    if (s < best) {
      best = s;
      bestId = id;
      tied = false;
    } else if (s === best) {
      tied = true;
    }
  }
  return tied ? null : bestId;
}

/** Validate a hole entry. Returns null when valid, else a friendly message. */
export function validateHole(
  input: UnoGolfInput,
  playerIds: ID[],
  nameOf: (id: ID) => string,
): string | null {
  if (!input.out) return 'Tap ⛳ to mark who sank the hole (went out).';
  if (!playerIds.includes(input.out)) return 'The player who went out isn’t in this game.';
  for (const id of playerIds) {
    if (id === input.out) continue;
    const h = input.hands?.[id];
    if (!h) continue;
    if (toNum(h.numbers, 0) < 0 || toNum(h.actions, 0) < 0 || toNum(h.wilds, 0) < 0) {
      return `${nameOf(id)}: card counts can’t be negative.`;
    }
  }
  return null;
}
