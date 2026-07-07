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
  return {
    ...src,
    id: CUSTOM_ID_PREFIX + uid(),
    name: `${src.name} copy`.trim(),
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
  if (!def.name.trim()) return 'Give your game a name.';
  if (!Number.isFinite(def.minPlayers) || def.minPlayers < 1) return 'Minimum players must be at least 1.';
  if (def.maxPlayers < def.minPlayers) return "Max players can't be less than min players.";
  if (def.inputShape === 'columns') {
    if (def.columns.length < 1) return 'Add at least one scoring column.';
    if (def.columns.some((c) => !c.label.trim())) return 'Every column needs a label.';
  }
  return null;
}
