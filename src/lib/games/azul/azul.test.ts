import { describe, expect, it } from 'vitest';
import {
  FLOOR_PENALTIES,
  MAX_FLOOR_TILES,
  MAX_LINES,
  bonusTotal,
  describeRound,
  emptyBonus,
  emptyEntry,
  emptyInput,
  entryDelta,
  floorPenalty,
  roundTotal,
  scoreRound,
  validateRound,
  type AzulInput,
} from './logic';
import { azul } from './index';

const players = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Blake' },
];

const fullPlayers = [
  { id: 'a', name: 'Ada', color: '#111', createdAt: 0 },
  { id: 'b', name: 'Blake', color: '#222', createdAt: 0 },
];

function input(overrides: Partial<AzulInput> = {}): AzulInput {
  const base = emptyInput(players);
  return { ...base, ...overrides };
}

// ── floorPenalty ─────────────────────────────────────────────────────────────

describe('floorPenalty', () => {
  it('is zero for zero tiles', () => {
    expect(floorPenalty(0)).toBe(0);
  });

  it('matches the official track: -1, -1, -2, -2, -2, -3, -3', () => {
    expect(floorPenalty(1)).toBe(1);
    expect(floorPenalty(2)).toBe(2);
    expect(floorPenalty(3)).toBe(4);
    expect(floorPenalty(4)).toBe(6);
    expect(floorPenalty(5)).toBe(8);
    expect(floorPenalty(6)).toBe(11);
    expect(floorPenalty(7)).toBe(14);
  });

  it('clamps beyond the 7-tile floor line — an 8th tile costs no more', () => {
    expect(floorPenalty(8)).toBe(14);
    expect(floorPenalty(100)).toBe(14);
  });

  it('treats negative input as zero', () => {
    expect(floorPenalty(-3)).toBe(0);
  });

  it('FLOOR_PENALTIES has exactly 7 entries summing to 14', () => {
    expect(FLOOR_PENALTIES).toHaveLength(7);
    expect(FLOOR_PENALTIES.reduce((a, b) => a + b, 0)).toBe(14);
  });
});

// ── bonusTotal ───────────────────────────────────────────────────────────────

describe('bonusTotal', () => {
  it('is zero with nothing complete', () => {
    expect(bonusTotal(emptyBonus())).toBe(0);
  });

  it('scores +2/row, +7/column, +10/color', () => {
    expect(bonusTotal({ rows: 1, columns: 0, colors: 0 })).toBe(2);
    expect(bonusTotal({ rows: 0, columns: 1, colors: 0 })).toBe(7);
    expect(bonusTotal({ rows: 0, columns: 0, colors: 1 })).toBe(10);
  });

  it('sums across all three categories', () => {
    expect(bonusTotal({ rows: 2, columns: 1, colors: 1 })).toBe(2 * 2 + 7 + 10);
  });

  it('a maxed-out wall (5/5/5) is worth 95', () => {
    expect(bonusTotal({ rows: 5, columns: 5, colors: 5 })).toBe(5 * 2 + 5 * 7 + 5 * 10);
  });

  it('clamps each category to MAX_LINES', () => {
    expect(bonusTotal({ rows: 99, columns: 99, colors: 99 })).toBe(
      MAX_LINES * 2 + MAX_LINES * 7 + MAX_LINES * 10,
    );
  });

  it('treats undefined as zero', () => {
    expect(bonusTotal(undefined)).toBe(0);
  });
});

// ── entryDelta / roundTotal ──────────────────────────────────────────────────

describe('entryDelta', () => {
  it('is the wall points minus the floor penalty', () => {
    expect(entryDelta({ scored: 10, floorTiles: 2 })).toBe(8);
  });

  it('can go negative when the floor line outweighs the wall', () => {
    expect(entryDelta({ scored: 1, floorTiles: 4 })).toBe(1 - 6);
  });

  it('treats a missing entry as scoreless', () => {
    expect(entryDelta(undefined)).toBe(0);
  });
});

describe('roundTotal', () => {
  it('is entryDelta alone on a non-final round', () => {
    const i = input({
      entries: { a: { scored: 5, floorTiles: 1 }, b: emptyEntry() },
    });
    expect(roundTotal(i, 'a')).toBe(4);
  });

  it('adds the end-game bonus only when final', () => {
    const i = input({
      final: true,
      entries: { a: { scored: 5, floorTiles: 0 }, b: emptyEntry() },
      bonuses: { a: { rows: 1, columns: 0, colors: 0 }, b: emptyBonus() },
    });
    expect(roundTotal(i, 'a')).toBe(5 + 2);
  });

  it('ignores bonuses when the round is not final', () => {
    const i = input({
      final: false,
      entries: { a: { scored: 5, floorTiles: 0 }, b: emptyEntry() },
      bonuses: { a: { rows: 1, columns: 1, colors: 1 }, b: emptyBonus() },
    });
    expect(roundTotal(i, 'a')).toBe(5);
  });
});

// ── scoreRound ───────────────────────────────────────────────────────────────

describe('scoreRound', () => {
  it('gives each player their net wall/floor points', () => {
    const i = input({
      entries: { a: { scored: 6, floorTiles: 1 }, b: { scored: 3, floorTiles: 0 } },
    });
    expect(scoreRound(i, players, { a: 0, b: 0 })).toEqual({ a: 5, b: 3 });
  });

  it('never drops a running total below zero', () => {
    const i = input({
      entries: { a: { scored: 0, floorTiles: 7 }, b: emptyEntry() },
    });
    // a has 5 already; a -14 delta would go to -9, so it's clamped to exactly 0.
    expect(scoreRound(i, players, { a: 5, b: 0 })).toEqual({ a: -5, b: 0 });
  });

  it('adds the final-round bonus into the delta', () => {
    const i = input({
      final: true,
      entries: { a: { scored: 4, floorTiles: 0 }, b: { scored: 2, floorTiles: 0 } },
      bonuses: {
        a: { rows: 2, columns: 1, colors: 0 },
        b: emptyBonus(),
      },
    });
    expect(scoreRound(i, players, { a: 10, b: 10 })).toEqual({ a: 4 + 4 + 7, b: 2 });
  });

  it('defaults totals to zero when omitted', () => {
    const i = input({ entries: { a: { scored: 3, floorTiles: 0 }, b: emptyEntry() } });
    expect(scoreRound(i, players)).toEqual({ a: 3, b: 0 });
  });
});

// ── validateRound ────────────────────────────────────────────────────────────

describe('validateRound', () => {
  it('accepts a well-formed round', () => {
    const i = input({
      entries: { a: { scored: 5, floorTiles: 2 }, b: { scored: 0, floorTiles: 0 } },
    });
    expect(validateRound(i, players)).toBeNull();
  });

  it('rejects a missing entry', () => {
    const i = input({ entries: { a: { scored: 5, floorTiles: 0 } } as any });
    expect(validateRound(i, players)).toMatch(/Blake/);
  });

  it('rejects negative wall points', () => {
    const i = input({
      entries: { a: { scored: -1, floorTiles: 0 }, b: emptyEntry() },
    });
    expect(validateRound(i, players)).toMatch(/wall points/);
  });

  it('rejects negative floor tiles', () => {
    const i = input({
      entries: { a: { scored: 0, floorTiles: -1 }, b: emptyEntry() },
    });
    expect(validateRound(i, players)).toMatch(/floor tiles/);
  });

  it('rejects more than 7 floor tiles', () => {
    const i = input({
      entries: { a: { scored: 0, floorTiles: MAX_FLOOR_TILES + 1 }, b: emptyEntry() },
    });
    expect(validateRound(i, players)).toMatch(/floor line only holds/);
  });

  it('validates bonus fields only on a final round', () => {
    const notFinal = input({
      final: false,
      entries: { a: emptyEntry(), b: emptyEntry() },
      bonuses: { a: { rows: 99, columns: 0, colors: 0 }, b: emptyBonus() },
    });
    expect(validateRound(notFinal, players)).toBeNull();

    const final = input({
      final: true,
      entries: { a: emptyEntry(), b: emptyEntry() },
      bonuses: { a: { rows: 99, columns: 0, colors: 0 }, b: emptyBonus() },
    });
    expect(validateRound(final, players)).toMatch(/complete rows/);
  });

  it('rejects an out-of-range bonus value on a final round', () => {
    const i = input({
      final: true,
      entries: { a: emptyEntry(), b: emptyEntry() },
      bonuses: { a: { rows: 0, columns: -1, colors: 0 }, b: emptyBonus() },
    });
    expect(validateRound(i, players)).toMatch(/complete columns/);
  });
});

// ── describeRound ────────────────────────────────────────────────────────────

describe('describeRound', () => {
  it('reads "not recorded" without input', () => {
    expect(describeRound(undefined, players)).toBe('Round not recorded');
  });

  it('summarizes each player\'s delta', () => {
    const i = input();
    const text = describeRound(i, players, { a: 5, b: -2 });
    expect(text).toContain('Ada +5');
    expect(text).toContain('Blake -2');
  });

  it('flags the final round', () => {
    const i = input({ final: true });
    expect(describeRound(i, players, { a: 0, b: 0 })).toContain('final round');
  });
});

// ── module wiring ────────────────────────────────────────────────────────────

describe('azul module', () => {
  it('exposes the expected identity', () => {
    expect(azul.id).toBe('azul');
    expect(azul.minPlayers).toBe(2);
    expect(azul.maxPlayers).toBe(4);
  });

  it('createRoundInput seeds an entry and bonus for every player', () => {
    const ctx = {
      game: {} as any,
      players: fullPlayers,
      config: {},
      roundIndex: 0,
      totals: { a: 0, b: 0 },
      rounds: [],
    };
    const created = azul.createRoundInput(ctx) as AzulInput;
    expect(Object.keys(created.entries).sort()).toEqual(['a', 'b']);
    expect(Object.keys(created.bonuses).sort()).toEqual(['a', 'b']);
    expect(created.final).toBe(false);
  });

  it('wires validateRound and scoreRound through the module', () => {
    const ctx = {
      game: {} as any,
      players: fullPlayers,
      config: {},
      roundIndex: 0,
      totals: { a: 0, b: 0 },
      rounds: [],
    };
    const i = input({ entries: { a: { scored: 4, floorTiles: 1 }, b: emptyEntry() } });
    expect(azul.validateRound(i, ctx)).toBeNull();
    expect(azul.scoreRound(i, ctx)).toEqual({ a: 3, b: 0 });
  });
});
