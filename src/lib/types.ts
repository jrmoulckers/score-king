import type { Component } from 'svelte';
import type { GameStatsHook } from './stats/types';

export type ID = string;

export interface Player {
  id: ID;
  name: string;
  color: string;
  createdAt: number;
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
  roundCount: number;
}

export interface Round {
  id: ID;
  gameId: ID;
  index: number; // 0-based
  input: unknown; // game-specific payload
  deltas: Record<ID, number>; // per-player points for this round
  createdAt: number;
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
