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
