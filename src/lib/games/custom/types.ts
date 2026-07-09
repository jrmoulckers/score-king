import type { ID } from '../../types';
import { uid } from '../../util';

/**
 * Custom, user-authored games.
 * ----------------------------
 * A {@link CustomGameDef} is a small *declarative* description of a game that the
 * {@link ./factory factory} compiles into a real runtime `GameModule` — no code, no
 * `eval`, just data → deterministic scoring. Defs live in their own IndexedDB store and
 * are part of the World (backed up, merged per-entity, tombstoned), so a custom type is
 * as first-class as a built-in: players, history, stats, `/›id‹` routing and backup all
 * work for free.
 */

/** Every custom game id carries this prefix so it can never collide with a built-in
 *  module id or a reserved route segment. */
export const CUSTOM_ID_PREFIX = 'def_';

/** Fallback emoji when the author hasn't picked one. */
export const DEFAULT_EMOJI = '🎲';

/** The single implicit column used by a `counter`-shaped game. */
export const COUNTER_COLUMN_KEY = 'v';

/**
 * Field length caps. Kept small so a game name/tagline never overflows a catalog tile or the
 * live preview, and a column label stays readable on the round-entry stepper. Enforced both by
 * the inputs' `maxlength` (soft, in the builder) and by {@link validateDef} (hard, on save).
 */
export const MAX_NAME_LEN = 24;
export const MAX_TAGLINE_LEN = 48;
export const MAX_COLUMN_LABEL_LEN = 16;
/** How-to-play rules text cap — keeps the in-game help popover glanceable, not a wall of text. */
export const MAX_HELP_LEN = 500;

/** A curated palette of game-night emojis offered as one-tap picks in the builder. */
export const EMOJI_CHOICES = [
  '🎲', '🃏', '👑', '🏆', '🎯', '🀄', '♠️', '♥️', '♦️', '♣️',
  '🎰', '🎳', '🏀', '⚽', '🏈', '🥏', '🏓', '🎱', '🧩', '🕹️',
  '🍻', '🎉', '🔥', '⭐', '💎', '🚀', '🐉', '🦄', '🐔', '🎩',
];

/**
 * The first *grapheme* of an emoji field — collapses a whole ZWJ sequence (e.g. 🏴‍☠️) to one
 * visible glyph and drops trailing text, so the catalog tile always shows a single clean emoji
 * instead of whatever a user pasted or typed. Returns '' when the input has no usable glyph.
 */
export function firstEmoji(input: string | undefined): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';
  // Prefer grapheme segmentation where available (keeps ZWJ/flag/keycap sequences intact).
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const seg = new Seg(undefined, { granularity: 'grapheme' });
    for (const s of seg.segment(trimmed)) return s.segment;
    return '';
  }
  return Array.from(trimmed)[0] ?? '';
}

export type CustomInputShape = 'counter' | 'columns';

export interface CustomColumn {
  /** Stable id, generated — never derived from the label, so relabeling is safe. */
  key: string;
  label: string;
  /** When true this column *subtracts* from the round score (a penalty column). */
  negative?: boolean;
}

export interface CustomGameDef {
  /** Stable id, always prefixed with {@link CUSTOM_ID_PREFIX}. */
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  /** Win direction, baked into the definition (part of the game's identity). */
  lowerIsBetter: boolean;
  inputShape: CustomInputShape;
  /** Columns for `columns` shape; ignored for `counter` (which uses one implicit column). */
  columns: CustomColumn[];
  /** Stepper increment for round entry (default 1). */
  step: number;
  /** End the game when any total reaches this (0 = no target). */
  target: number;
  /** Fixed number of rounds (0 = open-ended). */
  roundLimit: number;
  /** Optional rules text for the in-game help popover. */
  help?: string;
  createdAt: number;
  /** Last local mutation time — drives per-entity merge (Phase 2). */
  updatedAt?: number;
  /**
   * Retired but retained: hidden from the catalog and new-game list, yet still resolvable
   * so games/history/stats of this type keep their name, emoji and correct scoring. Mirrors
   * {@link Player.archived}. Set when the author "deletes" a type that has been played.
   */
  archived?: boolean;
  archivedAt?: number;
  /** Sync tombstone: hard-deletion time, retained so the delete propagates on merge. */
  deleted?: number;
}

/** Per-round instance payload stored on each `Round` for a custom game. */
export interface CustomInput {
  /** player id → (column key → value). */
  values: Record<ID, Record<string, number>>;
}

/** True when a game `type` refers to a custom, user-authored game. */
export function isCustomType(type: string): boolean {
  return typeof type === 'string' && type.startsWith(CUSTOM_ID_PREFIX);
}

/** The columns a def actually scores/renders — the single implicit one for a counter. */
export function effectiveColumns(def: CustomGameDef): CustomColumn[] {
  if (def.inputShape === 'columns') return def.columns;
  return [{ key: COUNTER_COLUMN_KEY, label: '', negative: false }];
}

/** A fresh, unique column with an optional label. */
export function newColumn(label = ''): CustomColumn {
  return { key: 'c' + uid().replace(/-/g, '').slice(0, 8), label, negative: false };
}

/**
 * Move the column at `from` by `delta` (−1 up, +1 down), returning a new array. Out-of-range
 * moves are no-ops so callers can wire up/down buttons without bounds-checking themselves.
 * Column *order* is author-facing (it's the left-to-right order of the round-entry steppers),
 * so reordering is a real edit — pure and testable here.
 */
export function moveColumn(columns: CustomColumn[], from: number, delta: number): CustomColumn[] {
  const to = from + delta;
  if (from < 0 || from >= columns.length || to < 0 || to >= columns.length) return columns;
  const next = columns.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** A blank definition ready for the builder. */
export function blankDef(): CustomGameDef {
  const now = Date.now();
  return {
    id: CUSTOM_ID_PREFIX + uid(),
    name: '',
    emoji: DEFAULT_EMOJI,
    tagline: '',
    minPlayers: 2,
    maxPlayers: 8,
    lowerIsBetter: false,
    inputShape: 'counter',
    columns: [newColumn('Points')],
    step: 1,
    target: 0,
    roundLimit: 0,
    help: '',
    createdAt: now,
    updatedAt: now,
  };
}

/** A deep copy of `src` as a brand-new (unsaved) definition, e.g. for "Duplicate". */
export function duplicateDef(src: CustomGameDef): CustomGameDef {
  const now = Date.now();
  // The " copy" suffix can push a max-length name over MAX_NAME_LEN, which would make the
  // clone fail validation the moment it's opened in the builder. Truncate so a duplicate is
  // always immediately re-savable.
  const copyName = `${src.name} copy`.trim().slice(0, MAX_NAME_LEN).trim();
  return {
    ...src,
    id: CUSTOM_ID_PREFIX + uid(),
    name: copyName,
    columns: src.columns.map((c) => ({ ...c })),
    createdAt: now,
    updatedAt: now,
    archived: false,
    archivedAt: undefined,
    deleted: undefined,
  };
}

/** Validate a def for saving. Returns a human-readable error, or null when valid. */
export function validateDef(def: CustomGameDef): string | null {
  const name = def.name.trim();
  if (!name) return 'Give your game a name.';
  if (name.length > MAX_NAME_LEN) return `Keep the name under ${MAX_NAME_LEN} characters.`;
  if (def.tagline.trim().length > MAX_TAGLINE_LEN) {
    return `Keep the tagline under ${MAX_TAGLINE_LEN} characters.`;
  }
  if ((def.help ?? '').trim().length > MAX_HELP_LEN) {
    return `Keep the how-to-play under ${MAX_HELP_LEN} characters.`;
  }
  if (!Number.isFinite(def.minPlayers) || def.minPlayers < 1) return 'Minimum players must be at least 1.';
  if (def.maxPlayers < def.minPlayers) return "Max players can't be less than min players.";
  if (def.inputShape === 'columns') {
    if (def.columns.length < 1) return 'Add at least one scoring column.';
    if (def.columns.some((c) => !c.label.trim())) return 'Every column needs a label.';
    if (def.columns.some((c) => c.label.trim().length > MAX_COLUMN_LABEL_LEN)) {
      return `Keep column names under ${MAX_COLUMN_LABEL_LEN} characters.`;
    }
    const seen = new Set<string>();
    for (const c of def.columns) {
      const key = c.label.trim().toLowerCase();
      if (seen.has(key)) return 'Give each column a different name.';
      seen.add(key);
    }
    if (def.columns.every((c) => c.negative)) {
      return 'At least one column must add to the score, or no one can win.';
    }
  }
  return null;
}

/**
 * Non-blocking guidance shown live in the builder — things that are *valid* but probably not what
 * the author intended, surfaced as gentle nudges rather than hard errors. Pure and testable.
 */
export function defWarnings(def: CustomGameDef): string[] {
  const out: string[] = [];
  if (def.target && def.target > 0 && def.roundLimit && def.roundLimit > 0) {
    out.push('Whichever comes first ends the game: the target or the round limit.');
  }
  if (def.inputShape === 'columns' && def.columns.length === 1) {
    out.push('One column works, but “One number” is simpler for a single value.');
  }
  return out;
}
