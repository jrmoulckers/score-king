import type { ID, Player } from '../../types';
import { ordinal } from '../../stats/format';

/**
 * Mario Kart Grand Prix — pure scoring. A cup is a set of races; each race awards
 * points by finishing position, and points pile up across the cup (highest total
 * wins). This module is Svelte-free on purpose so the round editor, the module, and
 * the tests all share one source of truth for position → points.
 */

export type PointsTableId = 'modern12' | 'classic8' | 'retro4' | 'party';

/** A single race: each player's finishing position (1 = first). 0 = not entered yet. */
export interface MarioKartInput {
  positions: Record<ID, number>;
}

export interface MarioKartConfig {
  pointsTable: PointsTableId;
  /** Total karts on the track including CPUs — the highest finishing spot enterable. */
  racers: number;
  /** Races in a cup. 0 = endless (open-ended) cup. */
  racesPerCup: number;
}

/**
 * Authentic Grand Prix points tables, indexed by finishing position (index 0 = 1st).
 * A position past the end of a table scores 0 — faithful to the retro games, where
 * only the front of the pack scored. `party` is not a fixed array: it scales to the
 * field so everyone always scores (see {@link pointsForPosition}).
 */
export const POINTS_TABLES: Record<Exclude<PointsTableId, 'party'>, readonly number[]> = {
  // Mario Kart 8 Deluxe / Mario Kart Wii (12-racer grid).
  modern12: [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  // Mario Kart Wii Grand Prix, trimmed to an 8-racer grid.
  classic8: [15, 12, 10, 9, 8, 7, 6, 5],
  // Mario Kart 64 & Super Mario Kart — only the top four scored.
  retro4: [9, 6, 3, 1],
};

export interface TableMeta {
  id: PointsTableId;
  /** Short label for pills/among UI, e.g. "Modern · 12". */
  label: string;
  emoji: string;
  /** Human curve string, e.g. "15·12·10·9·8·7·6·5·4·3·2·1" (party scales, so undefined). */
  curve?: string;
  /** One-line describing how the table pays out. */
  blurb: string;
}

export const TABLE_META: Record<PointsTableId, TableMeta> = {
  modern12: {
    id: 'modern12',
    label: 'Modern · 12',
    emoji: '🏁',
    curve: POINTS_TABLES.modern12.join('·'),
    blurb: 'Mario Kart 8 / Wii — a full 12-kart grid, everyone in the field scores.',
  },
  classic8: {
    id: 'classic8',
    label: 'Classic · 8',
    emoji: '🏎️',
    curve: POINTS_TABLES.classic8.join('·'),
    blurb: 'Mario Kart Wii — an 8-kart grid, 1st down to 8th on the board.',
  },
  retro4: {
    id: 'retro4',
    label: 'Retro · top 4',
    emoji: '👾',
    curve: POINTS_TABLES.retro4.join('·'),
    blurb: 'Mario Kart 64 & Super Mario Kart — only the top four score, 5th+ get nothing.',
  },
  party: {
    id: 'party',
    label: 'Party · all score',
    emoji: '🍄',
    blurb: 'House rule — everyone scores: 1st takes one point per racer, last still gets 1.',
  },
};

const DEFAULTS: MarioKartConfig = { pointsTable: 'modern12', racers: 12, racesPerCup: 4 };

/** Coerce an unknown config value into a known table id (defaults to modern12). */
export function normalizeTable(value: unknown): PointsTableId {
  return value === 'classic8' || value === 'retro4' || value === 'party' || value === 'modern12'
    ? value
    : DEFAULTS.pointsTable;
}

/** Coerce the racer count into a sane field size (2–24, defaults to 12). */
export function normalizeRacers(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return DEFAULTS.racers;
  return Math.min(24, Math.max(2, n));
}

/** Coerce races-per-cup (>= 0; 0 means an open-ended cup). */
export function normalizeRaces(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return DEFAULTS.racesPerCup;
  return Math.min(64, n);
}

export function tableMeta(table: PointsTableId): TableMeta {
  return TABLE_META[table];
}

/**
 * Points a finishing position earns under a table. `racers` only matters for the
 * `party` table, which scales to the field. Positions ≤ 0 or past the field score 0.
 */
export function pointsForPosition(table: PointsTableId, position: number, racers: number): number {
  const pos = Math.floor(Number(position));
  if (!Number.isFinite(pos) || pos < 1) return 0;
  if (table === 'party') {
    const field = normalizeRacers(racers);
    return pos > field ? 0 : field - pos + 1;
  }
  const arr = POINTS_TABLES[table];
  return pos <= arr.length ? arr[pos - 1] : 0;
}

/** Score one race: every player's position mapped to points for the given config. */
export function scoreRace(
  input: MarioKartInput,
  config: Partial<MarioKartConfig> | Record<string, unknown> = {},
): Record<ID, number> {
  const table = normalizeTable((config as Record<string, unknown>).pointsTable);
  const racers = normalizeRacers((config as Record<string, unknown>).racers);
  const positions = input?.positions ?? {};
  const out: Record<ID, number> = {};
  for (const [id, pos] of Object.entries(positions)) {
    out[id] = pointsForPosition(table, Number(pos) || 0, racers);
  }
  return out;
}

/**
 * Validate a race entry: every racer needs a distinct finishing spot within the field.
 * Pure so both the module and its tests can share it; returns null when valid.
 */
export function validateRace(
  input: MarioKartInput,
  players: Pick<Player, 'id' | 'name'>[],
  config: Partial<MarioKartConfig> | Record<string, unknown> = {},
): string | null {
  const racers = normalizeRacers((config as Record<string, unknown>).racers);
  if (players.length > racers) {
    return `Only ${racers} karts on the track — raise "Racers" to seat all ${players.length} players.`;
  }
  const positions = input?.positions ?? {};
  const takenBy = new Map<number, string>();
  for (const p of players) {
    const pos = Math.floor(Number(positions[p.id]) || 0);
    if (pos < 1) return `Where did ${p.name} finish? 🏁`;
    if (pos > racers) return `${p.name}: there are only ${racers} karts, so ${ordinal(pos)} isn't on the track.`;
    const clash = takenBy.get(pos);
    if (clash) return `${clash} and ${p.name} can't both finish ${ordinal(pos)}.`;
    takenBy.set(pos, p.name);
  }
  return null;
}

/** Fresh race draft: seed each player into a distinct spot so entry is one-tap-to-fix. */
export function freshPositions(
  players: Pick<Player, 'id'>[],
  config: Partial<MarioKartConfig> | Record<string, unknown> = {},
): MarioKartInput {
  const racers = normalizeRacers((config as Record<string, unknown>).racers);
  return {
    positions: Object.fromEntries(players.map((p, i) => [p.id, Math.min(i + 1, racers)])),
  };
}

// ── Grand Prix presentation helpers ─────────────────────────────────────────────
// Pure, Svelte-free derivations that let the round editor dress up the cup — race
// progress, the announcer's voice, the running cup standings and a "race in the
// books" check — without duplicating any logic the tests can't reach.

/** Where a cup stands right now: which race this is and how the field of pips reads. */
export interface CupProgress {
  /** 1-based number of the race being entered. */
  race: number;
  /** Total races in the cup, or 0 for an endless cup. */
  total: number;
  /** True when the cup has no fixed length. */
  endless: boolean;
  /** True when this is the last race of a fixed-length cup (the trophy is on the line). */
  isFinal: boolean;
  /**
   * One pip per race in a fixed cup: 'done' (already raced), 'current' (this race),
   * or 'todo' (still to come). Empty for an endless cup, which shows a count instead.
   */
  pips: ('done' | 'current' | 'todo')[];
}

/**
 * Read the cup's shape from the 0-based round index being entered and the configured
 * races-per-cup. Endless cups (0) carry no pips — the UI shows a plain race count.
 */
export function cupProgress(roundIndex: number, racesPerCup: unknown): CupProgress {
  const total = normalizeRaces(racesPerCup);
  const idx = Math.max(0, Math.floor(Number(roundIndex) || 0));
  const race = idx + 1;
  const endless = total === 0;
  const isFinal = !endless && race >= total;
  const pips: CupProgress['pips'] = [];
  if (!endless) {
    for (let i = 0; i < total; i++) {
      pips.push(i < idx ? 'done' : i === idx ? 'current' : 'todo');
    }
  }
  return { race, total, endless, isFinal, pips };
}

/**
 * The race announcer's one-liner for the race being entered — start-line hype on race
 * one, plain lap copy in the middle, and trophy stakes on the final race. Endless cups
 * get their own open-road flavor. Copy only; kept here so it's snapshot-testable.
 */
export function announcerLine(roundIndex: number, racesPerCup: unknown): string {
  const { race, endless, isFinal } = cupProgress(roundIndex, racesPerCup);
  if (endless) return '♾️ Endless cup — keep the engines running!';
  if (race === 1) return '🚦 Start your engines — the cup begins!';
  if (isFinal) return '🏆 Final race — the cup is on the line!';
  return '🏁 Back on the grid — every point counts.';
}

/** A racer's standing in the cup, blending the banked total with this race's preview. */
export interface CupStanding {
  id: ID;
  /** Points banked in the cup BEFORE this race. */
  total: number;
  /** This race's points for the racer (0 until they're given a spot). */
  delta: number;
  /** total + delta — where they'd sit once this race is saved. */
  projected: number;
  /** True for the racer(s) leading on projected total (ties share the crown). */
  isLeader: boolean;
}

/**
 * Build the live cup standings for the editor: each racer's banked total, this race's
 * projected points, and the resulting order. Sorted by projected total (desc), then by
 * banked total, then name, so the board is stable as spots are assigned. The projected
 * leader(s) are flagged for the 👑 — but only once someone is actually ahead, so a
 * still-scoreless grid crowns no one.
 */
export function cupStandings(
  players: Pick<Player, 'id' | 'name'>[],
  totals: Record<ID, number>,
  raceDeltas: Record<ID, number>,
): CupStanding[] {
  const rows = players.map((p) => {
    const total = Math.round(Number(totals?.[p.id]) || 0);
    const delta = Math.round(Number(raceDeltas?.[p.id]) || 0);
    return { id: p.id, name: p.name, total, delta, projected: total + delta };
  });
  const best = rows.reduce((m, r) => Math.max(m, r.projected), 0);
  rows.sort(
    (a, b) => b.projected - a.projected || b.total - a.total || a.name.localeCompare(b.name),
  );
  return rows.map(({ name: _name, ...r }) => ({
    ...r,
    isLeader: best > 0 && r.projected === best,
  }));
}

/**
 * Is this race a wrap? True when every racer holds a distinct, in-field finishing spot
 * — i.e. the entry is complete and valid, ready for the checkered flag. Mirrors
 * {@link validateRace}'s success case as a boolean the UI can react to.
 */
export function raceComplete(
  input: MarioKartInput,
  players: Pick<Player, 'id'>[],
  config: Partial<MarioKartConfig> | Record<string, unknown> = {},
): boolean {
  const racers = normalizeRacers((config as Record<string, unknown>).racers);
  if (players.length === 0 || players.length > racers) return false;
  const positions = input?.positions ?? {};
  const seen = new Set<number>();
  for (const p of players) {
    const pos = Math.floor(Number(positions[p.id]) || 0);
    if (pos < 1 || pos > racers || seen.has(pos)) return false;
    seen.add(pos);
  }
  return true;
}
