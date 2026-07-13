/**
 * Pure volleyball logic — no Svelte. A volleyball game here is an *open, team-based
 * session*: you build any number of branded teams from a shared pool of players,
 * and each round is a single set between two chosen teams. Rosters and branding can
 * be reshuffled freely, set to set. A team's standing is simply the sets it has won.
 *
 * Set scoring is classic rally scoring: a point on every serve, first to the target
 * (25 by default, 21 for beach) and win by two — so a tight set climbs past the
 * target (26–24, 30–28…) until a side leads by two, with an optional hard cap.
 *
 * Everything a set needs to be scored lives in the round `input` (the teams, which
 * two contested the set, and the score), so `*.test.ts` can exercise the real rules
 * without touching the editor, and the whole team model needs no app-level schema.
 */

import { PALETTE, uid } from '../../util';

/** The two contestants of a single set: `a` = home, `b` = away. */
export type Side = 'a' | 'b';

/** A branded team: an identity plus a roster of member (player) ids. */
export interface Team {
  id: string;
  name: string;
  emoji: string;
  color: string;
  memberIds: string[];
}

/** One recorded (or drafted) set. */
export interface VolleyballInput {
  /** Snapshot of the teams as they stood for this set (branding + rosters). */
  teams: Team[];
  /** Team id playing as home this set. */
  home: string;
  /** Team id playing as away this set. */
  away: string;
  /** Final points for the two contesting sides. */
  points: { home: number; away: number };
  /**
   * Ordered log of which side (`'a'` = home, `'b'` = away) won each rally, oldest first.
   * Optional and purely additive: `points` stays the scoring/validation/stats source of
   * truth, while this log powers the courtside live extras — a single satisfying
   * "undo last point", the serve indicator, and the momentum/run read. New sets seed an
   * empty log; sets recorded before it existed simply have no log and fall back to the
   * ± controls on `points`.
   */
  rallies?: Side[];
}

export type Format = 'beach' | 'fours' | 'indoor' | 'custom';

/** Per-format guidance: the roster size and the set target players expect. */
export const FORMAT_PRESETS: Record<Format, { label: string; teamSize: number; pointsPerSet: number }> = {
  beach: { label: 'Beach (2s)', teamSize: 2, pointsPerSet: 21 },
  fours: { label: 'Fours (4s)', teamSize: 4, pointsPerSet: 25 },
  indoor: { label: 'Indoor (6s)', teamSize: 6, pointsPerSet: 25 },
  custom: { label: 'Custom', teamSize: 0, pointsPerSet: 25 },
};

export interface VolleyConfig {
  format: Format;
  /** Players per team (0 = no limit, for Custom). Informs roster building + warnings. */
  teamSize: number;
  /** How many teams to seed a fresh session with. */
  numberOfTeams: number;
  /** Points to win a set (rally scoring). */
  pointsPerSet: number;
  /** Must a set be won by a two-point margin? */
  winBy2: boolean;
  /** Score at which win-by-two stops (first to the cap takes the set). 0 = no cap. */
  hardCap: number;
}

export const DEFAULTS: VolleyConfig = {
  format: 'indoor',
  teamSize: 6,
  numberOfTeams: 2,
  pointsPerSet: 25,
  winBy2: true,
  hardCap: 0,
};

/** Coerce a stored config record into a safe, fully-populated {@link VolleyConfig}. */
export function readConfig(config: Record<string, unknown> | undefined): VolleyConfig {
  const cfg = config ?? {};
  const posInt = (v: unknown, fallback: number): number => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const format: Format = (['beach', 'fours', 'indoor', 'custom'] as const).includes(cfg.format as Format)
    ? (cfg.format as Format)
    : DEFAULTS.format;
  const preset = FORMAT_PRESETS[format];
  const teamSize = format === 'custom' ? Math.max(0, Math.floor(Number(cfg.teamSize)) || 0) : preset.teamSize;

  const capRaw = Math.floor(Number(cfg.hardCap));
  const hardCap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 0;

  return {
    format,
    teamSize,
    numberOfTeams: Math.min(8, Math.max(2, posInt(cfg.numberOfTeams, DEFAULTS.numberOfTeams))),
    pointsPerSet: posInt(cfg.pointsPerSet, preset.pointsPerSet),
    winBy2: cfg.winBy2 !== false,
    hardCap,
  };
}

/** A cap only bites when it sits above the target; otherwise there's nothing to cap. */
function effectiveCap(target: number, hardCap: number): number {
  return hardCap > target ? hardCap : 0;
}

/**
 * Who has won this set, or `null` while it's still live (or a tie, which can't be
 * a final score). Encodes rally scoring: reach the target and lead by two — unless
 * a hard cap is set, where the first side to the cap takes it by a single point.
 */
export function setWinner(a: number, b: number, target: number, winBy2: boolean, hardCap = 0): Side | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < 0 || b < 0) return null;
  if (a === b) return null; // level: nobody has won

  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < target) return null; // target not reached yet

  const lead = hi - lo;
  const cap = effectiveCap(target, hardCap);
  const capReached = cap > 0 && hi >= cap;
  const won = capReached ? lead >= 1 : winBy2 ? lead >= 2 : lead >= 1;
  if (!won) return null;

  return a > b ? 'a' : 'b';
}

/**
 * Validate a *final* set score. Returns an error string, or `null` when the score
 * is a legal end-of-set: someone has won, and the set stopped at the earliest
 * winning point (you can't overshoot, since a set ends the instant it's decided).
 */
export function validateSetScore(a: number, b: number, target: number, winBy2: boolean, hardCap = 0): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return 'Enter whole point totals for each side.';
  }
  if (a < 0 || b < 0) return 'Points can’t be negative.';

  const winner = setWinner(a, b, target, winBy2, hardCap);
  if (!winner) {
    const tail = winBy2 ? ', win by two' : '';
    return `That set isn’t over — first to ${target}${tail}.`;
  }

  // Undo the winner's final point: the set must have still been live a rally ago.
  const prevA = winner === 'a' ? a - 1 : a;
  const prevB = winner === 'b' ? b - 1 : b;
  if (setWinner(prevA, prevB, target, winBy2, hardCap)) {
    return 'That final score isn’t reachable — a set ends the moment it’s won.';
  }
  return null;
}

const TEAM_NAMES = ['Sharks', 'Eagles', 'Dragons', 'Wolves', 'Lions', 'Tigers', 'Scorpions', 'Vipers'];
const TEAM_EMOJIS = ['🦈', '🦅', '🐉', '🐺', '🦁', '🐯', '🦂', '🐍'];

/** Build a fresh team with whimsical default branding for slot `i`. */
export function makeTeam(i: number, memberIds: string[] = []): Team {
  return {
    id: uid(),
    name: TEAM_NAMES[i % TEAM_NAMES.length] ?? `Team ${i + 1}`,
    emoji: TEAM_EMOJIS[i % TEAM_EMOJIS.length] ?? '🏐',
    color: PALETTE[i % PALETTE.length],
    memberIds: [...memberIds],
  };
}

/** A deep-ish clone so a carried-forward roster edit never mutates a past set. */
export function cloneTeams(teams: Team[]): Team[] {
  return teams.map((t) => ({ ...t, memberIds: [...t.memberIds] }));
}

/**
 * Seed a session's teams: split the pool across `numberOfTeams`, round-robin, up to
 * the format's roster size (Custom = no limit). Any overflow stays unassigned.
 */
export function defaultTeams(cfg: VolleyConfig, pool: string[]): Team[] {
  const n = Math.max(2, cfg.numberOfTeams);
  const teams = Array.from({ length: n }, (_, i) => makeTeam(i));
  const cap = cfg.teamSize > 0 ? cfg.teamSize : Infinity;
  let start = 0;
  for (const id of pool) {
    let placed = false;
    for (let k = 0; k < n; k++) {
      const t = teams[(start + k) % n];
      if (t.memberIds.length < cap) {
        t.memberIds.push(id);
        start = (start + k + 1) % n;
        placed = true;
        break;
      }
    }
    if (!placed) break; // every team full — the rest sit in the unassigned pool
  }
  return teams;
}

/** Pool member ids not currently on any team. */
export function unassigned(teams: Team[], pool: string[]): string[] {
  const taken = new Set(teams.flatMap((t) => t.memberIds));
  return pool.filter((id) => !taken.has(id));
}

export interface TeamStanding {
  team: Team;
  setsWon: number;
  setsPlayed: number;
  pointsFor: number;
}

/**
 * Fold recorded sets into per-team standings. Wins are aggregated by team *id* (so
 * branding can be renamed mid-session without losing history), using the current
 * `teams` list for identity/display. Sets whose team is no longer present are skipped.
 */
export function foldStandings(teams: Team[], sets: VolleyballInput[], cfg: VolleyConfig): TeamStanding[] {
  const byId = new Map<string, TeamStanding>(
    teams.map((t) => [t.id, { team: t, setsWon: 0, setsPlayed: 0, pointsFor: 0 }]),
  );
  for (const s of sets) {
    const w = setWinner(s.points.home, s.points.away, cfg.pointsPerSet, cfg.winBy2, cfg.hardCap);
    if (!w) continue;
    const h = byId.get(s.home);
    const a = byId.get(s.away);
    if (h) {
      h.setsPlayed += 1;
      h.pointsFor += Number(s.points.home) || 0;
      if (w === 'a') h.setsWon += 1;
    }
    if (a) {
      a.setsPlayed += 1;
      a.pointsFor += Number(s.points.away) || 0;
      if (w === 'b') a.setsWon += 1;
    }
  }
  return [...byId.values()].sort((x, y) => y.setsWon - x.setsWon || y.pointsFor - x.pointsFor);
}

/** The winning team's id for a set, or null while it's still live. */
export function winningTeamId(input: VolleyballInput, cfg: VolleyConfig): string | null {
  const w = setWinner(input.points.home, input.points.away, cfg.pointsPerSet, cfg.winBy2, cfg.hardCap);
  if (!w) return null;
  return w === 'a' ? input.home : input.away;
}

// ── Live rally scoring ───────────────────────────────────────────────────────
// A small, pure toolkit powering the courtside feel. The rally log is the ordered
// list of who won each rally; `points` is always derivable from it, so the log is a
// superset the editor can seed while `points` stays the durable scoring truth.

/** Rally log → the two sides' point totals (home = 'a', away = 'b'). */
export function scoreFromRallies(rallies: Side[]): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const s of rallies) s === 'a' ? (home += 1) : (away += 1);
  return { home, away };
}

/** Append a rally winner, returning a new log (never mutates the input). */
export function pushRally(rallies: Side[], side: Side): Side[] {
  return [...rallies, side];
}

/** Drop the most recent rally, returning a new log. No-op on an empty log. */
export function popRally(rallies: Side[]): Side[] {
  return rallies.slice(0, -1);
}

/**
 * Remove the most recent rally won by `side`, returning a new log (never mutates). Used by
 * the per-side "take a point back" control so the log stays consistent with `points`. No-op
 * when that side has no rally to drop.
 */
export function dropRally(rallies: Side[], side: Side): Side[] {
  for (let i = rallies.length - 1; i >= 0; i--) {
    if (rallies[i] === side) return [...rallies.slice(0, i), ...rallies.slice(i + 1)];
  }
  return rallies;
}

/**
 * The current unbroken run — how many rallies in a row the same side just won. Returns
 * the side on the streak and its length (0 with a null side when there are no rallies yet).
 */
export function currentRun(rallies: Side[]): { side: Side | null; length: number } {
  if (rallies.length === 0) return { side: null, length: 0 };
  const side = rallies[rallies.length - 1]!;
  let length = 0;
  for (let i = rallies.length - 1; i >= 0 && rallies[i] === side; i--) length += 1;
  return { side, length };
}

/**
 * Who serves the next rally: in rally scoring the side that won the last rally serves,
 * so this is simply the most recent rally winner. Null before the first rally.
 */
export function serving(rallies: Side[]): Side | null {
  return rallies.length ? rallies[rallies.length - 1]! : null;
}

/**
 * Which side is at *set point* — one rally from taking the set — or null. A side is at set
 * point when winning the next rally would end the set and it hasn't ended already. Honours
 * win-by-two and the hard cap via {@link setWinner}.
 */
export function setPointSide(a: number, b: number, target: number, winBy2: boolean, hardCap = 0): Side | null {
  if (setWinner(a, b, target, winBy2, hardCap) !== null) return null;
  if (setWinner(a + 1, b, target, winBy2, hardCap) === 'a') return 'a';
  if (setWinner(a, b + 1, target, winBy2, hardCap) === 'b') return 'b';
  return null;
}

/**
 * Deuce — the win-by-two tension where the score is *level at or past* one short of the
 * target (24–24, 25–25 for indoor) and the set isn't decided, so no single rally can end
 * it. Distinct from set point (an advantage lead one rally from winning). Always false
 * without win-by-two. A hard cap dissolves the deuce the instant it's in reach, since then
 * a single rally to the cap can win.
 */
export function isDeuceSet(a: number, b: number, target: number, winBy2: boolean, hardCap = 0): boolean {
  if (!winBy2) return false;
  if (setWinner(a, b, target, winBy2, hardCap) !== null) return false;
  if (setPointSide(a, b, target, winBy2, hardCap) !== null) return false;
  return a === b && a >= target - 1;
}

/**
 * Whimsically redistribute the whole player pool across the current teams, keeping each
 * team's branding but reshuffling its roster. Deals players round-robin into a random team
 * order, honouring the format's roster cap (Custom = no limit); any overflow lands on the
 * bench. Pure: takes an injectable `rng` (default `Math.random`) so tests are deterministic.
 */
export function shuffleTeams(teams: Team[], pool: string[], cfg: VolleyConfig, rng: () => number = Math.random): Team[] {
  const next = teams.map((t) => ({ ...t, memberIds: [] as string[] }));
  if (next.length === 0) return next;

  // Fisher–Yates shuffle of the pool so the deal itself is random.
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }

  const cap = cfg.teamSize > 0 ? cfg.teamSize : Infinity;
  const n = next.length;
  let start = Math.floor(rng() * n); // random starting team so team 0 isn't always favoured
  for (const id of order) {
    let placed = false;
    for (let k = 0; k < n; k++) {
      const t = next[(start + k) % n]!;
      if (t.memberIds.length < cap) {
        t.memberIds.push(id);
        start = (start + k + 1) % n;
        placed = true;
        break;
      }
    }
    if (!placed) break; // every team full — the rest sit on the bench
  }
  return next;
}
