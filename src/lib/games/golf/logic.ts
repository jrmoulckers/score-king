import type { ID, RoundContext } from '../../types';

/**
 * Pure Golf scoring + validation — no Svelte imports, so `golf.test.ts` can
 * exercise the real rules and the editor/stats can share one source of truth.
 *
 * Golf (a.k.a. Six-card Golf / Polka): each hole every player lays out a grid of
 * cards and tries to MINIMISE its value. Card values (the common ruleset):
 *   Ace = 1 · 2–10 = face value · J/Q = 10 · King = 0 (configurable).
 * Two equal cards in the same column cancel to 0, so a tidy grid can reach 0 (or
 * go negative with King = −2 or −2 Jokers). Lowest total after the last hole wins.
 *
 * The table does the grid math and calls out a hole score; this module records
 * that number per player, keeps the ruleset as reference, and bounds obvious typos.
 */

export type GridSize = '4' | '6' | '9';

export interface GolfConfig {
  /** Number of holes (rounds) in the game. */
  holes: number;
  /** Grid size / ruleset variant. */
  grid: GridSize;
  /** Points a King is worth (0 in the common ruleset; −2 in a popular variant). */
  kingValue: number;
  /** Whether Jokers are in play, each worth −2. */
  jokers: boolean;
}

/** One hole's raw entry: each player's called-out grid total. */
export interface GolfInput {
  scores: Record<ID, number>;
  /**
   * Optional, additive: the actual cards each player tapped into the "grid helper",
   * in row-major order (null = an empty cell). Persisted so re-opening a hole to edit
   * restores the laid-out grid. `scores` stays the single source of truth for scoring,
   * validation, and stats — a hand-typed hole never needs a grid.
   */
  grids?: Record<ID, (CardCode | null)[]>;
}

/**
 * Every card a Golf grid can hold. `JK` (Joker) only appears when the ruleset
 * enables it. Equality is by code, so two Kings — or two Jokers — in the same
 * column cancel just like two 7s do.
 */
export type CardCode = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JK';

/** The base deck order shown in the card picker (Jokers appended per-ruleset). */
export const BASE_CARD_CODES: CardCode[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** The card codes a player can pick for this ruleset (adds the Joker when enabled). */
export function cardCodes(cfg: GolfConfig): CardCode[] {
  return cfg.jokers ? [...BASE_CARD_CODES, 'JK'] : BASE_CARD_CODES;
}

/** Points a single card contributes before column cancels (null = empty = 0). */
export function cardValue(code: CardCode | null, cfg: GolfConfig): number {
  switch (code) {
    case null:
    case undefined:
      return 0;
    case 'A':
      return 1;
    case 'J':
    case 'Q':
      return 10;
    case 'K':
      return cfg.kingValue;
    case 'JK':
      return -2;
    default: {
      const n = Number(code);
      return Number.isFinite(n) ? n : 0;
    }
  }
}

/** A short, friendly face for a card code (for the picker + laid-out cells). */
export function cardLabel(code: CardCode | null): string {
  if (!code) return '';
  if (code === 'JK') return '🃏';
  return code;
}

/** Column/row layout of the laid-out grid for a ruleset. */
export interface GridShape {
  cols: number;
  rows: number;
}

/** Map a grid size to its physical layout: 6→3×2, 4→2×2, 9→3×3. */
export function gridShape(grid: string): GridShape {
  switch (grid) {
    case '4':
      return { cols: 2, rows: 2 };
    case '9':
      return { cols: 3, rows: 3 };
    default:
      return { cols: 3, rows: 2 };
  }
}

/**
 * Score a laid-out grid, applying the heart of Golf: within each column, any set
 * of two-or-more matching cards cancels to 0 (a pair, or a full column of a kind).
 * Cards outside a matched set keep their value. Returns the hole total *and* a
 * per-cell `canceled` mask so the editor can strike the cards that zeroed out —
 * a single source of truth for the math and its visual explanation.
 */
export function computeGrid(cells: (CardCode | null)[], cfg: GolfConfig): { total: number; canceled: boolean[] } {
  const { cols, rows } = gridShape(cfg.grid);
  const size = cols * rows;
  const canceled = new Array(size).fill(false);
  for (let c = 0; c < cols; c++) {
    // Group this column's filled cells by card code; any code with 2+ members cancels.
    const byCode = new Map<CardCode, number[]>();
    for (let r = 0; r < rows; r++) {
      const idx = r * cols + c;
      const code = cells[idx];
      if (!code) continue;
      const list = byCode.get(code) ?? [];
      list.push(idx);
      byCode.set(code, list);
    }
    for (const idxs of byCode.values()) {
      if (idxs.length >= 2) for (const i of idxs) canceled[i] = true;
    }
  }
  let total = 0;
  for (let i = 0; i < size; i++) {
    if (canceled[i]) continue;
    total += cardValue(cells[i] ?? null, cfg);
  }
  return { total, canceled };
}

/** Just the hole total for a laid-out grid (see {@link computeGrid}). */
export function gridScore(cells: (CardCode | null)[], cfg: GolfConfig): number {
  return computeGrid(cells, cfg).total;
}

/** True once at least one cell is filled — used to decide whether the grid drives the score. */
export function gridHasCards(cells: (CardCode | null)[] | undefined): boolean {
  return !!cells && cells.some((c) => c != null);
}

/** A caddie's read on a hole score. */
export type HoleVerdictKind = 'eagle' | 'birdie' | 'clean' | 'ok' | 'rough';
export interface HoleVerdict {
  kind: HoleVerdictKind;
  emoji: string;
  label: string;
}

/**
 * The caddie's read on a called hole, scaled to the ruleset. Par is a cleanly
 * cancelled grid (0); dipping into the red is a birdie, and a deep red hole (only
 * reachable with −2 kings / jokers) earns an eagle. A blown-up, near-max hole
 * lands "in the rough". Every verdict pairs an emoji with words, so the meaning is
 * never carried by colour alone.
 */
export function holeVerdict(score: number, cfg: GolfConfig): HoleVerdict {
  if (score === 0) return { kind: 'clean', emoji: '⛳', label: 'clean sheet' };
  if (score < 0) {
    const floor = holeFloor(cfg);
    const eagle = floor < 0 && score <= Math.round(floor / 2);
    return eagle
      ? { kind: 'eagle', emoji: '🦅', label: 'eagle' }
      : { kind: 'birdie', emoji: '🐦', label: 'birdie' };
  }
  if (score >= Math.round(holeCeiling(cfg) * 0.6)) {
    return { kind: 'rough', emoji: '🌳', label: 'in the rough' };
  }
  return { kind: 'ok', emoji: '', label: '' };
}

export const DEFAULT_HOLES = 9;
/** Highest a single card can score (J/Q/10 = 10); padded for house rules. */
export const MAX_CARD = 12;

/** Cards in the grid for a given ruleset. */
export function gridCount(grid: string): number {
  switch (grid) {
    case '4':
      return 4;
    case '9':
      return 9;
    default:
      return 6;
  }
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Normalise a stored config bag into a fully-resolved, typed GolfConfig. */
export function readConfig(config: Record<string, unknown>): GolfConfig {
  const holes = clampInt(Number(config.holes), 1, 18, DEFAULT_HOLES);
  const gridRaw = String(config.grid);
  const grid: GridSize = gridRaw === '4' || gridRaw === '9' ? gridRaw : '6';
  const kingRaw = Number(config.kingValue);
  const kingValue = Number.isFinite(kingRaw) ? Math.trunc(kingRaw) : 0;
  return { holes, grid, kingValue, jokers: !!config.jokers };
}

/**
 * Most-negative value a single card can contribute. Pairs only cancel *to 0*, so
 * the floor is driven entirely by negative Kings / Jokers when those are enabled.
 */
export function minCardValue(cfg: GolfConfig): number {
  let m = 0;
  if (cfg.kingValue < 0) m = Math.min(m, cfg.kingValue);
  if (cfg.jokers) m = Math.min(m, -2);
  return m;
}

/** Lowest hole score that is possible under the ruleset (a whole grid of the min card). */
export function holeFloor(cfg: GolfConfig): number {
  return gridCount(cfg.grid) * minCardValue(cfg);
}

/** Generous upper bound on a hole score, used only to catch fat-fingered entries. */
export function holeCeiling(cfg: GolfConfig): number {
  return gridCount(cfg.grid) * MAX_CARD;
}

/** Fresh, all-zero entry for the next hole. */
export function createGolfInput(players: { id: ID }[]): GolfInput {
  return { scores: Object.fromEntries(players.map((p) => [p.id, 0])) };
}

/** null when the hole is enterable, otherwise a friendly, table-side message. */
export function validateGolf(input: GolfInput, ctx: RoundContext): string | null {
  const cfg = readConfig(ctx.config);
  const floor = holeFloor(cfg);
  const ceil = holeCeiling(cfg);
  const cards = gridCount(cfg.grid);
  for (const p of ctx.players) {
    const v = Number(input.scores?.[p.id]);
    if (!Number.isFinite(v) || !Number.isInteger(v)) {
      return `${p.name}: enter a whole-number hole score.`;
    }
    if (v < floor) return `${p.name}: ${v} is below the lowest possible ${cards}-card hole (${floor}).`;
    if (v > ceil) return `${p.name}: ${v} looks too high for a ${cards}-card hole.`;
  }
  return null;
}

/** Per-player points for the hole — the called-out grid totals, as integers. */
export function scoreGolf(input: GolfInput, ctx: RoundContext): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const p of ctx.players) out[p.id] = Math.trunc(Number(input.scores?.[p.id]) || 0);
  return out;
}

/** A tiny golf-flavoured tag for a hole score: below zero, exactly zero, or nothing. */
export function holeTag(score: number): 'under' | 'clean' | null {
  if (score < 0) return 'under';
  if (score === 0) return 'clean';
  return null;
}

/** Live, config-aware card-value reference shown in the round editor + help. */
export function rulesetLines(cfg: GolfConfig): string[] {
  const king = cfg.kingValue === 0 ? 'K 0' : `K ${cfg.kingValue}`;
  const joker = cfg.jokers ? ' · Joker −2' : '';
  return [
    `A 1 · 2–10 face value · J/Q 10 · ${king}${joker}`,
    'Two equal cards in the same column cancel to 0.',
    `${gridCount(cfg.grid)}-card grid — lowest total after ${cfg.holes} ${cfg.holes === 1 ? 'hole' : 'holes'} wins.`,
  ];
}
