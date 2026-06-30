import type { ID, Game, Player, Round } from '../types';

export type { ID };

/**
 * The minimal slice of the World the stats engine reads. Deliberately NOT the
 * full {@link import('../storage/sync').Snapshot} so the engine never pulls in
 * the backup/transport layer (xlsx, MSAL) — it stays a pure, testable function
 * of members + games + rounds.
 */
export interface StatsData {
  players: Player[];
  games: Game[];
  rounds: Round[];
}

/** Half-open-ish time window in ms epoch. Omit a bound to leave it open. */
export interface DateRange {
  from?: number;
  to?: number;
}

export interface StatsQuery {
  /** Any window; surfaces pick presets (year / YTD / rolling-12mo / season / tonight). */
  range?: DateRange;
  /** Personal lens — already a canonical member id ("your" stats / Wrapped). */
  playerId?: ID;
  /** Restrict to a single game module id. */
  gameType?: string;
  /** Include abandoned games in counts/records. Defaults to false. */
  includeAbandoned?: boolean;
}

/** A single presentational stat line, ready to render with `tabular-nums`. */
export interface Metric {
  key: string;
  label: string;
  value: string;
  sub?: string;
  emoji?: string;
}

export interface HeadToHead {
  opponentId: ID;
  /** Games both members co-finished. */
  games: number;
  /** You finished strictly ahead. */
  wins: number;
  /** Opponent finished strictly ahead. */
  losses: number;
  /** Same finishing rank. */
  ties: number;
}

export interface ByGameType {
  played: number;
  wins: number;
  winRate: number;
}

/** Everything the engine derives for one member over the queried window. */
export interface MemberStats {
  playerId: ID;
  played: number;
  finished: number;
  wins: number;
  /** Top-3 finishes (or top-half in small games). */
  podiums: number;
  winRate: number; // 0..1
  /** Mean finishing position (1 = first); undefined with no finished games. */
  avgFinish?: number;
  bestFinish?: number;
  /** Consecutive wins ending at the most recent finished game. */
  currentStreak: number;
  longestStreak: number;
  /** Total points (Σ deltas) and rounds the member appears in. */
  points: number;
  rounds: number;
  byGameType: Record<string, ByGameType>;
  headToHead: Record<ID, HeadToHead>;
  // Drama
  comebackWins: number;
  wireToWireWins: number;
  bestWinMargin?: number;
  closestWinMargin?: number;
  // Cadence
  gameNights: number; // distinct local calendar days with a finished game
  firstPlayedAt?: number;
  lastPlayedAt?: number;
  lastWinAt?: number;
}

export interface LeaderRow {
  playerId: ID;
  played: number;
  wins: number;
  winRate: number;
  avgFinish?: number;
  currentStreak: number;
}

export interface GameRecord {
  key: string;
  label: string;
  value: string;
  emoji?: string;
  holderId?: ID;
  gameId?: ID;
  at?: number;
}

export interface GameSpecificStats {
  perPlayer?: Record<ID, Metric[]>;
  global?: Metric[];
}

export interface StatsResult {
  range?: DateRange;
  /** Canonical members referenced by the queried games. */
  players: Player[];
  leaderboard: LeaderRow[];
  perPlayer: Record<ID, MemberStats>;
  records: GameRecord[];
  global: Metric[];
  /** Keyed by game module id, fed by each module's `stats` hook. */
  gameSpecific: Record<string, GameSpecificStats>;
  totals: {
    games: number;
    finishedGames: number;
    abandonedGames: number;
    rounds: number;
    gameNights: number;
  };
}

/** Input handed to a game module's `stats` hook (already range/type-filtered & canonicalized). */
export interface GameStatsInput {
  games: Game[];
  rounds: Round[];
  players: Player[];
  range?: DateRange;
  /** Map any (possibly merged/legacy) member id to its surviving canonical id. */
  canonical: (id: ID) => ID;
}

export type GameStatsHook = (input: GameStatsInput) => GameSpecificStats;
