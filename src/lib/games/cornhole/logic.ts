import type { ID } from '../../types';
import { PALETTE, uid } from '../../util';

/**
 * Pure Cornhole scoring — no Svelte, no I/O, fully unit-testable. `index.ts` and the
 * editor import from here so the exact math the game plays is the exact math the tests
 * exercise. Cornhole is a two-SIDE game: Side A vs Side B, cancellation to a target.
 * Each side is a *team* of one or two players (1v1 or 2v2) built with the team builder,
 * so the board always shows two scores racing to the target. The two teammates on a
 * side share the side's running total, so the generic per-player scoreboard reads the
 * race correctly (a side's members tie at that side's score).
 */

/** Bag in the hole ("drano" / "cornhole"). */
export const IN_HOLE_POINTS = 3;
/** Bag resting on the board ("woody"). */
export const ON_BOARD_POINTS = 1;
/** Bags each side throws per round (frame). */
export const BAGS_PER_SIDE = 4;
/** Where the bust variant sends an overshooting side. */
export const BUST_TO = 15;
/** The most one side can rack up in a single frame — a four-bagger (4 × 3). */
export const MAX_FRAME = BAGS_PER_SIDE * IN_HOLE_POINTS;

/** One side's bags for a single round. */
export interface SideThrow {
  /** Bags that went in the hole (×3). */
  inHole: number;
  /** Bags resting on the board (×1). */
  onBoard: number;
}

/**
 * A branded side: an identity (name / emoji / color) plus a roster of member (player)
 * ids. Cornhole has exactly two — Side A and Side B — each holding one or two players.
 * Mirrors the Volleyball team model so the two games feel like siblings.
 */
export interface CornholeTeam {
  id: string;
  name: string;
  emoji: string;
  color: string;
  memberIds: string[];
}

/**
 * A round's input. New (team-builder) shape carries the two sides as branded teams and
 * their bags keyed by TEAM id. The legacy `sides` field (bags keyed by PLAYER id, from
 * before the team builder) is kept read-only so old saved games still describe & stat
 * correctly and stay editable.
 */
export interface CornholeInput {
  /** The two sides for this round (Side A, Side B) as branded teams. */
  teams?: CornholeTeam[];
  /** Each side's bags this round, keyed by TEAM id. */
  throws?: Record<ID, SideThrow>;
  /** Legacy: each side's bags keyed by PLAYER id (pre-team-builder). Read-only compat. */
  sides?: Record<ID, SideThrow>;
}

/** Normalized, validated config the scorer actually runs on. */
export interface CornholeConfig {
  target: number;
  bust: boolean;
  winBy: number;
}

/** Full result of resolving one round — deltas plus the pieces the UI narrates. */
export interface RoundOutcome {
  /**
   * Per-PLAYER point deltas to apply this round. The scoring side's net is mirrored to
   * every member of that side (so teammates share the side total); everyone else is 0.
   */
  deltas: Record<ID, number>;
  /** Raw round points for side A (first team) before cancellation. */
  aRaw: number;
  /** Raw round points for side B (second team) before cancellation. */
  bRaw: number;
  /** The team id that scored this round, or null on a wash (tie). */
  gainerTeamId: ID | null;
  /** Net points the leading side won this round (after cancellation, before bust). */
  net: number;
  /** True when the bust rule pulled the scoring side back to {@link BUST_TO}. */
  busted: boolean;
}

/** Read raw, possibly-untrusted config into a clean {@link CornholeConfig}. */
export function readConfig(config: Record<string, unknown> = {}): CornholeConfig {
  const target = Math.max(1, Math.trunc(Number(config.target)) || 21);
  const winBy = Math.max(1, Math.trunc(Number(config.winBy)) || 1);
  return {
    target,
    bust: config.bust === true,
    winBy,
  };
}

/** A fresh, empty throw for one side. */
export function emptyThrow(): SideThrow {
  return { inHole: 0, onBoard: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Team model — two branded sides you build from the player pool, mirroring the
// Volleyball team builder. Cornhole always has exactly two sides; each holds one
// or two players (1v1 or 2v2). Pure and Svelte-free so the editor and tests agree.
// ─────────────────────────────────────────────────────────────────────────────

/** The most players allowed on one side (doubles). */
export const MAX_PER_SIDE = 2;

/** Whimsical default branding for the two sides, backyard bag-toss flavored. */
const SIDE_NAMES = ['Bag Slingers', 'Corn Stars'];
const SIDE_EMOJIS = ['🎒', '🌽'];

/** Build a fresh side with default branding for slot `i` (0 = Side A, 1 = Side B). */
export function makeTeam(i: number, memberIds: string[] = []): CornholeTeam {
  return {
    id: uid(),
    name: SIDE_NAMES[i % SIDE_NAMES.length] ?? `Side ${String.fromCharCode(65 + i)}`,
    emoji: SIDE_EMOJIS[i % SIDE_EMOJIS.length] ?? '🌽',
    color: PALETTE[i % PALETTE.length] ?? '#7c5cff',
    memberIds: [...memberIds],
  };
}

/** A deep-ish clone so a carried-forward roster edit never mutates a past round. */
export function cloneTeams(teams: CornholeTeam[]): CornholeTeam[] {
  return teams.map((t) => ({ ...t, memberIds: [...t.memberIds] }));
}

/**
 * Seed the two sides from a player pool: split it into two even-ish contiguous
 * halves (Side A gets the first half). 2 players → 1v1, 4 → 2v2, 3 → 2v1.
 */
export function defaultTeams(pool: string[]): CornholeTeam[] {
  const half = Math.ceil(pool.length / 2);
  return [makeTeam(0, pool.slice(0, half)), makeTeam(1, pool.slice(half))];
}

/** A clean throw with clamped, non-negative integer bag counts. */
function normThrow(t: SideThrow | undefined): SideThrow {
  return { inHole: bags(t?.inHole), onBoard: bags(t?.onBoard) };
}

/**
 * Resolve any round input (new team shape or legacy player-keyed `sides`) into the
 * canonical `{ teams, throws }` the scorer and editor run on. Legacy rounds become two
 * single-member sides seeded from the lineup, with their old bags carried across — so
 * pre-team-builder games stay describable, statable, and editable.
 */
export function normalizeInput(
  input: CornholeInput | undefined,
  players: { id: string; name?: string }[],
): { teams: CornholeTeam[]; throws: Record<ID, SideThrow> } {
  const src = input ?? {};

  if (src.teams && src.teams.length >= 1) {
    const teams = cloneTeams(src.teams);
    const throws: Record<ID, SideThrow> = {};
    for (const t of teams) throws[t.id] = normThrow(src.throws?.[t.id]);
    return { teams, throws };
  }

  // Legacy shape: `sides` keyed by player id, each player its own single-member side.
  // Name each synthesized side after its player so old games still read faithfully.
  const legacy = src.sides ?? {};
  const teams = players.map((p, i) => {
    const t = makeTeam(i, [p.id]);
    if (p.name) t.name = p.name;
    return t;
  });
  const throws: Record<ID, SideThrow> = {};
  teams.forEach((t) => {
    throws[t.id] = normThrow(legacy[t.memberIds[0] ?? '']);
  });
  return { teams, throws };
}

/** A side's current race total — mirrored across its members, so any member reads it. */
export function sideTotal(team: CornholeTeam | undefined, totals: Record<ID, number>): number {
  const m = team?.memberIds?.[0];
  return m ? Number(totals[m]) || 0 : 0;
}

/** Clamp a bag count to a sane non-negative integer. */
function bags(n: unknown): number {
  return Math.max(0, Math.trunc(Number(n) || 0));
}

/** Raw round points for one side: in-hole ×3 + on-board ×1. */
export function sideRaw(t: SideThrow | undefined): number {
  if (!t) return 0;
  return bags(t.inHole) * IN_HOLE_POINTS + bags(t.onBoard) * ON_BOARD_POINTS;
}

/** Cancellation: the higher side keeps the difference; equal is a wash. */
export function cancel(a: number, b: number): { gainer: 'a' | 'b' | null; net: number } {
  if (a > b) return { gainer: 'a', net: a - b };
  if (b > a) return { gainer: 'b', net: b - a };
  return { gainer: null, net: 0 };
}

/**
 * Apply the bust variant to a scoring side. Returns the delta to record (which can be
 * negative when a bust drags the side back to {@link BUST_TO}). Bust only bites when the
 * target is above 15 — otherwise "back to 15" wouldn't be a setback, so it's ignored.
 */
export function applyBust(
  oldTotal: number,
  net: number,
  cfg: Pick<CornholeConfig, 'target' | 'bust'>,
): { delta: number; busted: boolean } {
  const projected = oldTotal + net;
  if (cfg.bust && cfg.target > BUST_TO && projected > cfg.target) {
    return { delta: BUST_TO - oldTotal, busted: true };
  }
  return { delta: net, busted: false };
}

/**
 * Resolve a round for the two sides (in team order). `totals` are the cumulative
 * scores BEFORE this round, needed so the bust rule can reset the scoring side. The
 * scoring side's net is mirrored to every one of its members, so teammates share the
 * side total and the per-player scoreboard reads the two-side race correctly.
 */
export function scoreCornhole(
  teams: CornholeTeam[],
  throws: Record<ID, SideThrow>,
  totals: Record<ID, number>,
  cfg: CornholeConfig,
): RoundOutcome {
  const a = teams[0];
  const b = teams[1];
  const aRaw = sideRaw(throws[a?.id ?? '']);
  const bRaw = sideRaw(throws[b?.id ?? '']);
  const { gainer, net } = cancel(aRaw, bRaw);

  const deltas: Record<ID, number> = {};
  for (const t of teams) for (const m of t.memberIds) deltas[m] = 0;

  let gainerTeamId: ID | null = null;
  let busted = false;

  if (gainer) {
    const win = gainer === 'a' ? a : b;
    gainerTeamId = win?.id ?? null;
    const { delta, busted: bt } = applyBust(sideTotal(win, totals), net, cfg);
    for (const m of win?.memberIds ?? []) deltas[m] = delta;
    busted = bt;
  }

  return { deltas, aRaw, bRaw, gainerTeamId, net, busted };
}

/**
 * True once a side has won: it has reached the target AND leads by at least `winBy`.
 * With the default `winBy` of 1 this is simply "first side to the target". Operates on
 * the *distinct* side totals — teammates share a side's total, so 4 mirrored player
 * totals still resolve to a two-side race, and a level game (one distinct total) is
 * never a win.
 */
export function isWon(totals: Record<ID, number>, cfg: CornholeConfig): boolean {
  const vals = Object.values(totals).map((v) => Number(v) || 0);
  if (vals.length === 0) return false;
  const distinct = [...new Set(vals)].sort((x, y) => y - x);
  const top = distinct[0] ?? 0;
  // With a single distinct value the sides are level (lead 0) when more than one side
  // is present; a lone total (one side only) has no rival, so it stands unopposed.
  const second = distinct.length > 1 ? distinct[1]! : vals.length > 1 ? top : -Infinity;
  return top >= cfg.target && top - second >= cfg.winBy;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers — a tactile "bag slot" model + framing flavor. Still pure and
// Svelte-free, so the editor and the tests share the exact same logic. Nothing
// here changes how a frame scores; it only shapes how the four bags are entered
// and narrated.
// ─────────────────────────────────────────────────────────────────────────────

/** Where a single tossed bag landed. */
export type BagState = 'ground' | 'board' | 'hole';

/** Point value of one bag by where it landed. */
export function bagValue(s: BagState): number {
  if (s === 'hole') return IN_HOLE_POINTS;
  if (s === 'board') return ON_BOARD_POINTS;
  return 0;
}

/**
 * Expand a side's `{inHole, onBoard}` counts into an ordered row of four bag
 * slots — holes first, then boards, then the ground. Deterministic so the same
 * throw always paints the same row. Counts beyond four are clamped away (the
 * editor never lets that happen, but stray data won't crash the row).
 */
export function slotsFromThrow(t: SideThrow | undefined, count = BAGS_PER_SIDE): BagState[] {
  const inHole = bags(t?.inHole);
  const onBoard = bags(t?.onBoard);
  const slots: BagState[] = [];
  for (let i = 0; i < count; i++) {
    if (i < inHole) slots.push('hole');
    else if (i < inHole + onBoard) slots.push('board');
    else slots.push('ground');
  }
  return slots;
}

/** Fold a row of bag slots back into the `{inHole, onBoard}` counts the scorer reads. */
export function throwFromSlots(slots: BagState[]): SideThrow {
  let inHole = 0;
  let onBoard = 0;
  for (const s of slots) {
    if (s === 'hole') inHole++;
    else if (s === 'board') onBoard++;
  }
  return { inHole, onBoard };
}

/** Tapping a bag climbs it in value and wraps: ground → board → hole → ground. */
export function cycleBag(s: BagState): BagState {
  if (s === 'ground') return 'board';
  if (s === 'board') return 'hole';
  return 'ground';
}

/** True when a side sank all four bags in the hole — a four-bagger (worth {@link MAX_FRAME}). */
export function isFourBagger(t: SideThrow | undefined): boolean {
  return bags(t?.inHole) >= BAGS_PER_SIDE;
}

/**
 * True when a side is close enough to the target that a big frame could overshoot
 * and trip the bust rule back to {@link BUST_TO}. Only meaningful with bust on and a
 * target above 15; drives the anticipatory "danger zone" on the race lane.
 */
export function bustRisk(total: number, cfg: Pick<CornholeConfig, 'target' | 'bust'>): boolean {
  const t = Number(total) || 0;
  return cfg.bust && cfg.target > BUST_TO && t < cfg.target && t + MAX_FRAME > cfg.target;
}

/** A narrated frame result — an emoji, a line of backyard patter, and a tone. */
export interface FrameFlavor {
  emoji: string;
  text: string;
  tone: 'good' | 'muted' | 'bad';
}

/** Deterministically pick one line from a list, rotated by `seed` (the round index). */
function pick(list: string[], seed: number): string {
  if (list.length === 0) return '';
  const i = ((Math.trunc(seed) % list.length) + list.length) % list.length;
  return list[i]!;
}

/**
 * Turn a resolved frame into a playful, glanceable status line. Pure and
 * deterministic (rotates variety off the round index), so the editor and tests
 * agree on exactly what a frame says. The emoji + text always carry the meaning,
 * so nothing here relies on color.
 */
export function tossFlavor(args: {
  gainerName: string | null;
  net: number;
  aRaw: number;
  bRaw: number;
  busted: boolean;
  fourBaggerName: string | null;
  bothFourBaggers: boolean;
  seed: number;
}): FrameFlavor {
  const { gainerName, net, aRaw, bRaw, busted, fourBaggerName, bothFourBaggers, seed } = args;

  if (busted && gainerName) {
    return { emoji: '💥', text: `${gainerName} overcooked it — bust back to ${BUST_TO}!`, tone: 'bad' };
  }
  if (bothFourBaggers) {
    return { emoji: '🧺', text: 'Four-bagger each — the whole thing washes!', tone: 'muted' };
  }
  if (fourBaggerName && gainerName === fourBaggerName) {
    return { emoji: '💣', text: `Four-bagger! ${fourBaggerName} sinks all four — +${net}`, tone: 'good' };
  }
  if (!gainerName) {
    if (aRaw === 0 && bRaw === 0) {
      return { emoji: '🌽', text: pick(['Nothing lands — corn in the dirt', 'Both sides whiff — no bags home'], seed), tone: 'muted' };
    }
    return {
      emoji: '🧺',
      text: pick(['Wash — bags cancel, nobody scores', 'All square — total wash', 'Even bags — it all cancels out'], seed),
      tone: 'muted',
    };
  }

  // A normal scoring frame — flavor scales a little with how big the swing was.
  const line = net >= 6
    ? pick([`${gainerName} buries it — +${net}`, `Huge frame! ${gainerName} +${net}`, `${gainerName} runs the board — +${net}`], seed)
    : net >= 3
      ? pick([`Drano! ${gainerName} +${net}`, `${gainerName} sinks one — +${net}`, `${gainerName} takes the frame — +${net}`], seed)
      : pick([`That's a woody — ${gainerName} +${net}`, `${gainerName} edges it — +${net}`, `${gainerName} nudges ahead — +${net}`], seed);
  return { emoji: '🌽', text: line, tone: 'good' };
}
