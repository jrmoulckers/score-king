/**
 * Pure volleyball set/match logic — no Svelte, no app imports. Everything the
 * module needs to score a rally-scored match lives here so `*.test.ts` can
 * exercise the real rules (win-by-2, deuce, the deciding set, best-of formats,
 * an optional hard cap) without pulling in the editor.
 *
 * A volleyball match is a race to win sets. Each set is rally-scored (a point on
 * every serve) to a target — 25 for a normal set, 15 for the deciding set — and
 * you must win by two, so a tight set climbs past the target (26–24, 30–28…)
 * until someone leads by two. The match is best-of-5 (first to 3 sets) or
 * best-of-3 (first to 2). We model each *set* as a round: the round records both
 * sides' final points, and the module banks one "set won" to the winner, so a
 * side's running total is simply the sets it has taken.
 */

export type Side = 'a' | 'b';

export interface VolleyConfig {
  /** Points to win a normal set (rally scoring). */
  pointsPerSet: number;
  /** Points to win the deciding set (the tiebreak set is shorter). */
  decidingSetPoints: number;
  /** Must a set be won by a two-point margin? */
  winBy2: boolean;
  /** Sets needed to win the match — 3 = best of 5, 2 = best of 3. */
  setsToWin: number;
  /** Score at which win-by-two stops (first to the cap takes the set). 0 = no cap. */
  hardCap: number;
}

export const DEFAULTS: VolleyConfig = {
  pointsPerSet: 25,
  decidingSetPoints: 15,
  winBy2: true,
  setsToWin: 3,
  hardCap: 0,
};

/** Coerce a stored config record into a safe, fully-populated {@link VolleyConfig}. */
export function readConfig(config: Record<string, unknown> | undefined): VolleyConfig {
  const cfg = config ?? {};
  const posInt = (v: unknown, fallback: number): number => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  // `format` is the friendly control; `setsToWin` is honoured as a direct escape hatch.
  let setsToWin: number;
  if (cfg.format === 'bo3') setsToWin = 2;
  else if (cfg.format === 'bo5') setsToWin = 3;
  else setsToWin = posInt(cfg.setsToWin, DEFAULTS.setsToWin);

  const capRaw = Math.floor(Number(cfg.hardCap));
  const hardCap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 0;

  return {
    pointsPerSet: posInt(cfg.pointsPerSet, DEFAULTS.pointsPerSet),
    decidingSetPoints: posInt(cfg.decidingSetPoints, DEFAULTS.decidingSetPoints),
    winBy2: cfg.winBy2 !== false,
    setsToWin,
    hardCap,
  };
}

/** Total sets that can possibly be played in the match (e.g. best-of-5 → 5). */
export function maxSets(cfg: VolleyConfig): number {
  return cfg.setsToWin * 2 - 1;
}

/**
 * Is the upcoming set the deciding set? That's the moment the match is level with
 * each side one win short — 2–2 in a best-of-5, 1–1 in a best-of-3 — so the final
 * set is played to the (shorter) deciding target.
 */
export function isDecidingSet(setsA: number, setsB: number, setsToWin: number): boolean {
  return setsA === setsToWin - 1 && setsB === setsToWin - 1;
}

/** Target points for the set about to be played, given the sets won so far. */
export function targetForSet(cfg: VolleyConfig, setsA: number, setsB: number): number {
  return isDecidingSet(setsA, setsB, cfg.setsToWin) ? cfg.decidingSetPoints : cfg.pointsPerSet;
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
export function setWinner(
  a: number,
  b: number,
  target: number,
  winBy2: boolean,
  hardCap = 0,
): Side | null {
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
export function validateSetScore(
  a: number,
  b: number,
  target: number,
  winBy2: boolean,
  hardCap = 0,
): string | null {
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

export interface SetScore {
  a: number;
  b: number;
}

export interface MatchState {
  /** Sets won by each side (only completed, legal sets are counted). */
  setsA: number;
  setsB: number;
  /** Has a side reached `setsToWin`? */
  decided: boolean;
  /** Match winner once decided. */
  winner: Side | null;
  /** Target points for the *next* set to be played. */
  nextTarget: number;
  /** Is that next set the deciding set? */
  nextDeciding: boolean;
}

/**
 * Fold a sequence of set scores into the match standing. Sets are counted in
 * order (so the deciding-set target is applied at the right moment) and counting
 * stops once the match is won — trailing sets can't happen in a real match.
 */
export function matchState(sets: SetScore[], cfg: VolleyConfig): MatchState {
  let setsA = 0;
  let setsB = 0;
  for (const set of sets) {
    if (setsA >= cfg.setsToWin || setsB >= cfg.setsToWin) break;
    const target = targetForSet(cfg, setsA, setsB);
    const winner = setWinner(set.a, set.b, target, cfg.winBy2, cfg.hardCap);
    if (winner === 'a') setsA += 1;
    else if (winner === 'b') setsB += 1;
  }
  const decided = setsA >= cfg.setsToWin || setsB >= cfg.setsToWin;
  return {
    setsA,
    setsB,
    decided,
    winner: decided ? (setsA > setsB ? 'a' : 'b') : null,
    nextDeciding: isDecidingSet(setsA, setsB, cfg.setsToWin),
    nextTarget: targetForSet(cfg, setsA, setsB),
  };
}
