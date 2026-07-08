import type { ID } from '../../types';

/**
 * Pure, deterministic scoring core for Wyrmspan — no Svelte, no I/O — so it can be
 * unit-tested on its own and imported by both the module and its stats hook.
 *
 * Wyrmspan (Stonemaier, 2024) is the dragon-themed cousin of Wingspan: an end-game
 * CATEGORY scorer. A game is a single final scoresheet — one column per category per
 * player, summed — and the HIGHEST total reigns. The eight categories below are the
 * official end-game scoring steps (Dragon Guild, printed dragon VP, end-game abilities,
 * eggs, cached resources, tucked cards, public objectives, and leftover coins/items).
 */

export interface WyrmspanConfig {
  /** Include the "leftover items" category (1 VP per 4 spare resources/cards). */
  scoreLeftover: boolean;
}

/** One player's final tally — a raw entry per scoring category (never negative). */
export interface WyrmspanRow {
  /** VP from your marker's spaces on the Dragon Guild. */
  guild: number;
  /** Printed VP on visible dragons on your player mat. */
  dragons: number;
  /** VP from end-game abilities on visible dragons. */
  abilities: number;
  /** VP from public objectives (end-of-round goals). */
  objectives: number;
  /** Eggs on your dragons — 1 VP each. */
  eggs: number;
  /** Resources cached on your dragons — 1 VP each. */
  cached: number;
  /** Cards tucked under your dragons — 1 VP each. */
  tucked: number;
  /** Coins remaining — 1 VP each. */
  coins: number;
  /** Other leftover items (resources + dragon/cave cards) — 1 VP per 4, rounded down. */
  leftover: number;
}

export interface WyrmspanInput {
  rows: Record<ID, WyrmspanRow>;
}

export type WyrmspanField = keyof WyrmspanRow;

/**
 * How a category turns its raw entry into VP:
 * - `vp`    the entered number IS the VP (read a total off the board),
 * - `count` 1 VP per item (`per` = 1),
 * - `bundle` 1 VP per `per` items, rounded down (leftover items, `per` = 4).
 */
export type WyrmspanKind = 'vp' | 'count' | 'bundle';

export interface WyrmspanCategory {
  key: WyrmspanField;
  /** Full name for the help sheet. */
  label: string;
  /** Compact name for the entry grid. */
  short: string;
  emoji: string;
  kind: WyrmspanKind;
  /** Items per VP: `vp`/`count` = 1, `bundle` = 4. */
  per: number;
  help: string;
  /** Gated by a config toggle (only `leftover` today). */
  optional?: boolean;
}

/** The eight end-game categories, in the order the rulebook tallies them. */
export const WYRMSPAN_CATEGORIES: readonly WyrmspanCategory[] = [
  {
    key: 'guild',
    label: 'Dragon Guild',
    short: 'Guild',
    emoji: '🏛️',
    kind: 'vp',
    per: 1,
    help: 'VP printed on the spaces your marker reached on the Dragon Guild.',
  },
  {
    key: 'dragons',
    label: 'Dragons',
    short: 'Dragons',
    emoji: '🐉',
    kind: 'vp',
    per: 1,
    help: 'Total printed VP on the visible dragons on your player mat (not tucked, not in hand).',
  },
  {
    key: 'abilities',
    label: 'End-game abilities',
    short: 'Abilities',
    emoji: '✨',
    kind: 'vp',
    per: 1,
    help: 'VP from the end-game (🏆) abilities on your visible dragons — tally each and enter the sum.',
  },
  {
    key: 'objectives',
    label: 'Public objectives',
    short: 'Objectives',
    emoji: '🎯',
    kind: 'vp',
    per: 1,
    help: 'VP awarded for your markers on the end-of-round goals. Ties are friendly — tied players share the higher award.',
  },
  {
    key: 'eggs',
    label: 'Eggs',
    short: 'Eggs',
    emoji: '🥚',
    kind: 'count',
    per: 1,
    help: 'Eggs on your dragons — 1 VP each.',
  },
  {
    key: 'cached',
    label: 'Cached resources',
    short: 'Cached',
    emoji: '📦',
    kind: 'count',
    per: 1,
    help: 'Resources cached (stored) on your dragons — 1 VP each.',
  },
  {
    key: 'tucked',
    label: 'Tucked cards',
    short: 'Tucked',
    emoji: '🗂️',
    kind: 'count',
    per: 1,
    help: 'Cards tucked under your dragons — 1 VP each.',
  },
  {
    key: 'coins',
    label: 'Coins',
    short: 'Coins',
    emoji: '🪙',
    kind: 'count',
    per: 1,
    help: 'Coins remaining in your supply — 1 VP each.',
  },
  {
    key: 'leftover',
    label: 'Leftover items',
    short: 'Leftover',
    emoji: '🧺',
    kind: 'bundle',
    per: 4,
    help: 'Other leftover items — resources plus dragon and cave cards — 1 VP for every 4, rounded down.',
    optional: true,
  },
];

const BY_KEY: Record<WyrmspanField, WyrmspanCategory> = Object.fromEntries(
  WYRMSPAN_CATEGORIES.map((c) => [c.key, c]),
) as Record<WyrmspanField, WyrmspanCategory>;

/** A fresh, all-zero tally. */
export function emptyRow(): WyrmspanRow {
  return {
    guild: 0,
    dragons: 0,
    abilities: 0,
    objectives: 0,
    eggs: 0,
    cached: 0,
    tucked: 0,
    coins: 0,
    leftover: 0,
  };
}

/** Coerce any input into a non-negative whole number (blank/NaN → 0). */
export function cleanValue(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** VP a single category's raw entry is worth. */
export function categoryVP(cat: WyrmspanCategory, value: unknown): number {
  const v = cleanValue(value);
  return cat.kind === 'vp' ? v : Math.floor(v / cat.per);
}

/** Whether a config actually enables the leftover-items category. */
export function leftoverEnabled(config?: Partial<WyrmspanConfig>): boolean {
  return config?.scoreLeftover !== false;
}

/** The categories in play for a given config (drops optional ones that are toggled off). */
export function activeCategories(config?: Partial<WyrmspanConfig>): WyrmspanCategory[] {
  const leftover = leftoverEnabled(config);
  return WYRMSPAN_CATEGORIES.filter((c) => !c.optional || (c.key === 'leftover' ? leftover : true));
}

/** Sum one player's tally into a final score, honoring the active categories. */
export function scoreRow(row: WyrmspanRow | undefined, config?: Partial<WyrmspanConfig>): number {
  if (!row) return 0;
  let sum = 0;
  for (const cat of activeCategories(config)) sum += categoryVP(cat, row[cat.key]);
  return sum;
}

/** Per-player final scores for a whole scoresheet. */
export function scoreWyrmspan(
  input: WyrmspanInput | undefined,
  playerIds: ID[],
  config?: Partial<WyrmspanConfig>,
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = scoreRow(input?.rows?.[id], config);
  return out;
}

/** Null when the scoresheet is valid; otherwise a human-readable reason. */
export function validateRow(row: WyrmspanRow | undefined, name = 'A player'): string | null {
  if (!row) return null;
  for (const cat of WYRMSPAN_CATEGORIES) {
    const raw = Number(row[cat.key]);
    if (Number.isFinite(raw) && raw < 0) return `${name}: ${cat.label} can't be negative.`;
  }
  return null;
}

/** Look a category up by key (handy for the editor + stats). */
export function category(key: WyrmspanField): WyrmspanCategory {
  return BY_KEY[key];
}
