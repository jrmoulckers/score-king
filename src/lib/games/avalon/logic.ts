import type { ID, Round } from '../../types';

/**
 * Pure Avalon (The Resistance: Avalon) tracker logic — no Svelte, no I/O — so it can be
 * exercised directly by `avalon.test.ts` and imported by both `index.ts` and the editor.
 *
 * ── Modeling a scoreless, hidden-role team game inside the point-oriented GameModule ──
 * A *round is a QUEST*. The quest phase runs until one side reaches three quests: Good by
 * three Successes, Evil by three Fails (min 3, max 5 quests). Because roles are secret
 * during play, quest rounds carry **no per-player points** — the live "scoreboard" is the
 * quest track (Good n – Evil n), derived from the round inputs here.
 *
 * The **clinching quest** (the one that takes a side to three) folds in the game's
 * *resolution*: if Good reaches three, the Assassin may name Merlin (stealing the win for
 * Evil); then the seat-holder records the **members of the winning side**. Only that round
 * scores — each winning-side player gets `1`, everyone else `0` — so `pickWinners` is simply
 * "everyone with a positive total". That stays unambiguous even for the assassination steal,
 * where Good won more quests yet Evil wins. Quest tallies and the finale are narrated in
 * `describeAvalon` rather than encoded as points.
 */

export type Side = 'good' | 'evil';
export type Outcome = 'success' | 'fail';
/** A quest either succeeds, fails on the mission, or is never run because the vote track maxed out ("the Hammer"). */
export type Resolution = Outcome | 'hammer';

/** The draft recorded for one quest (round). Resolution fields matter only on the clinching quest. */
export interface AvalonInput {
  /** Number of Fail cards revealed on this quest (0 = a clean success). */
  fails: number;
  /** How many players were sent on the quest. */
  teamSize: number;
  /** Resolution: when Good reaches three quests, did the Assassin find Merlin? Else `null`. */
  assassinFoundMerlin: boolean | null;
  /** Resolution: the members of the winning side (drives `pickWinners`). */
  winners: ID[];
  /**
   * Vote track — rejected team proposals *before* a team was approved this quest (0–5).
   * `HAMMER` (5) rejections is "the Hammer": Evil wins the game outright, no quest is run.
   * Optional + defensively defaulted so games saved before the vote track still load.
   */
  rejects?: number;
  /** Who led the approved team (or held the hammer). Optional flavour/tracking; `null` when unset. */
  leaderId?: ID | null;
  /** The approved quest team. When non-empty it drives the team size; optional to log. */
  team?: ID[];
}

/** Optional-role toggles (reference only — they never change the Good/Evil head counts). */
export interface RolesConfig {
  percival: boolean;
  morgana: boolean;
  mordred: boolean;
  oberon: boolean;
}

export interface Tally {
  successes: number;
  fails: number;
}

export interface RoleSetup {
  players: number;
  good: number;
  evil: number;
  /** Required team size per quest — index 0 = Quest 1 … index 4 = Quest 5. */
  questTeams: number[];
  /** Quests that need TWO Fail cards to fail (Quest 4 with 7+ players). */
  twoFailQuests: boolean[];
}

export interface RoleLine {
  side: Side;
  name: string;
  emoji: string;
  note?: string;
}

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;
export const MAX_QUESTS = 5;
/** Quests a side must win to end the quest phase. */
export const QUESTS_TO_WIN = 3;
/** Rejected team proposals in a single quest that hand the game to Evil ("the Hammer"). */
export const HAMMER = 5;

/** Evil (Minions of Mordred) head count by player count; the rest are Good. */
const EVIL_BY_COUNT: Record<number, number> = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };

/** Standard quest team sizes by player count (Quest 1 … Quest 5). */
const QUEST_TEAMS: Record<number, number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

export function clampPlayers(n: number): number {
  const v = Math.round(Number(n) || 0);
  return Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, v));
}

/** Role composition + quest table for a given player count (clamped to 5–10). */
export function roleSetup(playerCount: number): RoleSetup {
  const players = clampPlayers(playerCount);
  const evil = EVIL_BY_COUNT[players];
  const questTeams = QUEST_TEAMS[players].slice();
  // Only Quest 4 (index 3) needs two Fails, and only in games of 7+.
  const twoFailQuests = [false, false, false, players >= 7, false];
  return { players, good: players - evil, evil, questTeams, twoFailQuests };
}

/** The full role line-up for the reference sheet, honoring the optional-role toggles. */
export function roleList(playerCount: number, cfg: RolesConfig): RoleLine[] {
  const { good, evil } = roleSetup(playerCount);

  const goodRoles: RoleLine[] = [{ side: 'good', name: 'Merlin', emoji: '🧙', note: 'knows Evil' }];
  if (cfg.percival) {
    goodRoles.push({ side: 'good', name: 'Percival', emoji: '🔎', note: 'sees Merlin & Morgana' });
  }
  for (let i = goodRoles.length; i < good; i++) {
    goodRoles.push({ side: 'good', name: 'Loyal Servant of Arthur', emoji: '⚜️' });
  }

  const evilRoles: RoleLine[] = [
    { side: 'evil', name: 'Assassin', emoji: '🗡️', note: 'may name Merlin if Good wins' },
  ];
  if (cfg.morgana) evilRoles.push({ side: 'evil', name: 'Morgana', emoji: '🎭', note: 'appears as Merlin' });
  if (cfg.mordred) evilRoles.push({ side: 'evil', name: 'Mordred', emoji: '🕶️', note: 'hidden from Merlin' });
  if (cfg.oberon) evilRoles.push({ side: 'evil', name: 'Oberon', emoji: '👁️', note: 'unknown to fellow Evil' });
  for (let i = evilRoles.length; i < evil; i++) {
    evilRoles.push({ side: 'evil', name: 'Minion of Mordred', emoji: '😈' });
  }

  // Trim if optional roles ever exceed the head count (defensive; toggles don't add seats).
  return [...goodRoles.slice(0, good), ...evilRoles.slice(0, evil)];
}

/** A quest fails once enough Fail cards appear (two are needed on the 7+ player Quest 4). */
export function outcomeOf(input: Pick<AvalonInput, 'fails'>, twoFail: boolean): Outcome {
  const fails = Number(input.fails) || 0;
  return fails >= (twoFail ? 2 : 1) ? 'fail' : 'success';
}

/** Rejected proposals recorded on the vote track this quest, clamped to 0…`HAMMER`. */
export function rejectsOf(input: Pick<AvalonInput, 'rejects'>): number {
  const r = Math.round(Number(input.rejects) || 0);
  return Math.max(0, Math.min(HAMMER, r));
}

/** True when the vote track maxed out — five proposals rejected — and the Hammer fell. */
export function isHammer(input: Pick<AvalonInput, 'rejects'>): boolean {
  return rejectsOf(input) >= HAMMER;
}

/**
 * How a quest resolved: the Hammer (vote track maxed → no mission) takes precedence over the
 * Success/Fail cards, since the team never actually goes.
 */
export function resolutionOf(input: Pick<AvalonInput, 'fails' | 'rejects'>, twoFail: boolean): Resolution {
  return isHammer(input) ? 'hammer' : outcomeOf(input, twoFail);
}

/** The team that went on the quest: the tapped roster when logged, else the stepper's team size. */
export function effectiveTeamSize(input: Pick<AvalonInput, 'team' | 'teamSize'>): number {
  const team = input.team ?? [];
  return team.length > 0 ? team.length : Number(input.teamSize) || 0;
}

/**
 * Successes/fails recorded across the quests *before* `roundIndex` (the ones that count so far).
 * A Hammer quest counts as a fail here so the tally still reflects Evil's decided advantage —
 * though in practice the Hammer ends the game on its own quest, so no later quest is ever entered.
 */
export function tallyBefore(rounds: Round[], roundIndex: number, setup: RoleSetup): Tally {
  let successes = 0;
  let fails = 0;
  for (const r of rounds) {
    if (r.index >= roundIndex) continue;
    const inp = r.input as AvalonInput | undefined;
    if (!inp) continue;
    const twoFail = setup.twoFailQuests[r.index] ?? false;
    if (resolutionOf(inp, twoFail) === 'success') successes++;
    else fails++;
  }
  return { successes, fails };
}

/** Which side (if any) reaches three quests — or seizes the Hammer — once `resolution` is applied. */
export function clinch(before: Tally, resolution: Resolution): Side | null {
  if (resolution === 'hammer') return 'evil';
  if (resolution === 'success' && before.successes + 1 >= QUESTS_TO_WIN) return 'good';
  if (resolution === 'fail' && before.fails + 1 >= QUESTS_TO_WIN) return 'evil';
  return null;
}

/** The final winner: Evil steals a Good clinch iff the Assassin found Merlin. */
export function winningSide(clinchedBy: Side, assassinFoundMerlin: boolean | null): Side {
  if (clinchedBy === 'good') return assassinFoundMerlin ? 'evil' : 'good';
  return 'evil';
}

/** True when a side already reached three quests before this round (game over). */
export function decidedBefore(before: Tally): boolean {
  return before.successes >= QUESTS_TO_WIN || before.fails >= QUESTS_TO_WIN;
}

/** How many players sit on the given side (= how many winners to record). */
export function expectedWinnerCount(setup: RoleSetup, side: Side): number {
  return side === 'good' ? setup.good : setup.evil;
}

/** Validate one quest draft. Returns `null` when valid, else a human-readable message. */
export function validateAvalon(
  input: AvalonInput,
  rounds: Round[],
  roundIndex: number,
  playerIds: ID[],
): string | null {
  const n = playerIds.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    return `Avalon needs ${MIN_PLAYERS}–${MAX_PLAYERS} players (currently ${n}).`;
  }
  const setup = roleSetup(n);
  const before = tallyBefore(rounds, roundIndex, setup);
  if (decidedBefore(before)) {
    return 'This game is already decided — three quests have gone to one side.';
  }
  const questNo = roundIndex + 1;
  if (questNo > MAX_QUESTS) return `Avalon is at most ${MAX_QUESTS} quests.`;

  const seats = new Set(playerIds);
  const team = input.team ?? [];
  if (team.length) {
    for (const t of team) {
      if (!seats.has(t)) return 'The quest team includes someone who is not in this game.';
    }
    if (new Set(team).size !== team.length) return 'A player is listed twice on the quest team.';
    if (team.length < 2 || team.length > n) {
      return `Quest ${questNo}: the quest team must have between 2 and ${n} players.`;
    }
  }
  if (input.leaderId != null && !seats.has(input.leaderId)) {
    return 'The quest leader is not in this game.';
  }

  const twoFail = setup.twoFailQuests[roundIndex] ?? false;
  const hammer = isHammer(input);

  if (!hammer) {
    const teamSize = effectiveTeamSize(input);
    if (teamSize < 2 || teamSize > n) {
      return `Quest ${questNo}: team size must be between 2 and ${n}.`;
    }
    const fails = Number(input.fails) || 0;
    if (fails < 0 || fails > teamSize) {
      return `Quest ${questNo}: fails must be between 0 and the team size (${teamSize}).`;
    }
  }

  const clinchedBy = clinch(before, resolutionOf(input, twoFail));
  if (clinchedBy) {
    if (
      clinchedBy === 'good' &&
      (input.assassinFoundMerlin === null || input.assassinFoundMerlin === undefined)
    ) {
      return 'Good reached three quests — record the Assassin’s guess at Merlin.';
    }
    const side = winningSide(clinchedBy, input.assassinFoundMerlin);
    const winners = input.winners ?? [];
    for (const w of winners) {
      if (!seats.has(w)) return 'The winning team includes someone who is not in this game.';
    }
    if (new Set(winners).size !== winners.length) {
      return 'A player is listed twice on the winning team.';
    }
    const need = expectedWinnerCount(setup, side);
    if (winners.length !== need) {
      const label = side === 'good' ? 'Good' : 'Evil';
      return `Tap the ${need} ${label} player${need === 1 ? '' : 's'} on the winning team (${winners.length}/${need}).`;
    }
  }
  return null;
}

/** Per-player deltas: `0` for every quest until the clinching one, which marks the winners `1`. */
export function scoreAvalon(
  input: AvalonInput,
  rounds: Round[],
  roundIndex: number,
  playerIds: ID[],
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = 0;

  const setup = roleSetup(playerIds.length);
  const before = tallyBefore(rounds, roundIndex, setup);
  const twoFail = setup.twoFailQuests[roundIndex] ?? false;
  if (!clinch(before, resolutionOf(input, twoFail))) return out;

  const winners = new Set(input.winners ?? []);
  for (const id of playerIds) out[id] = winners.has(id) ? 1 : 0;
  return out;
}

/** The game is finished once a resolution has been recorded (someone has a positive total). */
export function isResolved(totals: Record<ID, number>): boolean {
  return Object.values(totals).some((v) => (Number(v) || 0) > 0);
}

/** Winners = everyone on the recorded winning side. */
export function pickAvalonWinners(totals: Record<ID, number>): ID[] {
  return Object.keys(totals).filter((id) => (Number(totals[id]) || 0) > 0);
}

/** One-line history summary for a quest, narrating the leader, vote track, and finale. */
export function describeAvalon(round: Round, playerCount: number): string {
  const inp = round.input as AvalonInput | undefined;
  const qn = round.index + 1;
  if (!inp) return `Quest ${qn}`;

  const setup = roleSetup(playerCount);
  const twoFail = setup.twoFailQuests[round.index] ?? false;
  const resolution = resolutionOf(inp, twoFail);
  const rejects = rejectsOf(inp);
  const fails = Number(inp.fails) || 0;

  let base: string;
  if (resolution === 'hammer') {
    base = `Quest ${qn} 🔨 the Hammer — ${HAMMER} proposals rejected`;
  } else if (resolution === 'success') {
    base = `Quest ${qn} ✓ succeeded`;
  } else {
    base = `Quest ${qn} ✗ failed · ${fails} fail${fails === 1 ? '' : 's'}`;
  }
  // The vote track is worth narrating even on a completed quest — a knife-edge win reads well.
  if (resolution !== 'hammer' && rejects > 0) {
    base += ` · ${rejects} rejected proposal${rejects === 1 ? '' : 's'}`;
  }

  const winners = inp.winners ?? [];
  if (winners.length) {
    const clinchedBy: Side = resolution === 'success' ? 'good' : 'evil';
    const side = winningSide(clinchedBy, inp.assassinFoundMerlin);
    let finale: string;
    if (side === 'good') finale = '🛡️ Good prevails';
    else if (resolution === 'hammer') finale = '🗡️ Evil seizes it — the Hammer falls';
    else if (clinchedBy === 'good') finale = '🗡️ Evil steals it — Assassin found Merlin';
    else finale = '🗡️ Evil triumphs';
    return `${base} · ${finale}`;
  }
  return base;
}

/**
 * Whimsical "who sees whom" hints for the night briefing, derived purely from the active
 * optional-role toggles. Pure + unit-testable; the editor just renders these lines.
 */
export function knowledgeHints(cfg: RolesConfig): string[] {
  const lines: string[] = [];
  lines.push(
    cfg.mordred
      ? '🧙 Merlin sees every Minion of Mordred — except Mordred himself.'
      : '🧙 Merlin sees every Minion of Mordred.',
  );
  if (cfg.percival) {
    lines.push(
      cfg.morgana
        ? '🔎 Percival sees Merlin & Morgana — but can’t tell which is the true seer.'
        : '🔎 Percival sees Merlin’s glow and can shield the wise one.',
    );
  }
  lines.push(
    cfg.oberon
      ? '😈 The Minions know each other in the dark — all but lone Oberon.'
      : '😈 The Minions of Mordred know one another in the dark.',
  );
  if (cfg.oberon) {
    lines.push('👁️ Oberon skulks alone — unknown to his fellow Evil, and blind to them.');
  }
  lines.push('🗡️ If Good completes three quests, the Assassin gets one shot to name Merlin.');
  return lines;
}
