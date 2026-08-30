import type { ID } from '../../types';

/**
 * Pure Canasta scoring — no Svelte, no I/O, so it's independently unit-testable and
 * safe for the stats engine to import.
 *
 * Canasta is a fixed-partnership rummy: classically 4 players in two teams of two,
 * though 2 players (each their own "team") is common too. Score King's shell has no
 * partnership model of its own (the `teams` flag is only declared), so — exactly like
 * Euchre — team play lives *inside this module*: every partner on a team receives the
 * team's hand score, so each partner's running total equals the team score and the
 * generic scoreboard / leader / winner / target-finish all read as team semantics with
 * no shell changes.
 *
 * Scoring per hand, per team (see help text in ./index.ts for the full published rules):
 *   + 500 for each natural (pure, no wild cards) canasta
 *   + 300 for each mixed canasta (at least one wild card)
 *   + 100 for each red three melded, or 800 if all four are collected
 *   + 100 for going out this hand, or 200 for going out concealed
 *   + the point value of every card the team has melded on the table
 *   − the point value of every card left in the team's hand(s)
 */

export type TeamIndex = 0 | 1;
export type Pairing = 'adjacent' | 'across';

/** One team's tally for a single hand. Every field is entered directly by the scorer. */
export interface CanastaHand {
  /** Natural (pure) canastas — no wild cards — worth 500 each. */
  naturalCanastas: number;
  /** Mixed canastas — at least one wild card — worth 300 each. */
  mixedCanastas: number;
  /** Red threes melded this hand (0–4). All four together are worth 800, not 400. */
  redThrees: number;
  /** Total point value of every card the team melded on the table this hand. */
  meldPoints: number;
  /** Total point value of cards left stranded in the team's hand(s) — subtracted. */
  handPoints: number;
  /** This team went out (emptied their hand) and ended the round. */
  wentOut: boolean;
  /** Went out concealed — laid down their entire hand in one go. Implies `wentOut`. */
  concealedOut: boolean;
}

export interface CanastaInput {
  /** Resolved partnerships (one or more player ids each), fixed for the whole game. */
  teams: [ID[], ID[]];
  /** This hand's tally for each team, indexed the same as `teams`. */
  hands: [CanastaHand, CanastaHand];
}

/** A fresh, unscored hand for one team. */
export function emptyHand(): CanastaHand {
  return {
    naturalCanastas: 0,
    mixedCanastas: 0,
    redThrees: 0,
    meldPoints: 0,
    handPoints: 0,
    wentOut: false,
    concealedOut: false,
  };
}

/** Split picked players into two partnerships. Two players are simply their own teams. */
export function resolveTeams<T extends { id: ID }>(players: T[], pairing: Pairing): [ID[], ID[]] {
  const ids = players.map((p) => p.id);
  if (ids.length <= 2) return [ids.slice(0, 1), ids.slice(1, 2)];
  const pick = (...idx: number[]): ID[] => idx.map((i) => ids[i]).filter((x): x is ID => x != null);
  return pairing === 'across' ? [pick(0, 2), pick(1, 3)] : [pick(0, 1), pick(2, 3)];
}

/** A safe, non-negative number from possibly-dirty draft input. */
function nonNeg(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Canasta bonuses: 500 a natural, 300 a mixed. */
export function canastaBonus(hand: CanastaHand): number {
  return nonNeg(hand.naturalCanastas) * 500 + nonNeg(hand.mixedCanastas) * 300;
}

/** Red-three bonus: 100 each, or 800 for the full set of four. */
export function redThreeBonus(redThrees: number): number {
  const n = Math.max(0, Math.min(4, Math.round(Number(redThrees) || 0)));
  return n >= 4 ? 800 : n * 100;
}

/** Going-out bonus: 100, or 200 if the team went out concealed. */
export function outBonus(hand: CanastaHand): number {
  if (!hand.wentOut) return 0;
  return hand.concealedOut ? 200 : 100;
}

/** A team's full score for one hand — bonuses plus melded points, minus points left in hand. */
export function handScore(hand: CanastaHand): number {
  return (
    canastaBonus(hand) +
    redThreeBonus(hand.redThrees) +
    outBonus(hand) +
    nonNeg(hand.meldPoints) -
    nonNeg(hand.handPoints)
  );
}

/** Per-player point deltas for a hand: every teammate shares their team's hand score. */
export function scoreCanasta(input: CanastaInput): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const team of input.teams) for (const id of team) out[id] = 0;
  const scores: [number, number] = [handScore(input.hands[0]), handScore(input.hands[1])];
  input.teams.forEach((team, idx) => {
    for (const id of team) out[id] = scores[idx];
  });
  return out;
}

/** Null when the hand is valid to record, otherwise a human-readable reason. */
export function validateCanasta(input: CanastaInput): string | null {
  const flat = input.teams.flat();
  if (flat.length < 2) return 'Canasta needs at least two players split into two teams.';
  const outCount = input.hands.filter((h) => h.wentOut).length;
  if (outCount > 1) return 'Only one team can go out in a hand.';
  for (const h of input.hands) {
    if (h.concealedOut && !h.wentOut) return 'Concealed only applies to the team that went out.';
    if (h.redThrees < 0 || h.redThrees > 4) return 'Red threes must be between 0 and 4.';
    if (h.naturalCanastas < 0 || h.mixedCanastas < 0) return 'Canasta counts can’t be negative.';
    if (h.meldPoints < 0) return 'Melded points can’t be negative.';
    if (h.handPoints < 0) return 'Points left in hand can’t be negative.';
  }
  return null;
}

/**
 * Short, glanceable summary of a recorded hand for the history table. `scores` are the
 * points each team actually got this hand (read from stored deltas when available so the
 * text always matches the recorded score); when omitted they're derived from the input.
 */
export function describeHand(
  input: CanastaInput,
  players: { id: ID; name: string }[],
  scores?: [number, number],
): string {
  const name = (id: ID): string => players.find((p) => p.id === id)?.name ?? '?';
  const teamLabel = (idx: TeamIndex): string =>
    (input.teams[idx] ?? []).map((id) => name(id)).join(' & ') || `Team ${idx + 1}`;
  const s = scores ?? [handScore(input.hands[0]), handScore(input.hands[1])];

  const outIdx = input.hands.findIndex((h) => h.wentOut) as TeamIndex | -1;
  if (outIdx === 0 || outIdx === 1) {
    const other = (outIdx === 0 ? 1 : 0) as TeamIndex;
    const concealed = input.hands[outIdx].concealedOut;
    return `${concealed ? '🥷' : '🏁'} ${teamLabel(outIdx)} goes out${
      concealed ? ' concealed' : ''
    } — ${s[outIdx]} (${teamLabel(other)} ${s[other]})`;
  }
  return `🃏 ${teamLabel(0)} ${s[0]} — ${teamLabel(1)} ${s[1]}`;
}

// --- race to the target: team totals + who's leading, for the race bar ---

/**
 * Each team's running score. Both partners mirror the team total (see {@link scoreCanasta}),
 * so the max across a team's members is the team score and is robust to a missing id.
 */
export function teamTotals(teams: [ID[], ID[]], totals: Record<ID, number>): [number, number] {
  const score = (team: ID[]): number =>
    team.length ? Math.max(...team.map((id) => totals[id] ?? 0)) : 0;
  return [score(teams[0] ?? []), score(teams[1] ?? [])];
}

/** The team in front, or null on a tie (including 0–0). */
export function leadingTeam(scores: [number, number]): TeamIndex | null {
  if (scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 0 : 1;
}

/** Points a team still needs to hit the target (never negative). */
export function toTarget(score: number, target: number): number {
  return Math.max(0, target - score);
}

// --- config coercion (config values arrive as `unknown` from stored game config) ---

export function pairingFromConfig(config: Record<string, unknown>): Pairing {
  return config.pairing === 'across' ? 'across' : 'adjacent';
}

export function targetFromConfig(config: Record<string, unknown>): number {
  const t = Number(config.target);
  return Number.isFinite(t) && t > 0 ? t : 5000;
}

/**
 * The minimum point value a team's very first meld of the game must reach, based on
 * their cumulative score *before* the hand — the classic sliding scale. Below zero is
 * the easiest (15); the bar rises as a team's score climbs.
 */
export function minimumInitialMeld(scoreBefore: number): number {
  if (scoreBefore < 0) return 15;
  if (scoreBefore < 1500) return 50;
  if (scoreBefore < 3000) return 90;
  return 120;
}
