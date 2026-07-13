import type { ID, Player } from '../../types';

/**
 * The pure, deterministic scoring core for Wingspan — no Svelte, no IndexedDB, no I/O.
 * {@link ./index index.ts} wraps these into a `GameModule`; keeping them here (mirroring
 * `skullking`, `hearts` and the `custom` engine) makes the maths independently unit-testable
 * and safe for `stats.ts` to import.
 *
 * Wingspan is an **end-game category scorer**: at game end each player totals points from a
 * handful of categories and the highest total wins. Score King models one game as a single
 * final scoresheet (one round, a column per category per player) — exactly like the real
 * Wingspan score pad.
 */

export interface WingspanConfig {
  /** Oceania expansion — adds a Nectar scoring category. */
  nectar?: boolean;
  /** Track each player's leftover food to settle ties (default on). Never scores points. */
  trackFood?: boolean;
}

/** One player's column of category values on the final scoresheet. */
export interface WingspanRow {
  /** Points printed on the birds you played. */
  birds: number;
  /** Points from your bonus cards. */
  bonus: number;
  /** Points from the end-of-round goal tiles. */
  goals: number;
  /** 1 point per egg on your birds. */
  eggs: number;
  /** 1 point per food cached on your birds. */
  food: number;
  /** 1 point per card tucked under your birds. */
  tucked: number;
  /** Nectar majorities, scored per habitat (Oceania). Stays 0 unless the expansion is on. */
  nectar: number;
  /** Leftover food tokens — the tiebreaker only, never added to the score. */
  leftover: number;
}

export interface WingspanInput {
  rows: Record<ID, WingspanRow>;
}

/**
 * How a category value is entered on the sheet — mirrors Finspan so the two siblings share one
 * interaction model:
 *   `points` — a big, typeable total (birds, bonus, goals, nectar majorities). Tapping a stepper
 *              to 87 birds is miserable, so these get a fast numeric field.
 *   `count`  — a small 1-point tally (eggs, cached food, tucked cards, the food tiebreaker) that
 *              earns the satisfying +1 Stepper nudge.
 */
export type WingspanEntry = 'points' | 'count';

export interface CategoryDef {
  key: keyof WingspanRow;
  label: string;
  /** Compact label for the entry grid. */
  short: string;
  emoji: string;
  /** Numeric field for big totals vs the +1 Stepper for token tallies. */
  entry: WingspanEntry;
  help: string;
}

/** The base six categories — always present, in the order they sit on the real score pad. */
export const BASE_CATEGORIES: CategoryDef[] = [
  { key: 'birds', label: 'Birds', short: 'Birds', emoji: '🐦', entry: 'points', help: 'Points printed on the birds in your habitats.' },
  { key: 'bonus', label: 'Bonus cards', short: 'Bonus', emoji: '🎯', entry: 'points', help: "Points from your bonus cards' conditions." },
  { key: 'goals', label: 'End-of-round goals', short: 'Goals', emoji: '🎖️', entry: 'points', help: 'Points from the four end-of-round goal tiles.' },
  { key: 'eggs', label: 'Eggs', short: 'Eggs', emoji: '🥚', entry: 'count', help: '1 point per egg on your bird cards.' },
  { key: 'food', label: 'Cached food', short: 'Cached', emoji: '🌰', entry: 'count', help: '1 point per food token cached on your bird cards.' },
  { key: 'tucked', label: 'Tucked cards', short: 'Tucked', emoji: '🃏', entry: 'count', help: '1 point per card tucked under your birds.' },
];

/** Oceania's Nectar category, shown only when the expansion is toggled on. */
export const NECTAR_CATEGORY: CategoryDef = {
  key: 'nectar',
  label: 'Nectar',
  short: 'Nectar',
  emoji: '🌸',
  entry: 'points',
  help: 'Nectar majorities scored per habitat (Oceania expansion).',
};

/** The leftover-food tiebreaker — captured, shown apart, and never scored. */
export const LEFTOVER_CATEGORY: CategoryDef = {
  key: 'leftover',
  label: 'Unused food',
  short: 'Food left',
  emoji: '🍽️',
  entry: 'count',
  help: 'Leftover food tokens settle ties — the most unused food wins. Never added to the score.',
};

/** Every scoring key, in pad order. Nectar is always summed; it stays 0 when the toggle is off. */
export const SCORING_KEYS: (keyof WingspanRow)[] = [
  'birds',
  'bonus',
  'goals',
  'eggs',
  'food',
  'tucked',
  'nectar',
];

export function isNectarOn(config: WingspanConfig | Record<string, unknown> | undefined): boolean {
  return !!(config as WingspanConfig | undefined)?.nectar;
}

/** Tiebreaker tracking defaults ON — only an explicit `false` turns the leftover column off. */
export function tracksFood(config: WingspanConfig | Record<string, unknown> | undefined): boolean {
  return (config as WingspanConfig | undefined)?.trackFood !== false;
}

/** The scoring columns the editor should show for a given config (base six, plus Nectar). */
export function scoringCategories(
  config: WingspanConfig | Record<string, unknown> | undefined,
): CategoryDef[] {
  return isNectarOn(config) ? [...BASE_CATEGORIES, NECTAR_CATEGORY] : [...BASE_CATEGORIES];
}

/** A fresh, all-zero column for one player. */
export function emptyRow(): WingspanRow {
  return { birds: 0, bonus: 0, goals: 0, eggs: 0, food: 0, tucked: 0, nectar: 0, leftover: 0 };
}

/** Coerce anything into a safe numeric contribution. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * One player's final score: the sum of the scoring categories. Config-independent by design —
 * disabled categories (e.g. Nectar) are simply left at 0, so `describeRound` and `stats.ts`
 * can total a row without knowing the game's config, and the number can never drift.
 */
export function scoreRow(row: WingspanRow | undefined): number {
  if (!row) return 0;
  let sum = 0;
  for (const k of SCORING_KEYS) sum += num(row[k]);
  return sum;
}

/** Score the whole scoresheet: every player's final total, keyed by player id. */
export function scoreWingspanRound(
  input: WingspanInput | undefined,
  players: Player[],
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const p of players) out[p.id] = scoreRow(input?.rows?.[p.id]);
  return out;
}

/** Look up a friendly label for any row field (for validation messages). */
export function fieldLabel(key: keyof WingspanRow): string {
  if (key === NECTAR_CATEGORY.key) return NECTAR_CATEGORY.label;
  if (key === LEFTOVER_CATEGORY.key) return LEFTOVER_CATEGORY.label;
  return BASE_CATEGORIES.find((c) => c.key === key)?.label ?? String(key);
}

const MAX_FIELD = 999;

/**
 * Validate a scoresheet: every entered value must be a whole number in `0..999`. Returns the
 * first human-readable problem, or `null` when the sheet is clean. Config-free — unused columns
 * sit at 0 and always pass.
 */
export function validateWingspanRound(
  input: WingspanInput | undefined,
  players: Player[],
): string | null {
  const keys = Object.keys(emptyRow()) as (keyof WingspanRow)[];
  for (const p of players) {
    const row = input?.rows?.[p.id];
    if (!row) continue;
    for (const key of keys) {
      const v = Number(row[key]);
      if (!Number.isFinite(v) || v < 0) return `${p.name}: ${fieldLabel(key)} can't be negative.`;
      if (!Number.isInteger(v)) return `${p.name}: ${fieldLabel(key)} must be a whole number.`;
      if (v > MAX_FIELD) return `${p.name}: ${fieldLabel(key)} looks too high — double-check it.`;
    }
  }
  return null;
}

/** A concise, glanceable per-player summary of a recorded scoresheet for the history table. */
export function describeWingspanRound(
  input: WingspanInput | undefined,
  players: Player[],
): string {
  const parts: string[] = [];
  for (const p of players) {
    const row = input?.rows?.[p.id];
    if (!row) continue;
    parts.push(`${p.name} ${scoreRow(row)}`);
  }
  return parts.length ? parts.join(' · ') : 'no scores';
}

/**
 * The four Wingspan habitats, in the order a growing flock settles them (Forest → Grassland →
 * Wetland → Oceania). A player's running total climbs through them as it grows, giving the tally
 * a sense of place ("your flock has reached the Wetland") without ever relying on colour alone —
 * every tier carries an emoji and a label. This is Wingspan's costume equivalent of Finspan's
 * depth zones. `min` is the inclusive floor; tiers are listed richest-last so {@link habitatTier}
 * can scan from the bottom up.
 */
export interface HabitatTier {
  key: 'forest' | 'grassland' | 'wetland' | 'oceania';
  label: string;
  emoji: string;
  /** Inclusive lower bound, in points. */
  min: number;
}

export const HABITAT_TIERS: readonly HabitatTier[] = [
  { key: 'forest', label: 'Forest', emoji: '🌲', min: 0 },
  { key: 'grassland', label: 'Grassland', emoji: '🌾', min: 40 },
  { key: 'wetland', label: 'Wetland', emoji: '💧', min: 70 },
  { key: 'oceania', label: 'Oceania', emoji: '🌊', min: 100 },
] as const;

/** A thriving flock — the point total at which the gauge reads brim-full. */
export const FULL_FLOCK = 120;

/** Which habitat tier a running total currently sits in (negatives/NaN clamp to Forest). */
export function habitatTier(total: number): HabitatTier {
  const n = Number(total);
  let tier = HABITAT_TIERS[0];
  if (!Number.isFinite(n)) return tier;
  for (const t of HABITAT_TIERS) {
    if (n >= t.min) tier = t;
  }
  return tier;
}

/** How full the flock gauge reads, 0–1, for a running total (clamped to {@link FULL_FLOCK}). */
export function flockFill(total: number): number {
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n / FULL_FLOCK);
}
