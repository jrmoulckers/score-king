import type { ID } from '../../types';

/**
 * Pure, Svelte-free Spikeball (Roundnet) logic. Everything the module and its editor
 * need to reason about a game/match lives here so it can be unit-tested without pulling
 * in a component. A Score King "round" is one *game* of Spikeball; the module tallies
 * games won, so a player's cumulative total is simply how many games their team has won.
 */

export type Format = '1v1' | '2v2';

export interface SpikeballConfig {
  format: Format;
  /** Points that win a game (before win-by-2). */
  target: number;
  /** Keep playing past the target until a team leads by two. */
  winByTwo: boolean;
  /** Games in the match: 1 (single), 3 (best of 3), 5 (best of 5). */
  bestOf: number;
}

/** One recorded game: the two teams (by player id) and their final rally points. */
export interface SpikeballInput {
  /** teams[0] scored `a` points, teams[1] scored `b`. */
  teams: [ID[], ID[]];
  a: number;
  b: number;
  /**
   * Ordered log of which team (0 | 1) won each rally, oldest first. Optional and purely
   * additive: `a`/`b` remain the scoring source of truth (so validation, scoring, summary
   * and stats are unchanged), while this log powers live extras — a satisfying single
   * "undo last rally" and the momentum/run read. New games seed an empty log; rounds
   * recorded before this existed simply have no log and fall back to the ± steppers.
   */
  rallies?: (0 | 1)[];
}

export const TARGET_OPTIONS = [21, 15, 11] as const;
export const BEST_OF_OPTIONS = [1, 3, 5] as const;

/** Read the loosely-typed config record (select values arrive as strings) into a typed shape. */
export function readConfig(config: Record<string, unknown>): SpikeballConfig {
  const format: Format = config.format === '1v1' ? '1v1' : '2v2';
  const target = normalizeTarget(Number(config.target));
  const winByTwo = config.winByTwo !== false; // default on
  const bestOf = normalizeBestOf(Number(config.bestOf));
  return { format, target, winByTwo, bestOf };
}

function normalizeTarget(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 21;
}

function normalizeBestOf(n: number): number {
  return n === 1 || n === 3 || n === 5 ? n : 3;
}

/** Players on each side for a format. */
export function teamSize(format: Format): number {
  return format === '1v1' ? 1 : 2;
}

/** Number of players a format expects on the roster (both teams). */
export function requiredPlayers(format: Format): number {
  return teamSize(format) * 2;
}

/** Split the ordered roster into two equal teams: first half vs. second half. */
export function splitTeams(playerIds: ID[], format: Format): [ID[], ID[]] {
  const n = teamSize(format);
  return [playerIds.slice(0, n), playerIds.slice(n, n * 2)];
}

/** Games one team must win to take a best-of-N match. */
export function gamesToWin(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

/** Rally-log → the two teams' point totals. The log is the ordered list of rally winners. */
export function scoreFromRallies(rallies: (0 | 1)[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const t of rallies) t === 0 ? (a += 1) : (b += 1);
  return { a, b };
}

/** Append a rally winner, returning a new log (never mutates the input). */
export function pushRally(rallies: (0 | 1)[], team: 0 | 1): (0 | 1)[] {
  return [...rallies, team];
}

/** Drop the most recent rally, returning a new log. No-op on an empty log. */
export function popRally(rallies: (0 | 1)[]): (0 | 1)[] {
  return rallies.slice(0, -1);
}

/**
 * The current unbroken run — how many rallies in a row the same team just won. Returns the
 * team on the streak and its length (0 with a null team when there are no rallies yet).
 */
export function currentRun(rallies: (0 | 1)[]): { team: 0 | 1 | null; length: number } {
  if (rallies.length === 0) return { team: null, length: 0 };
  const team = rallies[rallies.length - 1]!;
  let length = 0;
  for (let i = rallies.length - 1; i >= 0 && rallies[i] === team; i--) length += 1;
  return { team, length };
}

/**
 * Deuce — the win-by-2 tension where the score is *tied at or past* one short of the target
 * (20–20, 21–21, …) and the game isn't decided, so no single rally can end it. Distinct from
 * game point (an advantage lead one rally from winning). Always false without win-by-2.
 */
export function isDeuce(a: number, b: number, target: number, winByTwo: boolean): boolean {
  if (!winByTwo) return false;
  if (gameWinner(a, b, target, winByTwo) !== null) return false;
  return a === b && a >= target - 1;
}

/**
 * Would banking this finished game clinch the whole match? True when `winner` is set and that
 * team, credited this game, reaches the majority needed for the best-of-N.
 */
export function clinchesMatch(
  winner: 0 | 1 | null,
  gamesA: number,
  gamesB: number,
  bestOf: number,
): boolean {
  if (winner === null) return false;
  const held = winner === 0 ? gamesA : gamesB;
  return held + 1 >= gamesToWin(bestOf);
}

/**
 * Winner of a single game from the two scores, or null if the game isn't over yet.
 * A game ends when the higher score reaches `target` and (with win-by-2) leads by two.
 */
export function gameWinner(
  a: number,
  b: number,
  target: number,
  winByTwo: boolean,
): 0 | 1 | null {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < target) return null;
  if (a === b) return null;
  if (winByTwo && hi - lo < 2) return null;
  return a > b ? 0 : 1;
}

/**
 * Which team is at game point — one rally from winning — or null. A side is at game
 * point when scoring the next rally would end the game and it hasn't ended already.
 */
export function gamePointTeam(
  a: number,
  b: number,
  target: number,
  winByTwo: boolean,
): 0 | 1 | null {
  if (gameWinner(a, b, target, winByTwo) !== null) return null;
  if (gameWinner(a + 1, b, target, winByTwo) === 0) return 0;
  if (gameWinner(a, b + 1, target, winByTwo) === 1) return 1;
  return null;
}

/** Would winning the current game (for the side at game point) also clinch the match? */
export function isMatchPoint(
  gamePoint: 0 | 1 | null,
  gamesA: number,
  gamesB: number,
  bestOf: number,
): boolean {
  if (gamePoint === null) return false;
  const held = gamePoint === 0 ? gamesA : gamesB;
  return held + 1 >= gamesToWin(bestOf);
}

/** True once either side has won enough games to take the match. */
export function matchOver(gamesA: number, gamesB: number, bestOf: number): boolean {
  const need = gamesToWin(bestOf);
  return gamesA >= need || gamesB >= need;
}

/**
 * Per-player deltas for a completed game: +1 to each player on the winning team, 0 to
 * everyone else. Accumulated across rounds by the shell, a player's total is games won.
 */
export function scoreDeltas(
  input: SpikeballInput,
  playerIds: ID[],
  cfg: SpikeballConfig,
): Record<ID, number> {
  const winner = gameWinner(input.a, input.b, cfg.target, cfg.winByTwo);
  const won = new Set<ID>(winner === null ? [] : (input.teams[winner] ?? []));
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = won.has(id) ? 1 : 0;
  return out;
}

/** Validate a game entry. Returns null when it's a well-formed, finished game, else why not. */
export function validate(
  input: SpikeballInput,
  playerIds: ID[],
  cfg: SpikeballConfig,
): string | null {
  const need = requiredPlayers(cfg.format);
  if (playerIds.length !== need) {
    return cfg.format === '2v2'
      ? `2v2 needs exactly 4 players — you have ${playerIds.length}. Start a new game with four, or switch to 1v1.`
      : `1v1 needs exactly 2 players — you have ${playerIds.length}. Start a new game with two, or switch to 2v2.`;
  }
  const [ta, tb] = input.teams;
  if (!ta?.length || !tb?.length) return 'Two teams are needed to score a game.';
  const a = Number(input.a) || 0;
  const b = Number(input.b) || 0;
  if (a < 0 || b < 0) return 'Scores can’t be negative.';
  if (gameWinner(a, b, cfg.target, cfg.winByTwo) === null) {
    return `That game isn’t over yet — first to ${cfg.target}${cfg.winByTwo ? ', win by 2' : ''}.`;
  }
  return null;
}

/** One-line summary of a recorded game, e.g. "🏐 Ada & Bo def. Cy & Dot 21–18". */
export function summarize(input: SpikeballInput, nameOf: (id: ID) => string): string {
  const label = (ids: ID[]) => (ids.length ? ids.map(nameOf).join(' & ') : '—');
  const a = Number(input.a) || 0;
  const b = Number(input.b) || 0;
  const na = label(input.teams[0] ?? []);
  const nb = label(input.teams[1] ?? []);
  if (a === b) return `${na} vs ${nb} ${a}–${b}`;
  const winnerFirst = a > b;
  const w = winnerFirst ? na : nb;
  const l = winnerFirst ? nb : na;
  return `🏐 ${w} def. ${l} ${Math.max(a, b)}–${Math.min(a, b)}`;
}
