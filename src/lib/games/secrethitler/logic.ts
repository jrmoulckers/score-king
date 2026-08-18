import type { ID } from '../../types';

/**
 * Pure Secret Hitler engine — no Svelte, no I/O. The module (`index.ts`), the round
 * editor and the tests all fold a list of recorded events into board state through
 * {@link computeState}. Secret Hitler is scoreless, so the point-oriented GameModule
 * contract is satisfied by encoding the *outcome* rather than a running score: the
 * round that clinches the game records the revealed winning team, and each of those
 * members is later awarded a single victory point (see `index.ts`).
 */

/** The two secret teams. Hitler counts as Fascist. */
export type SHTeam = 'liberal' | 'fascist';

/** Everything that can happen on a recorded round (one government / one enacted policy). */
export type SHEventKind =
  | 'liberal' // a Liberal policy was enacted
  | 'fascist' // a Fascist policy was enacted
  | 'electionFailed' // the government was voted down — election tracker +1
  | 'execution' // a President used the execution power
  | 'hitlerChancellor'; // Hitler was elected Chancellor

/** The editable draft for a single round. */
export interface SecretHitlerInput {
  event: SHEventKind;
  /** For `execution`: was the executed player Hitler? Liberals win if so. */
  hitlerKilled?: boolean;
  /** For `execution`: which seated player was executed (flavour + stats). */
  target?: ID | null;
  /** The revealed winning team's members, recorded on the deciding round. */
  winners?: ID[];
}

export const LIBERAL_TARGET = 5;
export const FASCIST_TARGET = 6;
export const TRACKER_MAX = 3;
/** The execution power is printed on the 4th and 5th Fascist slots for every count. */
export const KILL_POWER_MIN = 4;
/** Electing Hitler Chancellor only wins once this many Fascist policies are enacted. */
export const HITLER_CHANCELLOR_MIN = 3;
/** Veto power unlocks once this many Fascist policies are enacted (all counts). */
export const VETO_MIN = 5;

/** Running public state of a game, folded from its recorded events. */
export interface SHState {
  liberal: number;
  fascist: number;
  tracker: number;
  winner: SHTeam | null;
  winReason: string | null;
  /** Index of the event that decided the game, or null while it is still live. */
  decidedAt: number | null;
}

export function emptyState(): SHState {
  return { liberal: 0, fascist: 0, tracker: 0, winner: null, winReason: null, decidedAt: null };
}

function decide(s: SHState, team: SHTeam, reason: string, index: number): void {
  s.winner = team;
  s.winReason = reason;
  s.decidedAt = index;
}

/** Apply one event to a mutable state (no-op once the game is decided). */
function applyEvent(s: SHState, e: SecretHitlerInput, index: number): void {
  if (s.winner) return;
  switch (e.event) {
    case 'liberal':
      s.liberal = Math.min(LIBERAL_TARGET, s.liberal + 1);
      s.tracker = 0;
      if (s.liberal >= LIBERAL_TARGET) decide(s, 'liberal', 'Five Liberal policies enacted', index);
      break;
    case 'fascist':
      s.fascist = Math.min(FASCIST_TARGET, s.fascist + 1);
      s.tracker = 0;
      if (s.fascist >= FASCIST_TARGET) decide(s, 'fascist', 'Six Fascist policies enacted', index);
      break;
    case 'electionFailed':
      s.tracker = Math.min(TRACKER_MAX, s.tracker + 1);
      break;
    case 'execution':
      if (e.hitlerKilled) decide(s, 'liberal', 'Hitler was assassinated', index);
      break;
    case 'hitlerChancellor':
      if (s.fascist >= HITLER_CHANCELLOR_MIN) {
        decide(s, 'fascist', 'Hitler was elected Chancellor', index);
      }
      break;
  }
}

/**
 * Fold recorded events into board state. Once a win condition triggers, later
 * events are ignored — the game is over the moment it is decided.
 */
export function computeState(events: SecretHitlerInput[]): SHState {
  const s = emptyState();
  events.forEach((e, i) => applyEvent(s, e, i));
  return s;
}

/** Preview the state after applying one more event to an existing state. */
export function previewAfter(before: SHState, input: SecretHitlerInput): SHState {
  const s: SHState = { ...before };
  applyEvent(s, input, (before.decidedAt ?? -1) + 1);
  return s;
}

// ── Setup: role split & board powers per player count ──────────────────────

const ROLE_TABLE: Record<number, { liberals: number; fascists: number }> = {
  5: { liberals: 3, fascists: 1 },
  6: { liberals: 4, fascists: 1 },
  7: { liberals: 4, fascists: 2 },
  8: { liberals: 5, fascists: 2 },
  9: { liberals: 5, fascists: 3 },
  10: { liberals: 6, fascists: 3 },
};

export interface RoleSetup {
  /** Plain Liberals. */
  liberals: number;
  /** Plain Fascists — excludes Hitler. */
  fascists: number;
  /** In 5–6 player games Hitler knows who the Fascists are. */
  hitlerKnowsFascists: boolean;
  /** Size of the Liberal team ( = liberals ). */
  liberalTeam: number;
  /** Size of the Fascist team ( = fascists + Hitler ). */
  fascistTeam: number;
}

export function roleSetup(playerCount: number): RoleSetup {
  const base =
    ROLE_TABLE[playerCount] ??
    ({
      liberals: Math.max(1, playerCount - Math.floor(playerCount / 3) - 1),
      fascists: Math.max(1, Math.floor(playerCount / 3)),
    } as { liberals: number; fascists: number });
  return {
    liberals: base.liberals,
    fascists: base.fascists,
    hitlerKnowsFascists: playerCount <= 6,
    liberalTeam: base.liberals,
    fascistTeam: base.fascists + 1,
  };
}

/** Expected number of members on the winning team, given the seated player count. */
export function teamSize(playerCount: number, team: SHTeam): number {
  const r = roleSetup(playerCount);
  return team === 'liberal' ? r.liberalTeam : r.fascistTeam;
}

export interface Power {
  key: string;
  label: string;
  emoji: string;
}

const PEEK: Power = { key: 'peek', label: 'Policy Peek', emoji: '🔍' };
const INVESTIGATE: Power = { key: 'investigate', label: 'Investigate Loyalty', emoji: '🔎' };
const SPECIAL: Power = { key: 'special', label: 'Special Election', emoji: '🗳️' };
const EXECUTION: Power = { key: 'execution', label: 'Execution', emoji: '🔫' };

/**
 * The executive power printed on the Fascist board for the nth Fascist policy
 * (1–6), for the given player count. Matches the official board layouts.
 */
export function powerAt(playerCount: number, fascistPolicy: number): Power | null {
  let layout: Record<number, Power>;
  if (playerCount <= 6) {
    layout = { 3: PEEK, 4: EXECUTION, 5: EXECUTION };
  } else if (playerCount <= 8) {
    layout = { 2: INVESTIGATE, 3: SPECIAL, 4: EXECUTION, 5: EXECUTION };
  } else {
    layout = { 1: INVESTIGATE, 2: INVESTIGATE, 3: SPECIAL, 4: EXECUTION, 5: EXECUTION };
  }
  return layout[fascistPolicy] ?? null;
}

/** The full 1–5 power column for a player count (index 0 = 1st Fascist policy). */
export function powerColumn(playerCount: number): (Power | null)[] {
  return [1, 2, 3, 4, 5].map((n) => powerAt(playerCount, n));
}

// ── Shared helpers, reused by index.ts and the editor ──────────────────────

/** Normalise a stored/loaded round input into a well-formed event. */
export function eventOf(input: unknown): SecretHitlerInput {
  const e = (input ?? {}) as Partial<SecretHitlerInput>;
  return {
    event: (e.event ?? 'liberal') as SHEventKind,
    hitlerKilled: !!e.hitlerKilled,
    target: e.target ?? null,
    winners: Array.isArray(e.winners) ? e.winners : [],
  };
}

/**
 * Validate a drafted round against the state entering it. Returns null when valid,
 * otherwise a human-readable message. `winners` must exactly match the winning team
 * size on the deciding round so `pickWinners` can record the whole team.
 */
export function validate(
  before: SHState,
  input: SecretHitlerInput,
  playerCount: number,
  validId: (id: ID) => boolean,
): string | null {
  if (before.winner) {
    return 'This game is already decided — tap “Finish & record winner”.';
  }
  switch (input.event) {
    case 'electionFailed':
      if (before.tracker >= TRACKER_MAX) {
        return 'The election tracker is full — the top policy is force-enacted. Record it as a Liberal or Fascist policy.';
      }
      break;
    case 'execution':
      if (before.fascist < KILL_POWER_MIN) {
        return 'The execution power unlocks after the 4th Fascist policy.';
      }
      break;
    case 'hitlerChancellor':
      if (before.fascist < HITLER_CHANCELLOR_MIN) {
        return 'Electing Hitler Chancellor only ends the game once 3 Fascist policies are enacted.';
      }
      break;
  }
  const after = previewAfter(before, input);
  if (after.winner) {
    const need = teamSize(playerCount, after.winner);
    const picked = (input.winners ?? []).filter(validId);
    const teamName = after.winner === 'liberal' ? 'Liberal' : 'Fascist';
    if (picked.length !== need) {
      return `${teamName}s win! Tap the ${need} ${teamName} team member${need === 1 ? '' : 's'}.`;
    }
  }
  return null;
}
