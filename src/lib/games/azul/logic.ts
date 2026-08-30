import type { ID } from '../../types';

/**
 * Pure Azul scoring — no Svelte, no I/O, so it's independently unit-testable and
 * safe for the stats engine to import.
 *
 * This app doesn't model the physical wall grid (five rows × five columns), so a
 * round is entered the way a table actually plays it: each player reports the
 * wall points they scored placing tiles this round (a tile placed alone is worth
 * 1; otherwise it's worth the length of every contiguous line — horizontal *and*
 * vertical — it completes) and how many tiles spilled onto their floor line.
 * The game ends the round a player first completes a horizontal row of five, and
 * that final round also carries each player's end-game bonus tally.
 */

export interface AzulEntry {
  /** Wall points scored placing tiles this round (alone = 1; else sum of each contiguous line). */
  scored: number;
  /** Tiles that spilled onto the floor line this round, 0–7 (an 8th+ tile costs no more). */
  floorTiles: number;
}

/** End-game bonus tally, counted only on the round that ends the game. */
export interface AzulBonus {
  /** Complete horizontal rows on the wall — max 5, each worth 2. */
  rows: number;
  /** Complete vertical columns — max 5, each worth 7. */
  columns: number;
  /** Colors with all 5 tiles placed on the wall — max 5, each worth 10. */
  colors: number;
}

export interface AzulInput {
  /** True on the round that ends the game — someone completed a horizontal row. */
  final: boolean;
  entries: Record<ID, AzulEntry>;
  /** End-game bonuses, keyed by player id. Only meaningful (and shown) when `final`. */
  bonuses: Record<ID, AzulBonus>;
}

/**
 * Floor-line penalty by tile count, left to right on the track: −1, −1, −2, −2,
 * −2, −3, −3. Listed as positive magnitudes here; callers subtract the total.
 */
export const FLOOR_PENALTIES: readonly number[] = [1, 1, 2, 2, 2, 3, 3];
export const MAX_FLOOR_TILES = FLOOR_PENALTIES.length;
export const MAX_FLOOR_PENALTY = FLOOR_PENALTIES.reduce((a, b) => a + b, 0);

export const ROW_BONUS = 2;
export const COLUMN_BONUS = 7;
export const COLOR_BONUS = 10;
/** A wall has 5 rows, 5 columns and 5 colors — no more can ever be complete. */
export const MAX_LINES = 5;

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Total floor-line penalty for a given tile count (0 tiles = 0 penalty). */
export function floorPenalty(tiles: number): number {
  const n = clampInt(tiles, 0, MAX_FLOOR_TILES);
  let total = 0;
  for (let i = 0; i < n; i += 1) total += FLOOR_PENALTIES[i];
  return total;
}

export function emptyEntry(): AzulEntry {
  return { scored: 0, floorTiles: 0 };
}

export function emptyBonus(): AzulBonus {
  return { rows: 0, columns: 0, colors: 0 };
}

export function emptyInput(players: readonly { id: ID }[]): AzulInput {
  const entries: Record<ID, AzulEntry> = {};
  const bonuses: Record<ID, AzulBonus> = {};
  for (const p of players) {
    entries[p.id] = emptyEntry();
    bonuses[p.id] = emptyBonus();
  }
  return { final: false, entries, bonuses };
}

/** Points a player's end-game bonus tally is worth. */
export function bonusTotal(b: AzulBonus | undefined): number {
  if (!b) return 0;
  const rows = clampInt(b.rows, 0, MAX_LINES);
  const columns = clampInt(b.columns, 0, MAX_LINES);
  const colors = clampInt(b.colors, 0, MAX_LINES);
  return rows * ROW_BONUS + columns * COLUMN_BONUS + colors * COLOR_BONUS;
}

/** Net wall/floor points for a single entry, before any end-game bonus. */
export function entryDelta(entry: AzulEntry | undefined): number {
  const e = entry ?? emptyEntry();
  const scored = Math.max(0, Math.round(Number(e.scored)) || 0);
  return scored - floorPenalty(e.floorTiles);
}

/** Everything one player takes this round: wall/floor net, plus bonus if final. */
export function roundTotal(input: AzulInput, playerId: ID): number {
  const base = entryDelta(input.entries?.[playerId]);
  const bonus = input.final ? bonusTotal(input.bonuses?.[playerId]) : 0;
  return base + bonus;
}

/**
 * Per-player point deltas for the round. A running score can never drop below
 * zero from floor penalties, so a delta that would take a player negative is
 * clamped to bring them exactly to zero.
 */
export function scoreRound(
  input: AzulInput,
  players: readonly { id: ID }[],
  totals: Record<ID, number> = {},
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const p of players) {
    const raw = roundTotal(input, p.id);
    const before = totals[p.id] ?? 0;
    out[p.id] = before + raw < 0 ? -before : raw;
  }
  return out;
}

/** Null when the round is good to record, otherwise a friendly reason. */
export function validateRound(
  input: AzulInput,
  players: readonly { id: ID; name: string }[],
): string | null {
  for (const p of players) {
    const e = input.entries?.[p.id];
    if (!e) return `${p.name} is missing a round entry.`;
    if (!Number.isFinite(Number(e.scored)) || Number(e.scored) < 0) {
      return `${p.name}: wall points can't be negative.`;
    }
    if (!Number.isFinite(Number(e.floorTiles)) || Number(e.floorTiles) < 0) {
      return `${p.name}: floor tiles can't be negative.`;
    }
    if (Number(e.floorTiles) > MAX_FLOOR_TILES) {
      return `${p.name}: the floor line only holds ${MAX_FLOOR_TILES} tiles.`;
    }
    if (input.final) {
      const b = input.bonuses?.[p.id] ?? emptyBonus();
      for (const [label, v] of [
        ['rows', b.rows],
        ['columns', b.columns],
        ['colors', b.colors],
      ] as const) {
        if (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > MAX_LINES) {
          return `${p.name}: complete ${label} must be 0–${MAX_LINES}.`;
        }
      }
    }
  }
  return null;
}

/** Short, glanceable summary of a recorded round for the history table. */
export function describeRound(
  input: AzulInput | undefined,
  players: readonly { id: ID; name: string }[],
  deltas: Record<ID, number> = {},
): string {
  if (!input) return 'Round not recorded';
  const parts = players.map((p) => {
    const d = deltas[p.id] ?? 0;
    return `${p.name} ${d >= 0 ? '+' : ''}${d}`;
  });
  const tag = input.final ? '🏆 final round — ' : '';
  return `🧱 ${tag}${parts.join(' · ')}`;
}
