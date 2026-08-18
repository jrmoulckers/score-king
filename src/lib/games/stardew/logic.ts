import type { ID, Round } from '../../types';

/**
 * Pure, Svelte-free evaluation core for Stardew Valley: The Board Game — a
 * cooperative farm-restoration game for 1–4 players. Kept separate from
 * `index.ts` (which carries the module wiring) so `stardew.test.ts` can exercise
 * the real scoring without a DOM. No I/O, no randomness — just data in, points
 * and candle tiers out.
 *
 * ## Co-op shape
 * The GameModule contract is player/point oriented, but this game is one shared
 * story: the whole table restores the Community Center and meets Grandpa's Goals
 * together, then earns a single **Grandpa's Evaluation** score. So each season's
 * points are handed to *every* seat equally (see `index.ts scoreRound`), keeping
 * all totals identical = the farm's shared evaluation score. Winning is the group
 * reaching a target candle tier — never player-vs-player. The module flags itself
 * `coop: true` so the shell narrates a shared win instead of a tie, and never
 * crowns an arbitrary "leader" at a table that is equal by design.
 */

/** The four in-game seasons, cycled across the year(s). */
export const SEASONS = [
  { name: 'Spring', emoji: '🌱' },
  { name: 'Summer', emoji: '☀️' },
  { name: 'Fall', emoji: '🍂' },
  { name: 'Winter', emoji: '❄️' },
] as const;

export const SEASONS_PER_YEAR = SEASONS.length;

/** Hard ceiling on game length, in in-game years. */
export const MAX_YEARS = 4;

export type CategoryKey = 'bundles' | 'goals' | 'fish' | 'gold';

/** One season's contribution to Grandpa's Evaluation, per category. */
export interface StardewSeasonInput {
  /** Community Center bundles restored this season. */
  bundles: number;
  /** Grandpa's Goals met this season. */
  goals: number;
  /** Legendary Fish landed this season. */
  fish: number;
  /** Gold-prosperity milestones reached this season. */
  gold: number;
}

export interface EvalCategory {
  key: CategoryKey;
  label: string;
  emoji: string;
  /** Most points this category can contribute across the whole game. */
  cap: number;
  hint: string;
}

/**
 * Grandpa's Evaluation categories. Each unit is worth one evaluation point and
 * the caps mirror the real game: 6 Community Center bundle rooms, 4 Grandpa's
 * Goals revealed at setup, 5 Legendary Fish, and up to 3 points of gold
 * prosperity — a top score of 18.
 */
export const EVAL_CATEGORIES: readonly EvalCategory[] = [
  {
    key: 'bundles',
    label: 'Bundles restored',
    emoji: '🎁',
    cap: 6,
    hint: 'Community Center rooms completed',
  },
  { key: 'goals', label: "Grandpa's Goals met", emoji: '📜', cap: 4, hint: 'Goal cards fulfilled' },
  { key: 'fish', label: 'Legendary Fish', emoji: '🐟', cap: 5, hint: 'Legendary catches landed' },
  {
    key: 'gold',
    label: 'Gold prosperity',
    emoji: '💰',
    cap: 3,
    hint: 'Wealth milestones (0–3 pts)',
  },
] as const;

/** Highest possible evaluation score (Σ caps). */
export const MAX_EVALUATION = EVAL_CATEGORIES.reduce((s, c) => s + c.cap, 0);

export const MAX_CANDLES = 4;

/**
 * Minimum evaluation score that lights each candle tier: ≥1 → 1, ≥6 → 2,
 * ≥10 → 3, ≥14 → 4. A score of 0 lights none. Indexed by (tier − 1).
 */
export const CANDLE_THRESHOLDS = [1, 6, 10, 14] as const;

/** Coerce any stray value to a safe, non-negative whole number of points. */
export function clean(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** A fresh, empty season entry. */
export function emptySeason(): StardewSeasonInput {
  return { bundles: 0, goals: 0, fish: 0, gold: 0 };
}

/** Evaluation points earned in a single season (Σ its categories). */
export function seasonPoints(input: Partial<StardewSeasonInput> | undefined): number {
  if (!input) return 0;
  return EVAL_CATEGORIES.reduce((sum, c) => sum + clean(input[c.key]), 0);
}

/** Candles (0–4) Grandpa lights for a final evaluation score. */
export function candleTier(score: number): number {
  const s = Number(score) || 0;
  let tier = 0;
  for (let i = 0; i < CANDLE_THRESHOLDS.length; i++) {
    if (s >= CANDLE_THRESHOLDS[i]) tier = i + 1;
  }
  return tier;
}

/** Lowest score that reaches a given candle tier (1–4); 0 for tier ≤ 0. */
export function scoreForTier(tier: number): number {
  const t = Math.max(0, Math.min(MAX_CANDLES, Math.round(tier)));
  return t <= 0 ? 0 : CANDLE_THRESHOLDS[t - 1];
}

/** A short, warm word for how proud Grandpa is at each candle tier. */
export function candleVerdict(tier: number): string {
  switch (Math.max(0, Math.min(MAX_CANDLES, Math.round(tier)))) {
    case 4:
      return 'Grandpa is beaming';
    case 3:
      return 'Grandpa is proud';
    case 2:
      return 'A fine start';
    case 1:
      return "You've made a home";
    default:
      return 'The farm needs you';
  }
}

/** Config reader: number of in-game years (game length), clamped to 1–4. */
export function years(config: Record<string, unknown> | undefined): number {
  const y = Math.round(Number(config?.years));
  return Number.isFinite(y) ? Math.max(1, Math.min(MAX_YEARS, y)) : 1;
}

/** Config reader: candle tier the group is aiming for, clamped to 1–4. */
export function targetCandles(config: Record<string, unknown> | undefined): number {
  const t = Math.round(Number(config?.targetCandles));
  return Number.isFinite(t) ? Math.max(1, Math.min(MAX_CANDLES, t)) : MAX_CANDLES;
}

/** Total seasons in a game = 4 × years. */
export function maxSeasons(config: Record<string, unknown> | undefined): number {
  return years(config) * SEASONS_PER_YEAR;
}

export interface SeasonLabel {
  name: string;
  emoji: string;
  /** 1-based year. */
  year: number;
  /** 1-based season-of-year (1–4). */
  ordinal: number;
}

/** Human label for the season at a 0-based round index (Spring Y1, Summer Y1, …). */
export function seasonLabel(roundIndex: number): SeasonLabel {
  const i = Math.max(0, Math.floor(Number(roundIndex) || 0));
  const s = SEASONS[i % SEASONS_PER_YEAR];
  return {
    name: s.name,
    emoji: s.emoji,
    year: Math.floor(i / SEASONS_PER_YEAR) + 1,
    ordinal: (i % SEASONS_PER_YEAR) + 1,
  };
}

export type CategoryTotals = Record<CategoryKey, number>;

/** Sum each category across the seasons recorded *before* `beforeIndex`. */
export function priorCategoryTotals(
  rounds: readonly Round[] | undefined,
  beforeIndex: number,
): CategoryTotals {
  const totals: CategoryTotals = { bundles: 0, goals: 0, fish: 0, gold: 0 };
  for (const r of rounds ?? []) {
    if (r.index >= beforeIndex) continue;
    const input = r.input as Partial<StardewSeasonInput> | undefined;
    for (const c of EVAL_CATEGORIES) totals[c.key] += clean(input?.[c.key]);
  }
  return totals;
}

/** Points a category can still earn given what's already been logged. */
export function remainingCap(key: CategoryKey, prior: CategoryTotals): number {
  const cap = EVAL_CATEGORIES.find((c) => c.key === key)?.cap ?? 0;
  return Math.max(0, cap - (prior[key] ?? 0));
}

/**
 * Validate one season's entry against the running category totals. Returns a
 * human-readable message, or null when the entry is legal. Guards non-negative
 * whole numbers and the per-category caps (you can't restore a 7th bundle).
 */
export function validateSeason(
  input: Partial<StardewSeasonInput> | undefined,
  prior: CategoryTotals,
): string | null {
  for (const c of EVAL_CATEGORIES) {
    const raw = Number(input?.[c.key]);
    if (!Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) {
      return `${c.emoji} ${c.label}: enter a whole number of points (0 or more).`;
    }
    const after = (prior[c.key] ?? 0) + raw;
    if (after > c.cap) {
      const left = remainingCap(c.key, prior);
      return `${c.emoji} ${c.label} tops out at ${c.cap} — only ${left} left to log.`;
    }
  }
  return null;
}

/**
 * The shared group evaluation score from per-player totals. Every seat carries
 * the same running total in this co-op game, so any of them is the group score;
 * `max` is used defensively against an empty or ragged map.
 */
export function evaluationScore(totals: Record<ID, number> | undefined): number {
  const vals = Object.values(totals ?? {});
  return vals.length ? Math.max(...vals) : 0;
}

/** Did the group light at least the target number of candles? */
export function groupWon(score: number, config: Record<string, unknown> | undefined): boolean {
  return candleTier(score) >= targetCandles(config);
}

/** One-line summary of a recorded season for the history table. */
export function describeSeason(round: Round): string {
  const input = round.input as Partial<StardewSeasonInput> | undefined;
  const { emoji, name, year } = seasonLabel(round.index);
  const parts = EVAL_CATEGORIES.map((c) => {
    const v = clean(input?.[c.key]);
    return v ? `${c.emoji}${v}` : '';
  }).filter(Boolean);
  const pts = seasonPoints(input);
  const detail = parts.length ? parts.join(' ') : 'a quiet season';
  return `${emoji} ${name} Y${year} · ${detail} · +${pts} for the farm`;
}

export const STARDEW_HELP = [
  '🌾 A cozy co-op: the whole table shares one farm and plays against the game.',
  'Work together over the seasons to restore the Community Center and meet',
  "Grandpa's Goals, then earn Grandpa's Evaluation.",
  '',
  'Each season, log the evaluation points the group earned together — every',
  'point counts once for the whole farm, not per player:',
  '• 🎁 Bundles restored — up to 6 (one per Community Center room)',
  "• 📜 Grandpa's Goals met — up to 4",
  '• 🐟 Legendary Fish landed — up to 5',
  '• 💰 Gold prosperity — up to 3 (wealth & friendships flourishing)',
  '',
  `Add it all up for the final evaluation (top score ${MAX_EVALUATION}). Grandpa lights candles:`,
  '• 1–5 → 🕯️ · 6–9 → 🕯️🕯️ · 10–13 → 🕯️🕯️🕯️ · 14+ → 🕯️🕯️🕯️🕯️',
  '',
  'Reach your target candles and the whole table wins together — every seat',
  'shows the same score on purpose. 4 candles means Grandpa is beaming.',
].join('\n');
