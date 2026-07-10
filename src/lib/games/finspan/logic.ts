import type { ID, Player, Round } from '../../types';

/**
 * Finspan — the fish-themed end-game category scorer.
 * ---------------------------------------------------
 * Finspan (Stonemaier Games, 2025) is played over four "weeks" in the Sunlight,
 * Twilight and Midnight zones of the ocean; at the end there is one final scoresheet
 * that totals each researcher's ocean, and the highest total wins. This module is the
 * pure, Svelte-free scoring core — a column per end-game category, summed to a total —
 * so `finspan.test.ts` can exercise the real math without importing the editor.
 *
 * Categories and point values follow the official end-of-game sequence verbatim:
 *   1. Weeks 1-3 achievements — points banked on the scorepad during play.
 *   2. Game End (yellow) fish abilities.
 *   3. Fish        — points printed on your visible (uncovered) fish.
 *   4. Consumed    — 1 point per consumed fish (cards and forage).
 *   5. Eggs & young — 1 point for each egg and each young.
 *   6. Schools     — 6 points each.
 * There are no personal bonus cards and no depth-zone point multipliers.
 */

/** How a category value is entered on the sheet. */
export type FinspanEntry = 'points' | 'count';

/**
 * Which part of the scoresheet a category belongs to. The three identical weekly
 * achievements collapse into one "Weekly achievements" trio in the editor; everything
 * else is a card in your ocean. Purely a presentation grouping — scoring is unchanged.
 */
export type FinspanGroup = 'weekly' | 'ocean';

export interface FinspanCategory {
  /** Stable key stored on the round input. */
  key: string;
  /** Short scorepad label. */
  label: string;
  emoji: string;
  /** Points awarded per unit entered — 6 for schools, otherwise 1. */
  per: number;
  /**
   * `points` — the entered value already *is* points (fish, abilities, achievements).
   * `count`  — the value is a token/card count the sheet multiplies by {@link per}.
   */
  entry: FinspanEntry;
  /** Editor grouping: the weekly achievements trio vs the rest of your ocean. */
  group: FinspanGroup;
  /** One-line scoring reference, shown in the editor and the help popover. */
  hint: string;
}

/** The Finspan scoresheet columns, in official end-of-game order. */
export const FINSPAN_CATEGORIES: readonly FinspanCategory[] = [
  {
    key: 'week1',
    label: 'Week 1',
    emoji: '🏅',
    per: 1,
    entry: 'points',
    group: 'weekly',
    hint: 'Achievement points you banked at the end of week 1.',
  },
  {
    key: 'week2',
    label: 'Week 2',
    emoji: '🏅',
    per: 1,
    entry: 'points',
    group: 'weekly',
    hint: 'Achievement points you banked at the end of week 2.',
  },
  {
    key: 'week3',
    label: 'Week 3',
    emoji: '🏅',
    per: 1,
    entry: 'points',
    group: 'weekly',
    hint: 'Achievement points you banked at the end of week 3.',
  },
  {
    key: 'gameEnd',
    label: 'Game end',
    emoji: '🟡',
    per: 1,
    entry: 'points',
    group: 'ocean',
    hint: 'Points from yellow "GAME END" fish abilities (visible fish only).',
  },
  {
    key: 'fish',
    label: 'Fish',
    emoji: '🐟',
    per: 1,
    entry: 'points',
    group: 'ocean',
    hint: 'Points printed on your visible (uncovered) fish.',
  },
  {
    key: 'consumed',
    label: 'Consumed',
    emoji: '🍽️',
    per: 1,
    entry: 'count',
    group: 'ocean',
    hint: '1 point for each consumed fish — cards and forage.',
  },
  {
    key: 'eggsYoung',
    label: 'Eggs & young',
    emoji: '🥚',
    per: 1,
    entry: 'count',
    group: 'ocean',
    hint: '1 point for each egg and each young in your ocean.',
  },
  {
    key: 'schools',
    label: 'Schools',
    emoji: '🐠',
    per: 6,
    entry: 'count',
    group: 'ocean',
    hint: '6 points for each school — three young shoal into one school.',
  },
] as const;

/** Per-player row: category key -> raw value entered on the sheet. */
export type FinspanRow = Record<string, number>;

export interface FinspanInput {
  /** player id -> their scoresheet row. */
  values: Record<ID, FinspanRow>;
}

/** A fresh, all-zero row covering every category. */
export function emptyRow(): FinspanRow {
  const row: FinspanRow = {};
  for (const c of FINSPAN_CATEGORIES) row[c.key] = 0;
  return row;
}

/** A fresh scoresheet for the given players. */
export function emptyInput(players: Player[]): FinspanInput {
  return { values: Object.fromEntries(players.map((p) => [p.id, emptyRow()])) };
}

/** Coerce any stored value to a finite number (0 when blank / NaN). */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Points a single category contributes for a raw entered value. */
export function categoryPoints(cat: FinspanCategory, value: unknown): number {
  return num(value) * cat.per;
}

/** Total points for one player's row across every category. */
export function scoreRow(row: FinspanRow | undefined): number {
  let sum = 0;
  for (const c of FINSPAN_CATEGORIES) sum += categoryPoints(c, row?.[c.key]);
  return sum;
}

/** Just the banked weekly-achievement points (weeks 1–3), for the grouped subtotal. */
export function weeklyTotal(row: FinspanRow | undefined): number {
  let sum = 0;
  for (const c of FINSPAN_CATEGORIES) {
    if (c.group === 'weekly') sum += categoryPoints(c, row?.[c.key]);
  }
  return sum;
}

/**
 * The ocean's three depth zones, shallow → deep. A running total sinks through them as it
 * grows, giving the tally a sense of place ("you've reached the Twilight zone") without ever
 * relying on colour alone — every zone carries an emoji and a label. `min` is the inclusive
 * floor; zones are listed deepest-last so {@link depthZone} can scan from the bottom up.
 */
export interface DepthZone {
  key: 'sunlight' | 'twilight' | 'midnight';
  label: string;
  emoji: string;
  /** Inclusive lower bound, in points. */
  min: number;
}

export const DEPTH_ZONES: readonly DepthZone[] = [
  { key: 'sunlight', label: 'Sunlight', emoji: '☀️', min: 0 },
  { key: 'twilight', label: 'Twilight', emoji: '🌆', min: 40 },
  { key: 'midnight', label: 'Midnight', emoji: '🌑', min: 80 },
] as const;

/** A full "deep ocean" tank — the point total at which the gauge reads brim-full. */
export const FULL_TANK = 120;

/** Which depth zone a running total currently sits in (negatives clamp to Sunlight). */
export function depthZone(total: number): DepthZone {
  const n = Number(total);
  let zone = DEPTH_ZONES[0];
  if (!Number.isFinite(n)) return zone;
  for (const z of DEPTH_ZONES) {
    if (n >= z.min) zone = z;
  }
  return zone;
}

/** How full the ocean tank reads, 0–1, for a running total (clamped to {@link FULL_TANK}). */
export function tankFill(total: number): number {
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n / FULL_TANK);
}

/** Per-player point totals for the whole scoresheet. */
export function scoreFinspan(
  input: FinspanInput | undefined,
  players: Player[],
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const p of players) out[p.id] = scoreRow(input?.values?.[p.id]);
  return out;
}

/** Validate the sheet: every entry a whole, non-negative number. Null when valid. */
export function validateFinspan(
  input: FinspanInput | undefined,
  players: Player[],
): string | null {
  if (!input?.values) return null;
  for (const p of players) {
    const row = input.values[p.id];
    if (!row) continue;
    for (const c of FINSPAN_CATEGORIES) {
      const n = Number(row[c.key]);
      if (!Number.isFinite(n)) continue; // blank -> treated as 0, like scoreRow
      if (n < 0) return `${p.name}: ${c.label} can't be negative.`;
      if (!Number.isInteger(n)) return `${p.name}: ${c.label} must be a whole number.`;
    }
  }
  return null;
}

/** A concise per-player summary of the recorded scoresheet for the history table. */
export function describeFinspan(round: Round, players: Player[]): string {
  const input = round.input as FinspanInput | undefined;
  if (!input?.values) return '';
  const parts: string[] = [];
  for (const p of players) {
    if (input.values[p.id]) parts.push(`${p.name} ${scoreRow(input.values[p.id])}`);
  }
  return parts.length ? parts.join(' · ') : 'no score';
}

/** Reference text for the in-game help popover — scoring only, fishy in voice. */
export const FINSPAN_HELP = [
  'Total your ocean after week 4 — the biggest catch wins. 🐟',
  '',
  'Weeks 1-3 🏅: the achievement points you banked at the end of each week.',
  'Game end 🟡: points from yellow "GAME END" fish abilities.',
  'Fish 🐟: points printed on your visible (uncovered) fish.',
  'Consumed 🍽️: 1 point per consumed fish (cards and forage).',
  'Eggs & young 🥚: 1 point for each egg and each young.',
  'Schools 🐠: 6 points each (three young shoal into one school).',
  '',
  'No bonus cards, no depth bonuses — just a deep, well-fed ocean.',
  'Tie? The tied player holding the most fish cards wins.',
].join('\n');
