import type { Component } from 'svelte';
import type { GameStatsHook } from './stats/types';
import type { BackupSettings } from './stores/settings';

export type ID = string;

/**
 * A gamer — the unified "Member" entity from ARCHITECTURE.md (one record for a
 * person: their seat in a game *and* their identity). Named `Player` because that's
 * what it is inside a game, and the name is woven through the GameModule contract.
 */
export interface Player {
  id: ID;
  /** Display handle. Auto-generated and whimsical until the gamer claims it. */
  name: string;
  color: string;
  createdAt: number;
  /** True once the gamer renames the auto-generated handle to claim this identity. */
  claimed?: boolean;
  /** Soft-delete: hidden from the active roster + selection, kept in history & stats. */
  archived?: boolean;
  archivedAt?: number;
  /** A temporary, session-only member (networked guest join). Reserved; no UI yet. */
  ephemeral?: boolean;
  /** This member's portable preferences, applied to a device when they're its lead. */
  prefs?: Partial<BackupSettings>;
  /** Last local mutation time — drives per-entity merge (Phase 2). */
  updatedAt?: number;
  /**
   * Sync tombstone: when set, this record was permanently deleted and is retained
   * only so the deletion propagates on merge. Distinct from {@link archived} (a
   * recoverable, still-present member). Tombstoned records are hidden everywhere.
   */
  deleted?: number;
}

/**
 * A reusable, per-game-type setup: the lineup and rules you like for a specific game,
 * saved so you can start it again in one tap ("The Friday crew, Avalon with Morgana on").
 *
 * Deliberately *not* a locked configuration — a preset only pre-fills the New game form.
 * You can apply it and then freely retune players or config before starting; the preset
 * only changes when you explicitly Update it. Keyed by `type` (a built-in slug like
 * `avalon` or a custom def id `def_…`). Stored as a portable setting so a group's presets
 * travel with a backup/restore, exactly like {@link Player} ids and catalog favorites do.
 */
export interface GamePreset {
  id: ID;
  /** Game type this preset belongs to — a built-in slug or a custom def id. */
  type: string;
  /** User-given label, e.g. "Friday crew + Morgana". */
  name: string;
  /** The saved lineup, in seating order. May be empty for a rules-only preset. */
  playerIds: ID[];
  /** The saved game configuration (game-specific keys). */
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type GameStatus = 'active' | 'finished' | 'abandoned';

export interface Game {
  id: ID;
  type: string; // game module id
  name?: string; // optional custom label
  config: Record<string, unknown>;
  playerIds: ID[];
  status: GameStatus;
  createdAt: number;
  finishedAt?: number;
  winnerIds?: ID[];
  /**
   * The winning total captured at finish time — a glanceable summary value for the
   * History log (the leader's final score). Stored so History needn't re-read every
   * game's rounds to show it. Cleared when a game is reopened or abandoned. Absent on
   * games finished before this field existed (History degrades to no score for those).
   */
  winnerScore?: number;
  /**
   * The runner-up's final total captured at finish time (best score among the
   * non-winners). Paired with {@link winnerScore} it gives History a glanceable
   * margin of victory ("won by N") without re-reading every game's rounds.
   * Cleared when a game is reopened or abandoned. Absent on games finished before
   * this field existed and on solo/all-tie games (no runner-up to compare).
   */
  runnerUpScore?: number;
  roundCount: number;
  /**
   * User archive: hidden from the History library's main list and from Home, kept
   * in Stats and fully recoverable. Distinct from {@link deleted} (a hard-delete
   * sync tombstone) — an archived game is still present. Mirrors {@link Player.archived}.
   */
  archived?: boolean;
  archivedAt?: number;
  /** Last local mutation time — drives per-entity merge (Phase 2). */
  updatedAt?: number;
  /** Sync tombstone: deletion time, retained so the delete propagates on merge. */
  deleted?: number;
}

export interface Round {
  id: ID;
  gameId: ID;
  index: number; // 0-based
  input: unknown; // game-specific payload
  deltas: Record<ID, number>; // per-player points for this round
  createdAt: number;
  /** Last local mutation time — drives per-entity merge (Phase 2). */
  updatedAt?: number;
  /** Sync tombstone: deletion time, retained so the delete propagates on merge. */
  deleted?: number;
}

/** Context handed to a game module when editing/scoring a round. */
export interface RoundContext {
  game: Game;
  players: Player[];
  config: Record<string, unknown>;
  roundIndex: number; // 0-based index of the round being entered
  totals: Record<ID, number>; // cumulative totals BEFORE this round
  rounds: Round[]; // rounds already recorded
}

export type ConfigField =
  | {
      key: string;
      label: string;
      type: 'number';
      default: number;
      min?: number;
      max?: number;
      step?: number;
      help?: string;
    }
  | { key: string; label: string; type: 'boolean'; default: boolean; help?: string }
  | {
      key: string;
      label: string;
      type: 'select';
      default: string;
      options: { value: string; label: string }[];
      help?: string;
    };

/** Props every game's RoundEditor component receives. */
export interface RoundEditorProps {
  input: any; // bindable draft input
  ctx: RoundContext;
}

/**
 * A self-contained game. Adding a new game = implementing this interface and
 * registering it. The generic shell handles players, storage, history and stats.
 */
export interface GameModule {
  id: string; // url slug, e.g. 'skullking'
  name: string;
  tagline: string;
  emoji: string;
  /** Optional search aliases/keywords for catalog discovery (matched alongside name + tagline). */
  keywords?: string[];
  minPlayers: number;
  maxPlayers: number;
  /** true when the lowest total wins (e.g. Hearts). */
  lowerIsBetter?: boolean;
  /** Resolve win direction from config (overrides lowerIsBetter when provided). */
  resolveLowerIsBetter?(config: Record<string, unknown>): boolean;
  /** Whether this game uses fixed teams/partnerships. */
  teams?: boolean;
  configFields?: ConfigField[];

  /** Build a fresh, editable input object for the next round. */
  createRoundInput(ctx: RoundContext): unknown;
  /** Return null when valid, otherwise a human-readable error. */
  validateRound(input: any, ctx: RoundContext): string | null;
  /** Compute per-player point deltas for the round. */
  scoreRound(input: any, ctx: RoundContext): Record<ID, number>;

  /** Fixed number of rounds (e.g. Skull King = 10); null/undefined = open-ended. */
  maxRounds?(config: Record<string, unknown>, playerCount: number): number | null;
  /** Score-threshold end condition (e.g. Hearts reaches 100). */
  isFinished?(
    totals: Record<ID, number>,
    info: { config: Record<string, unknown>; roundCount: number; playerCount: number },
  ): boolean;
  /** Final winner(s) given totals. Defaults to highest (or lowest) total. */
  pickWinners?(totals: Record<ID, number>, config: Record<string, unknown>): ID[];

  /** Svelte component used to edit a single round (props: RoundEditorProps). */
  RoundEditor: Component<any>;
  /** Reference text shown in the in-game help popover. */
  help?: string;
  /** Short summary of a recorded round for the history table. */
  describeRound?(round: Round, players: Player[]): string;
  /**
   * Optional game-specific stats over this game's finished games. Pure, no I/O —
   * mirrors {@link describeRound}: a new game contributes stats the same way it
   * contributes scoring. The stats engine injects this via the registry so it
   * never imports Svelte components.
   */
  stats?: GameStatsHook;
}

export function defaultConfig(fields: ConfigField[] | undefined): Record<string, unknown> {
  const cfg: Record<string, unknown> = {};
  for (const f of fields ?? []) cfg[f.key] = f.default;
  return cfg;
}

export function resolveLower(
  module: GameModule,
  config: Record<string, unknown>,
): boolean {
  return module.resolveLowerIsBetter
    ? module.resolveLowerIsBetter(config)
    : !!module.lowerIsBetter;
}

/** Default winner logic when a module doesn't override pickWinners. */
export function defaultWinners(
  module: GameModule,
  totals: Record<ID, number>,
  config: Record<string, unknown> = {},
): ID[] {
  const ids = Object.keys(totals);
  if (ids.length === 0) return [];
  const lower = resolveLower(module, config);
  const best = lower
    ? Math.min(...ids.map((id) => totals[id]))
    : Math.max(...ids.map((id) => totals[id]));
  return ids.filter((id) => totals[id] === best);
}
