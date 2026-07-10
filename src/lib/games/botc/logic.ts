import type { ID } from '../../types';

/**
 * Blood on the Clocktower — a Storyteller TRACKER, not a rules engine. This file
 * holds the pure, Svelte-free core: phase math, roster carry-forward, the vote
 * threshold, a light role reference, and how a recorded winner maps onto the
 * point-oriented {@link import('../../types').GameModule} contract.
 *
 * The scoreless game is fitted to the contract by treating a recorded result as
 * a one-off point award: every player on the winning team gets +1 the phase the
 * Storyteller declares a winner, so cumulative totals become 1 (winning team) /
 * 0 (everyone else) and `pickWinners` can return the whole team from totals alone.
 */

export type Team = 'good' | 'evil';
export type PhaseKind = 'night' | 'day';

/** One player's live state, snapshotted per phase so each round stands alone. */
export interface PlayerState {
  /** Free-text character name (autocompleted from the script, never enforced). */
  role: string;
  team: Team;
  alive: boolean;
  /** A dead player spends their single ghost vote once — tracked, never enforced. */
  ghostUsed: boolean;
  /**
   * The Demon, in the Storyteller's Grimoire. Optional and auto-set when a
   * demon-type role is typed; drives the "Good wins when the Demon dies" nudge.
   */
  isDemon?: boolean;
  /** Private Storyteller reminder token ("poisoned", "drunk", "red herring"). */
  reminder?: string;
  /** The Storyteller's read: who they think this seat is (or could be). */
  suspect?: string;
}

/** A single day-phase nomination and its vote tally. */
export interface Nomination {
  nominatorId: ID | null;
  nomineeId: ID | null;
  votes: number;
  executed: boolean;
}

/** The full editable payload recorded for one phase (night or day). */
export interface BotcInput {
  /** Roster snapshot for this phase, keyed by player id. */
  states: Record<ID, PlayerState>;
  /** Day-phase nominations/votes (empty on nights). */
  nominations: Nomination[];
  /** Set on the deciding phase to record which team won. */
  result: Team | null;
  /** Optional Storyteller note for the phase. */
  note: string;
}

// ── Phase math ────────────────────────────────────────────────────────────
// Rounds alternate, starting on the first night: index 0 = Night 1, 1 = Day 1,
// 2 = Night 2, 3 = Day 2, … so a round's kind + number come straight from index.

export function phaseKind(index: number): PhaseKind {
  return index % 2 === 0 ? 'night' : 'day';
}

export function phaseNumber(index: number): number {
  return Math.floor(index / 2) + 1;
}

export function phaseLabel(index: number): string {
  return `${phaseKind(index) === 'night' ? 'Night' : 'Day'} ${phaseNumber(index)}`;
}

export function phaseEmoji(index: number): string {
  return phaseKind(index) === 'night' ? '🌙' : '☀️';
}

// ── Roster ──────────────────────────────────────────────────────────────────

export function freshState(): PlayerState {
  return { role: '', team: 'good', alive: true, ghostUsed: false };
}

/** A brand-new roster (Night 1): everyone alive, unassigned, presumed good. */
export function initialRoster(playerIds: ID[]): Record<ID, PlayerState> {
  return Object.fromEntries(playerIds.map((id) => [id, freshState()]));
}

/**
 * Carry a roster forward into the next phase — roles, teams, alive/dead, the
 * ghost-vote status and the Storyteller's Grimoire notes (demon, reminder,
 * suspect) persist, so only what changed needs editing. New seats (defensive)
 * start fresh; a cloned object keeps rounds independent.
 */
export function carryRoster(
  prev: Record<ID, PlayerState> | undefined,
  playerIds: ID[],
): Record<ID, PlayerState> {
  const out: Record<ID, PlayerState> = {};
  for (const id of playerIds) {
    const p = prev?.[id];
    out[id] = p
      ? {
          role: p.role,
          team: p.team,
          alive: p.alive,
          ghostUsed: p.ghostUsed,
          isDemon: p.isDemon,
          reminder: p.reminder,
          suspect: p.suspect,
        }
      : freshState();
  }
  return out;
}

export function aliveCount(states: Record<ID, PlayerState>): number {
  return Object.values(states).filter((s) => s.alive).length;
}

export function teamCount(states: Record<ID, PlayerState>, team: Team): number {
  return Object.values(states).filter((s) => s.team === team).length;
}

export function aliveTeamCount(states: Record<ID, PlayerState>, team: Team): number {
  return Object.values(states).filter((s) => s.alive && s.team === team).length;
}

/**
 * Votes needed to put a player on the block: a majority of the living. This is
 * pure arithmetic the table already does aloud — a glance helper, not a rule.
 */
export function voteThreshold(alive: number): number {
  return Math.ceil(Math.max(0, alive) / 2);
}

/** Ghost votes still in the town: dead players who haven't spent theirs. */
export function ghostVotesLeft(states: Record<ID, PlayerState>): number {
  return Object.values(states).filter((s) => !s.alive && !s.ghostUsed).length;
}

/** Whether the Demon is unmarked, still among the living, or has fallen. */
export type DemonState = 'unmarked' | 'alive' | 'fallen';

/**
 * The Demon's fate at a glance, for the "Good wins the moment the Demon dies"
 * nudge. `unmarked` when the Storyteller hasn't flagged a Demon yet; `alive`
 * while any flagged Demon lives; `fallen` once every flagged Demon is dead.
 */
export function demonStatus(states: Record<ID, PlayerState>): DemonState {
  const demons = Object.values(states).filter((s) => s.isDemon);
  if (demons.length === 0) return 'unmarked';
  return demons.some((s) => s.alive) ? 'alive' : 'fallen';
}

/**
 * How many more deaths until only two players remain alive — the point Evil
 * wins. Zero means the town is already at (or below) the floor.
 */
export function evilWinsIn(states: Record<ID, PlayerState>): number {
  return Math.max(0, aliveCount(states) - 2);
}

/** What an evil player learns on the first night: their team and the Demon. */
export interface EvilKnowledge {
  /** Other evil seats (excludes the viewer). */
  fellowEvil: ID[];
  /** The flagged Demon's seat, if any (may be the viewer themselves). */
  demonId: ID | null;
}

/**
 * The fellow-evil + Demon info surfaced in a minion/demon's private reveal.
 * Pure so it can be unit-tested; the editor only renders what it returns.
 */
export function evilKnowledge(
  states: Record<ID, PlayerState>,
  selfId: ID,
): EvilKnowledge {
  const ids = Object.keys(states);
  return {
    fellowEvil: ids.filter((id) => id !== selfId && states[id]?.team === 'evil'),
    demonId: ids.find((id) => states[id]?.isDemon) ?? null,
  };
}

// ── Scoring / winners ─────────────────────────────────────────────────────

/**
 * Score a phase. Tracking phases are scoreless (0 for everyone); the phase that
 * records a `result` awards +1 to each player on the winning team, so totals
 * end at 1 (winners) / 0 (losers).
 */
export function scoreRound(input: BotcInput, playerIds: ID[]): Record<ID, number> {
  const out: Record<ID, number> = {};
  const result = input.result;
  for (const id of playerIds) {
    const st = input.states?.[id];
    out[id] = result && st && st.team === result ? 1 : 0;
  }
  return out;
}

/** The winning team = every id sharing the top total, once a winner exists. */
export function pickWinners(totals: Record<ID, number>): ID[] {
  const ids = Object.keys(totals);
  if (ids.length === 0) return [];
  const max = Math.max(...ids.map((id) => totals[id] ?? 0));
  if (max <= 0) return [];
  return ids.filter((id) => (totals[id] ?? 0) === max);
}

/** A winner has been recorded once any total crosses zero. */
export function isResolved(totals: Record<ID, number>): boolean {
  return Object.values(totals).some((t) => (t ?? 0) > 0);
}

// ── Validation ────────────────────────────────────────────────────────────

export function validate(input: BotcInput, playerIds: ID[]): string | null {
  for (const nom of input.nominations ?? []) {
    if (!nom.nomineeId) return 'Pick who was nominated, or remove the empty nomination.';
    if ((Number(nom.votes) || 0) < 0) return 'Votes can’t be negative.';
  }
  if (input.result) {
    const winners = playerIds.some((id) => input.states?.[id]?.team === input.result);
    if (!winners) {
      return `Assign at least one player to the ${
        input.result === 'good' ? 'Good' : 'Evil'
      } team before recording their win.`;
    }
  }
  return null;
}

// ── History summary ───────────────────────────────────────────────────────

export function describe(
  input: BotcInput,
  index: number,
  nameOf: (id: ID) => string,
): string {
  const label = phaseLabel(index);
  const emoji = phaseEmoji(index);
  if (input.result) {
    return `🏁 ${label} · ${input.result === 'good' ? 'Good' : 'Evil'} wins`;
  }
  if (phaseKind(index) === 'day') {
    const noms = input.nominations ?? [];
    const executed = noms.filter((n) => n.executed && n.nomineeId);
    if (executed.length) {
      return `${emoji} ${label} · ${executed
        .map((n) => nameOf(n.nomineeId as ID))
        .join(', ')} executed`;
    }
    if (noms.length) {
      return `${emoji} ${label} · ${noms.length} nomination${
        noms.length === 1 ? '' : 's'
      }, no execution`;
    }
    return `${emoji} ${label} · no nominations`;
  }
  const alive = aliveCount(input.states ?? {});
  return `${emoji} ${label} · ${alive} alive`;
}

// ── Script / role reference (data only — no abilities encoded) ─────────────

export type RoleType = 'townsfolk' | 'outsider' | 'minion' | 'demon';

export interface RoleRef {
  name: string;
  type: RoleType;
}

/** Townsfolk & Outsiders are Good; Minions & the Demon are Evil. */
export function teamOfType(type: RoleType): Team {
  return type === 'minion' || type === 'demon' ? 'evil' : 'good';
}

function roles(
  townsfolk: string[],
  outsider: string[],
  minion: string[],
  demon: string[],
): RoleRef[] {
  return [
    ...townsfolk.map((name) => ({ name, type: 'townsfolk' as const })),
    ...outsider.map((name) => ({ name, type: 'outsider' as const })),
    ...minion.map((name) => ({ name, type: 'minion' as const })),
    ...demon.map((name) => ({ name, type: 'demon' as const })),
  ];
}

export interface ScriptRef {
  value: string;
  label: string;
  roles: RoleRef[];
}

/** The three official editions, plus a Custom fallback with no reference list. */
export const SCRIPTS: ScriptRef[] = [
  {
    value: 'tb',
    label: 'Trouble Brewing',
    roles: roles(
      ['Washerwoman', 'Librarian', 'Investigator', 'Chef', 'Empath', 'Fortune Teller', 'Undertaker', 'Monk', 'Ravenkeeper', 'Virgin', 'Slayer', 'Soldier', 'Mayor'],
      ['Butler', 'Drunk', 'Recluse', 'Saint'],
      ['Poisoner', 'Spy', 'Scarlet Woman', 'Baron'],
      ['Imp'],
    ),
  },
  {
    value: 'bmr',
    label: 'Bad Moon Rising',
    roles: roles(
      ['Grandmother', 'Sailor', 'Chambermaid', 'Exorcist', 'Innkeeper', 'Gambler', 'Gossip', 'Courtier', 'Professor', 'Minstrel', 'Tea Lady', 'Pacifist', 'Fool'],
      ['Goon', 'Lunatic', 'Tinker', 'Moonchild'],
      ['Godfather', "Devil's Advocate", 'Assassin', 'Mastermind'],
      ['Zombuul', 'Pukka', 'Shabaloth', 'Po'],
    ),
  },
  {
    value: 'snv',
    label: 'Sects & Violets',
    roles: roles(
      ['Clockmaker', 'Dreamer', 'Snake Charmer', 'Mathematician', 'Flowergirl', 'Town Crier', 'Oracle', 'Savant', 'Seamstress', 'Philosopher', 'Artist', 'Juggler', 'Sage'],
      ['Mutant', 'Sweetheart', 'Barber', 'Klutz'],
      ['Evil Twin', 'Witch', 'Cerenovus', 'Pit-Hag'],
      ['Fang Gu', 'Vigormortis', 'No Dashii', 'Vortox'],
    ),
  },
  { value: 'custom', label: 'Custom / homebrew', roles: [] },
];

export function scriptRef(value: string | undefined): ScriptRef {
  return SCRIPTS.find((s) => s.value === value) ?? SCRIPTS[0];
}

export function rolesFor(script: string | undefined): RoleRef[] {
  return scriptRef(script).roles;
}

/** Team a known role belongs to (case-insensitive), or null if off-script. */
export function roleTeam(role: string, script: string | undefined): Team | null {
  const type = roleType(role, script);
  return type ? teamOfType(type) : null;
}

/** Type of a known role (case-insensitive), or null if it's off-script. */
export function roleType(role: string, script: string | undefined): RoleType | null {
  const key = role.trim().toLowerCase();
  if (!key) return null;
  const hit = rolesFor(script).find((r) => r.name.toLowerCase() === key);
  return hit ? hit.type : null;
}

/** True when a typed role is a known Demon on the script — auto-marks the Demon. */
export function isDemonRole(role: string, script: string | undefined): boolean {
  return roleType(role, script) === 'demon';
}
