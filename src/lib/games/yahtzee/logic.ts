import type { ID, Round, RoundContext } from '../../types';

/**
 * Yahtzee — the classic 13-category dice scorecard. Pure, Svelte-free logic so it can be
 * unit-tested (see `yahtzee.test.ts`) without importing the editor.
 *
 * ## The round model
 * A real scorecard lets each player fill its 13 boxes in whatever order their own rolls
 * favour. Score King's engine scores the *whole table* once per round, so instead we fix
 * the 13 categories to the 13 rounds, in the order they're printed on a physical
 * scorecard (Ones…Sixes, then 3-of-a-Kind…Chance). Every player fills the SAME category
 * each round — you still roll and choose for yourself at the table, just enter the
 * resulting number into the box that's up when it's that category's turn. This keeps the
 * whole table moving together and is the fastest fit for the generic per-round engine
 * (one screen per category, `maxRounds = 13`, game auto-finishes).
 *
 * ## Known simplification — the Joker rule
 * We don't model individual dice, so a category's score is whatever the player says it
 * is (their own scorecard already told them that): a plain number for the upper section,
 * 3-of-a-Kind/4-of-a-Kind/Chance, and a "hit or miss" toggle for the fixed-value
 * categories (Full House/Small/Large Straight/Yahtzee) — which already accommodates the
 * Joker rule letting a second Yahtzee claim a lower-section box at full value even
 * without the natural combo. What we *can't* place mid-game is a Joker-earned bonus
 * outside the categories that remain once Yahtzee is already filled — under this fixed
 * order that's only the final Chance round, so extra-Yahtzee bonuses (+100 each) are
 * entered there.
 */

export type CategoryId =
  | 'ones'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes'
  | 'threeKind'
  | 'fourKind'
  | 'fullHouse'
  | 'smallStraight'
  | 'largeStraight'
  | 'yahtzee'
  | 'chance';

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  section: 'upper' | 'lower';
  /** Face value for an upper-section category (score is a multiple of this, 0–5×). */
  face?: number;
  /** Fixed all-or-nothing score for a lower-section category (Full House, straights, Yahtzee). */
  fixedScore?: number;
  /** Highest score this category can hold — bounds the entry widget. */
  max: number;
  hint: string;
}

/** The 13 categories, in classic scorecard order. Index === round index. */
export const CATEGORIES: Category[] = [
  { id: 'ones', label: 'Ones', emoji: '⚀', section: 'upper', face: 1, max: 5, hint: 'Sum of dice showing 1' },
  { id: 'twos', label: 'Twos', emoji: '⚁', section: 'upper', face: 2, max: 10, hint: 'Sum of dice showing 2' },
  { id: 'threes', label: 'Threes', emoji: '⚂', section: 'upper', face: 3, max: 15, hint: 'Sum of dice showing 3' },
  { id: 'fours', label: 'Fours', emoji: '⚃', section: 'upper', face: 4, max: 20, hint: 'Sum of dice showing 4' },
  { id: 'fives', label: 'Fives', emoji: '⚄', section: 'upper', face: 5, max: 25, hint: 'Sum of dice showing 5' },
  { id: 'sixes', label: 'Sixes', emoji: '⚅', section: 'upper', face: 6, max: 30, hint: 'Sum of dice showing 6' },
  {
    id: 'threeKind',
    label: '3 of a Kind',
    emoji: '🎯',
    section: 'lower',
    max: 30,
    hint: 'Sum of all 5 dice (needs 3+ matching)',
  },
  {
    id: 'fourKind',
    label: '4 of a Kind',
    emoji: '🀄',
    section: 'lower',
    max: 30,
    hint: 'Sum of all 5 dice (needs 4+ matching)',
  },
  {
    id: 'fullHouse',
    label: 'Full House',
    emoji: '🏠',
    section: 'lower',
    fixedScore: 25,
    max: 25,
    hint: '3 of one + 2 of another',
  },
  {
    id: 'smallStraight',
    label: 'Small Straight',
    emoji: '🔗',
    section: 'lower',
    fixedScore: 30,
    max: 30,
    hint: '4 in a row',
  },
  {
    id: 'largeStraight',
    label: 'Large Straight',
    emoji: '➰',
    section: 'lower',
    fixedScore: 40,
    max: 40,
    hint: '5 in a row',
  },
  {
    id: 'yahtzee',
    label: 'Yahtzee',
    emoji: '🎉',
    section: 'lower',
    fixedScore: 50,
    max: 50,
    hint: 'All 5 dice match',
  },
  {
    id: 'chance',
    label: 'Chance',
    emoji: '🍀',
    section: 'lower',
    max: 30,
    hint: 'Sum of all 5 dice, any combo',
  },
];

export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS = 35;
export const YAHTZEE_BONUS = 100;

export const SIXES_INDEX = CATEGORIES.findIndex((c) => c.id === 'sixes');
export const YAHTZEE_INDEX = CATEGORIES.findIndex((c) => c.id === 'yahtzee');
export const LAST_INDEX = CATEGORIES.length - 1;

/** The category for a given (0-based) round index, or null once past the 13th round. */
export function categoryForRound(roundIndex: number): Category | null {
  return CATEGORIES[roundIndex] ?? null;
}

/** Only the final (Chance) round can carry an "extra Yahtzee" bonus claim — see file header. */
export function allowsBonusYahtzees(roundIndex: number): boolean {
  return roundIndex === LAST_INDEX;
}

export interface YahtzeeInput {
  /** This round's raw category score per player (before upper/Yahtzee bonuses). */
  scores: Record<ID, number>;
  /** Extra Yahtzees claimed via the Joker rule (+100 each) — only used on the final round. */
  bonusYahtzees?: Record<ID, number>;
}

/** A fresh, empty round input for every player. */
export function emptyInput(playerIds: ID[]): YahtzeeInput {
  return {
    scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
    bonusYahtzees: Object.fromEntries(playerIds.map((id) => [id, 0])),
  };
}

/** Clamp a raw entry into the range/step a category actually allows. */
export function clampScore(cat: Category, raw: unknown): number {
  const n = Math.trunc(Number(raw));
  const value = Number.isFinite(n) ? n : 0;
  if (cat.fixedScore != null) return value >= cat.fixedScore ? cat.fixedScore : 0;
  if (cat.face != null) {
    const clamped = Math.max(0, Math.min(cat.max, value));
    return clamped - (clamped % cat.face);
  }
  return Math.max(0, Math.min(cat.max, value));
}

/** Null when a category's raw score entry is valid, otherwise a human-readable error. */
export function validCategoryScore(cat: Category, raw: unknown): string | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return `${cat.label} needs a score of 0 or more.`;
  if (cat.fixedScore != null && n !== 0 && n !== cat.fixedScore) {
    return `${cat.label} is all-or-nothing — 0 or ${cat.fixedScore}.`;
  }
  if (n > cat.max) return `${cat.label} can't exceed ${cat.max}.`;
  if (cat.face != null && n % cat.face !== 0) {
    return `${cat.label} must be a multiple of ${cat.face}.`;
  }
  return null;
}

/** Read + coerce the game config (Yahtzee has no tunable rules today, but this keeps the shape). */
export function readConfig(_config: Record<string, unknown>): Record<string, never> {
  return {};
}

/** Null when the whole round is valid, otherwise the first human-readable error found. */
export function validateYahtzee(input: YahtzeeInput, ctx: RoundContext): string | null {
  const cat = categoryForRound(ctx.roundIndex);
  if (!cat) return null;
  for (const p of ctx.players) {
    const err = validCategoryScore(cat, input.scores[p.id]);
    if (err) return `${p.name}: ${err}`;
  }
  if (allowsBonusYahtzees(ctx.roundIndex)) {
    for (const p of ctx.players) {
      const b = Number(input.bonusYahtzees?.[p.id] ?? 0);
      if (!Number.isFinite(b) || b < 0) return `${p.name}: extra Yahtzees can't be negative.`;
    }
  }
  return null;
}

/**
 * Per-player point deltas for this round's category, folding in the upper-section bonus
 * (awarded the moment Sixes is scored, when a player's six upper boxes total 63+) and any
 * extra-Yahtzee Joker bonus claimed on the final Chance round.
 */
export function scoreRound(input: YahtzeeInput, ctx: RoundContext): Record<ID, number> {
  const cat = categoryForRound(ctx.roundIndex);
  const out: Record<ID, number> = {};
  for (const p of ctx.players) {
    if (!cat) {
      out[p.id] = 0;
      continue;
    }
    let pts = clampScore(cat, input.scores[p.id]);
    if (ctx.roundIndex === SIXES_INDEX) {
      const upperTotal = (Number(ctx.totals[p.id]) || 0) + pts;
      if (upperTotal >= UPPER_BONUS_THRESHOLD) pts += UPPER_BONUS;
    }
    if (allowsBonusYahtzees(ctx.roundIndex)) {
      const extra = Math.max(0, Math.trunc(Number(input.bonusYahtzees?.[p.id]) || 0));
      pts += extra * YAHTZEE_BONUS;
    }
    out[p.id] = pts;
  }
  return out;
}

/** Fixed 13-round game — one category per round. */
export function maxRounds(): number {
  return CATEGORIES.length;
}

/** Whether a player's upper section (Ones…Sixes) has already earned the 63+ bonus. */
export function upperBonusEarned(upperSubtotal: number): boolean {
  return upperSubtotal >= UPPER_BONUS_THRESHOLD;
}

/** One-line summary of a recorded round for the history table. */
export function describeRound(round: Round, players: { id: ID; name: string }[]): string {
  const cat = categoryForRound(round.index);
  const input = round.input as YahtzeeInput | undefined;
  if (!cat || !input) return 'no change';
  const parts = players
    .map((p) => {
      const score = input.scores?.[p.id];
      if (score == null) return '';
      const extra = Math.max(0, Math.trunc(Number(input.bonusYahtzees?.[p.id]) || 0));
      const bonusTag = extra > 0 ? ` +${extra * YAHTZEE_BONUS}🎉` : '';
      return `${p.name} ${score}${bonusTag}`;
    })
    .filter(Boolean);
  return `${cat.emoji} ${cat.label}: ${parts.join(' · ')}`;
}

/** Per-cell emphasis for the round-by-round scorecard: a full hit or a scratched zero. */
export function roundCellTone(
  round: Round,
  playerId: ID,
): { tone: 'good' | 'bad' | 'warn'; label?: string } | null {
  const cat = categoryForRound(round.index);
  const input = round.input as YahtzeeInput | undefined;
  if (!cat || !input) return null;
  const score = Number(input.scores?.[playerId]);
  if (!Number.isFinite(score)) return null;
  if (score <= 0) return { tone: 'bad', label: 'Scratched' };
  if (score >= cat.max) return { tone: 'good', label: 'Top score!' };
  return null;
}
