import type { ID } from '../../types';

/**
 * Two Rooms and a Boom — a scoreless, hidden-role team game modeled onto the
 * point-oriented {@link import('../../types').GameModule} contract.
 *
 * The timeline is the game's physical ROUNDS: each records the two room leaders
 * and how many hostages each room sent. Those rounds score nothing. The FINAL
 * round also carries the Reveal — the winning team and who was on it — which is
 * the only round that scores (each winner +1), so `pickWinners` reads the
 * winning team straight out of the totals. Everything here is pure and
 * Svelte-free so `tworooms.test.ts` can exercise the real rules.
 */

export type Team = 'blue' | 'red';

export interface TwoRoomsReveal {
  /**
   * Winning team. 'red' when the Bomber ended in the President's room (the Bomber
   * "caught" the President); otherwise 'blue'. null until the reveal is recorded.
   */
  winner: Team | null;
  /** Players revealed to be on the winning team — each one earns the win. */
  winners: ID[];
  /** Who held the President card (Blue). Optional, for flavor + stats. */
  president: ID | null;
  /** Who held the Bomber card (Red). Optional, for flavor + stats. */
  bomber: ID | null;
}

export interface TwoRoomsInput {
  /** Leader of Room 1 this round (a player id), or null when unrecorded. */
  leader1: ID | null;
  /** Leader of Room 2 this round. */
  leader2: ID | null;
  /** Hostages Room 1 sent to Room 2 at the end of the round. */
  sent1: number;
  /** Hostages Room 2 sent to Room 1. */
  sent2: number;
  /** The final reveal — only meaningful on (and validated for) the last round. */
  reveal: TwoRoomsReveal;
}

export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 30;
export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 5;
export const DEFAULT_ROUNDS = 3;

/** The configured number of rounds, clamped to the supported 3–5 range. */
export function roundCount(config: Record<string, unknown> | undefined): number {
  const n = Math.round(Number(config?.rounds));
  if (!Number.isFinite(n)) return DEFAULT_ROUNDS;
  return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, n));
}

/** True when this 0-based round is the last one — the round that records the reveal. */
export function isFinalRound(roundIndex: number, config: Record<string, unknown> | undefined): boolean {
  return roundIndex >= roundCount(config) - 1;
}

/**
 * Suggested round length in minutes. Rounds count down to a tense one-minute
 * finish (3-round game → 3, 2, 1; a 5-round game → 5, 4, 3, 2, 1).
 */
export function suggestedMinutes(roundIndex: number, config: Record<string, unknown> | undefined): number {
  return Math.max(1, roundCount(config) - roundIndex);
}

/**
 * Suggested hostages a room sends this round, following the official chart:
 *   6–10 players → 1 / 1 / 1,  11–21 → 2 / 1 / 1,  22+ → 3 / 2 / 1.
 * The final round always trades a single hostage; the opening round scales with
 * the crowd; middle rounds sit in between (generalized so 4–5 round games taper).
 */
export function suggestedHostages(
  playerCount: number,
  roundIndex: number,
  config: Record<string, unknown> | undefined,
): number {
  const rounds = roundCount(config);
  if (roundIndex >= rounds - 1) return 1;
  const opening = playerCount >= 22 ? 3 : playerCount >= 11 ? 2 : 1;
  if (roundIndex === 0) return opening;
  return playerCount >= 22 ? 2 : 1;
}

export interface RoleBreakdown {
  players: number;
  /** Always 1 — the Blue Team's President. */
  president: number;
  /** Always 1 — the Red Team's Bomber. */
  bomber: number;
  /** Plain Blue cards (does not include the President). */
  blueTeam: number;
  /** Plain Red cards (does not include the Bomber). */
  redTeam: number;
  /** 1 when the count is odd — the grey/independent Gambler is added. */
  gambler: number;
  /** Blue side total, including the President. */
  blueTotal: number;
  /** Red side total, including the Bomber. */
  redTotal: number;
}

/**
 * The character deck for `players`: President (Blue) + Bomber (Red) + an equal
 * number of plain Blue/Red cards, plus a Gambler when the count is odd (the
 * rulebook's tie-breaker for odd tables).
 */
export function roleBreakdown(players: number): RoleBreakdown {
  const p = Math.max(0, Math.floor(Number(players) || 0));
  const leaders = p >= 2 ? 1 : 0;
  const gambler = p % 2 === 1 ? 1 : 0;
  const rest = Math.max(0, p - 2 * leaders - gambler);
  const half = Math.floor(rest / 2);
  return {
    players: p,
    president: leaders,
    bomber: leaders,
    blueTeam: half,
    redTeam: half,
    gambler,
    blueTotal: leaders + half,
    redTotal: leaders + half,
  };
}

/** A fresh, empty round draft. */
export function createInput(): TwoRoomsInput {
  return {
    leader1: null,
    leader2: null,
    sent1: 0,
    sent2: 0,
    reveal: { winner: null, winners: [], president: null, bomber: null },
  };
}

/** Human label for a team. */
export function teamLabel(team: Team): string {
  return team === 'red' ? 'Red Team' : 'Blue Team';
}

/** Return null when the round is valid, otherwise a human-readable error. */
export function validate(
  input: TwoRoomsInput,
  roundIndex: number,
  config: Record<string, unknown> | undefined,
  playerIds: ID[],
): string | null {
  if (!input) return 'Round data is missing.';
  if ((Number(input.sent1) || 0) < 0 || (Number(input.sent2) || 0) < 0) {
    return 'Hostage counts can’t be negative.';
  }
  if (input.leader1 && input.leader2 && input.leader1 === input.leader2) {
    return 'Each room needs its own leader — one player can’t lead both rooms.';
  }
  if (isFinalRound(roundIndex, config)) {
    const r = input.reveal;
    if (!r || (r.winner !== 'blue' && r.winner !== 'red')) {
      return 'Reveal time: did the Bomber end up in the President’s room?';
    }
    if (!Array.isArray(r.winners) || r.winners.length === 0) {
      return `Tap everyone on the winning ${teamLabel(r.winner)}.`;
    }
    const known = new Set(playerIds);
    if (r.winners.some((id) => !known.has(id))) {
      return 'A selected winner isn’t in this game.';
    }
    if (r.president && !known.has(r.president)) return 'The President isn’t in this game.';
    if (r.bomber && !known.has(r.bomber)) return 'The Bomber isn’t in this game.';
  }
  return null;
}

/**
 * Per-player deltas. Exchange rounds score nothing (the game is scoreless until
 * the reveal). The final round awards +1 to each player on the winning team, so
 * the totals encode exactly one thing: who won.
 */
export function score(
  input: TwoRoomsInput,
  roundIndex: number,
  config: Record<string, unknown> | undefined,
  playerIds: ID[],
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = 0;
  if (isFinalRound(roundIndex, config) && input?.reveal?.winner) {
    const winners = new Set(input.reveal.winners ?? []);
    for (const id of playerIds) out[id] = winners.has(id) ? 1 : 0;
  }
  return out;
}

/**
 * The winning team from accumulated totals: everyone tied at the top total,
 * provided it's above zero. Returns [] while the game is undecided (all zero) so
 * a scoreless, unrevealed game reports no winner instead of a full-table tie.
 */
export function pickWinners(totals: Record<ID, number>): ID[] {
  const ids = Object.keys(totals);
  let max = 0;
  for (const id of ids) max = Math.max(max, Number(totals[id]) || 0);
  if (max <= 0) return [];
  return ids.filter((id) => (Number(totals[id]) || 0) === max);
}

/**
 * A one-line summary for the history log. Detects the reveal by its recorded
 * winner (describeRound has no config), so exchange rounds read as swaps and the
 * final round reads as the boom.
 */
export function describe(input: TwoRoomsInput, nameOf: (id: ID | null) => string): string {
  const r = input?.reveal;
  if (r && (r.winner === 'red' || r.winner === 'blue')) {
    if (r.winner === 'red') {
      const who =
        r.bomber && r.president
          ? `${nameOf(r.bomber)} caught ${nameOf(r.president)}`
          : 'the Bomber caught the President';
      return `💥 Red Team wins — ${who}`;
    }
    const who = r.president ? `${nameOf(r.president)} escaped the Bomber` : 'the Bomber was contained';
    return `🕊️ Blue Team wins — ${who}`;
  }
  const a = Number(input?.sent1) || 0;
  const b = Number(input?.sent2) || 0;
  if (input?.leader1 || input?.leader2) {
    const l1 = input.leader1 ? nameOf(input.leader1) : 'Room 1';
    const l2 = input.leader2 ? nameOf(input.leader2) : 'Room 2';
    return `🔁 ${l1} sent ${a} · ${l2} sent ${b}`;
  }
  return `🔁 Hostage swap — ${a} ⇄ ${b}`;
}
