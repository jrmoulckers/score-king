import type { ID, Round, RoundContext } from '../../types';

/**
 * Codenames is a team word game, not a point counter — so this module is a
 * head-to-head **tracker**. Each recorded round is one game between two fixed
 * teams (🔴 Red vs 🔵 Blue); a Score King "game" is a match/series of those.
 *
 * Modelling a scoreless team game inside the per-player {@link import('../../types').GameModule}
 * contract: players are grouped into two teams, the winning team's players each
 * score **+1** for the game, so a player's running total is "games my team won".
 * `pickWinners` then returns the players on the team that won the most games.
 *
 * Everything here is pure and Svelte-free so `codenames.test.ts` can exercise the
 * real scoring/validation without pulling in the round editor.
 */

export type Team = 'red' | 'blue';

/** How a game ended — the two iconic Codenames outcomes. */
export type Ending = 'agents' | 'assassin';

/** Optional record of who ran each spymaster desk this game (flavour + stats only). */
export interface Spymasters {
  red: ID | null;
  blue: ID | null;
}

export interface CodenamesInput {
  /**
   * Each player's team for this game. Persisted per-round and carried forward by
   * {@link createInput}, so fixed teams stay stable across a match while still
   * being editable if the table reshuffles.
   */
  teams: Record<ID, Team>;
  /** The team that won this game. `null` until the scorer taps a winner. */
  winner: Team | null;
  /** `agents` = winners found all their agents; `assassin` = losers hit the assassin. */
  ending: Ending;
  /**
   * Who gave the one-word clues for each side, if the table logged it. Purely
   * optional — never required, never affects scoring or validation — and only
   * powers the spymaster win-rate stat. Absent on rounds saved before it existed.
   */
  spymasters?: Spymasters;
}

export const TEAMS: readonly Team[] = ['red', 'blue'];

export interface TeamMeta {
  label: string;
  emoji: string;
}

export const TEAM_META: Record<Team, TeamMeta> = {
  red: { label: 'Red', emoji: '🔴' },
  blue: { label: 'Blue', emoji: '🔵' },
};

export function otherTeam(team: Team): Team {
  return team === 'red' ? 'blue' : 'red';
}

function isTeam(value: unknown): value is Team {
  return value === 'red' || value === 'blue';
}

/** Balanced starting split: alternate players Red/Blue by seat order. */
export function defaultTeams(playerIds: ID[]): Record<ID, Team> {
  const teams: Record<ID, Team> = {};
  playerIds.forEach((id, i) => {
    teams[id] = i % 2 === 0 ? 'red' : 'blue';
  });
  return teams;
}

/**
 * Team map for the current roster: keep each player's previous team when known,
 * fall back to the balanced default for anyone new, and drop players no longer
 * in the game. Keeps fixed teams stable game-to-game.
 */
export function carryTeams(
  prev: Record<ID, Team> | undefined,
  playerIds: ID[],
): Record<ID, Team> {
  const base = defaultTeams(playerIds);
  const teams: Record<ID, Team> = {};
  for (const id of playerIds) {
    const carried = prev?.[id];
    teams[id] = isTeam(carried) ? carried : base[id];
  }
  return teams;
}

export function teamCounts(
  teams: Record<ID, Team>,
  playerIds: ID[],
): Record<Team, number> {
  const counts: Record<Team, number> = { red: 0, blue: 0 };
  for (const id of playerIds) {
    const t = teams[id];
    if (isTeam(t)) counts[t] += 1;
  }
  return counts;
}

/** Latest recorded round's input, if any (defensively ordered by index). */
function lastInput(rounds: Round[]): CodenamesInput | undefined {
  if (rounds.length === 0) return undefined;
  let latest = rounds[0];
  for (const r of rounds) if (r.index >= latest.index) latest = r;
  return latest.input as CodenamesInput | undefined;
}

/** Fresh draft for the next game: teams carried forward, winner unset. */
export function createInput(ctx: RoundContext): CodenamesInput {
  const playerIds = ctx.players.map((p) => p.id);
  return {
    teams: carryTeams(lastInput(ctx.rounds)?.teams, playerIds),
    winner: null,
    ending: 'agents',
  };
}

export function validate(input: CodenamesInput, playerIds: ID[]): string | null {
  const counts = teamCounts(input.teams, playerIds);
  if (counts.red === 0 || counts.blue === 0) {
    return 'Put at least one player on each team — 🔴 Red and 🔵 Blue.';
  }
  if (!isTeam(input.winner)) {
    return 'Tap the team that won this game.';
  }
  return null;
}

/** Winning team's players each score +1 for the game; everyone else 0. */
export function score(input: CodenamesInput, playerIds: ID[]): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) {
    out[id] = input.teams[id] === input.winner ? 1 : 0;
  }
  return out;
}

/**
 * The leading team: players tied at the highest games-won total. Empty when no
 * games have been won yet (nothing to crown); a level match returns both teams
 * as co-winners.
 */
export function pickWinners(totals: Record<ID, number>): ID[] {
  const ids = Object.keys(totals);
  if (ids.length === 0) return [];
  const best = Math.max(...ids.map((id) => totals[id] ?? 0));
  if (best <= 0) return [];
  return ids.filter((id) => (totals[id] ?? 0) === best);
}

/** Best-of-series end: any team reaches the win target (0 = open-ended). */
export function matchOver(totals: Record<ID, number>, winTarget: number): boolean {
  const target = Number(winTarget) || 0;
  if (target <= 0) return false;
  return Object.values(totals).some((t) => t >= target);
}

/** Count games won by each team across recorded rounds. */
export function tally(rounds: Round[]): Record<Team, number> {
  const counts: Record<Team, number> = { red: 0, blue: 0 };
  for (const r of rounds) {
    const w = (r.input as CodenamesInput | undefined)?.winner;
    if (isTeam(w)) counts[w] += 1;
  }
  return counts;
}

/** One-line history summary: winner, plus the assassin flourish when it applies. */
export function describe(input: CodenamesInput): string {
  if (!isTeam(input.winner)) return 'No winner recorded';
  const meta = TEAM_META[input.winner];
  let out = `${meta.emoji} ${meta.label} won`;
  if (input.ending === 'assassin') out += ' · 💀 assassin';
  return out;
}

// ── Series drama ────────────────────────────────────────────────────────────

export interface SeriesState {
  /** Best-of target (games to win). 0 = open-ended, no series. */
  target: number;
  /** The side currently ahead in banked games, or null when level. */
  leader: Team | null;
  /** Games each side still needs to clinch the series (0 once reached). */
  redNeeded: number;
  blueNeeded: number;
  /** A side sits one game from taking the series (best-of only, not yet over). */
  matchPoint: boolean;
  /** Both sides are one game away — the next game decides it. */
  decider: boolean;
  /** The series has already been clinched. */
  over: boolean;
}

/**
 * The state of a best-of series from the games banked so far. Drives the series
 * pips and the "match point / decider" tension line. With no target (0) it stays
 * an open-ended head-to-head: a leader is still surfaced, but nothing is a match
 * point and it's never "over".
 */
export function seriesState(counts: Record<Team, number>, winTarget: number): SeriesState {
  const target = Math.max(0, Math.round(Number(winTarget) || 0));
  const red = Math.max(0, Number(counts.red) || 0);
  const blue = Math.max(0, Number(counts.blue) || 0);
  const leader: Team | null = red === blue ? null : red > blue ? 'red' : 'blue';

  if (target <= 0) {
    return { target: 0, leader, redNeeded: 0, blueNeeded: 0, matchPoint: false, decider: false, over: false };
  }
  const redNeeded = Math.max(0, target - red);
  const blueNeeded = Math.max(0, target - blue);
  const over = redNeeded === 0 || blueNeeded === 0;
  const matchPoint = !over && (redNeeded === 1 || blueNeeded === 1);
  const decider = !over && redNeeded === 1 && blueNeeded === 1;
  return { target, leader, redNeeded, blueNeeded, matchPoint, decider, over };
}

export interface Streak {
  /** The team riding the current streak, or null when there's no run yet. */
  team: Team | null;
  /** How many games in a row that team has won (0 when none). */
  length: number;
}

/**
 * The current win streak: how many games in a row the most-recent winner has
 * taken. Reads the rounds in play order and stops at the first side-change, so a
 * fresh loss resets the run. Unresolved rounds are skipped.
 */
export function streak(rounds: Round[]): Streak {
  const winners: Team[] = [];
  const ordered = [...rounds].sort((a, b) => a.index - b.index);
  for (const r of ordered) {
    const w = (r.input as CodenamesInput | undefined)?.winner;
    if (isTeam(w)) winners.push(w);
  }
  if (winners.length === 0) return { team: null, length: 0 };
  const team = winners[winners.length - 1];
  let length = 0;
  for (let i = winners.length - 1; i >= 0; i--) {
    if (winners[i] === team) length += 1;
    else break;
  }
  return { team, length };
}

// ── Fast team assignment ────────────────────────────────────────────────────

/** Balanced split by seat order (alternating). Alias of {@link defaultTeams}. */
export function balanceTeams(playerIds: ID[]): Record<ID, Team> {
  return defaultTeams(playerIds);
}

/** Flip every player to the other side — swap Red ⇄ Blue wholesale. */
export function swapTeams(teams: Record<ID, Team>): Record<ID, Team> {
  const out: Record<ID, Team> = {};
  for (const [id, t] of Object.entries(teams)) {
    out[id] = isTeam(t) ? otherTeam(t) : 'red';
  }
  return out;
}

/**
 * A random *balanced* split: shuffle the roster, then deal alternately so the
 * teams differ by at most one. RNG is injectable so tests are deterministic.
 */
export function shuffleTeams(
  playerIds: ID[],
  rand: () => number = Math.random,
): Record<ID, Team> {
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return defaultTeams(shuffled);
}

// ── Spymaster flavour ───────────────────────────────────────────────────────

/**
 * A deterministic, family-friendly spy "codeword" for a game, seeded so the same
 * game always shows the same word (pure flavour on the panel — never state).
 */
export function codeword(seed: number | string): string {
  const words = [
    'NIGHTFALL', 'COBRA', 'ECHO', 'LANTERN', 'MIRAGE', 'FALCON', 'CIPHER', 'VELVET',
    'DOMINO', 'GLACIER', 'ORCHID', 'THUNDER', 'SPARROW', 'JACKAL', 'HALO', 'RIPTIDE',
  ];
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return words[Math.abs(h) % words.length];
}

