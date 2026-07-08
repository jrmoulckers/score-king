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
