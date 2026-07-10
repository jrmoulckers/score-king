import { describe, expect, it } from 'vitest';
import type { Game, Player, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import {
  DEPTH_ZONES,
  FINSPAN_CATEGORIES,
  FINSPAN_HELP,
  FULL_TANK,
  categoryPoints,
  depthZone,
  describeFinspan,
  emptyInput,
  emptyRow,
  scoreFinspan,
  scoreRow,
  tankFill,
  validateFinspan,
  weeklyTotal,
  type FinspanRow,
} from './logic';
import { finspan } from './index';

function player(id: string, name = id): Player {
  return { id, name, color: '#7c5cff', createdAt: 0 };
}
const players = [player('a', 'Ada'), player('b', 'Bo')];

function ctxWith(ps: Player[]): RoundContext {
  const game: Game = {
    id: 'g',
    type: 'finspan',
    config: {},
    playerIds: ps.map((p) => p.id),
    status: 'active',
    createdAt: 0,
    roundCount: 0,
  };
  return {
    game,
    players: ps,
    config: {},
    roundIndex: 0,
    totals: Object.fromEntries(ps.map((p) => [p.id, 0])),
    rounds: [],
  };
}

function row(overrides: Record<string, number> = {}): FinspanRow {
  return { ...emptyRow(), ...overrides };
}

const cat = (key: string) => FINSPAN_CATEGORIES.find((c) => c.key === key)!;

describe('Finspan categories', () => {
  it('has the eight official end-game categories with unique keys', () => {
    expect(FINSPAN_CATEGORIES).toHaveLength(8);
    const keys = FINSPAN_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['week1', 'week2', 'week3', 'gameEnd', 'fish', 'consumed', 'eggsYoung', 'schools']);
  });

  it('scores schools at 6 each and everything else at 1', () => {
    expect(cat('schools').per).toBe(6);
    for (const c of FINSPAN_CATEGORIES) {
      if (c.key !== 'schools') expect(c.per).toBe(1);
    }
  });

  it('marks token categories as counts and printed points as points', () => {
    expect(cat('consumed').entry).toBe('count');
    expect(cat('eggsYoung').entry).toBe('count');
    expect(cat('schools').entry).toBe('count');
    expect(cat('week1').entry).toBe('points');
    expect(cat('gameEnd').entry).toBe('points');
    expect(cat('fish').entry).toBe('points');
  });

  it('gives every category a label, emoji and hint', () => {
    for (const c of FINSPAN_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.emoji.length).toBeGreaterThan(0);
      expect(c.hint.length).toBeGreaterThan(0);
    }
  });

  it('groups exactly the three weeks as weekly and the rest as ocean', () => {
    const weekly = FINSPAN_CATEGORIES.filter((c) => c.group === 'weekly').map((c) => c.key);
    const ocean = FINSPAN_CATEGORIES.filter((c) => c.group === 'ocean').map((c) => c.key);
    expect(weekly).toEqual(['week1', 'week2', 'week3']);
    expect(ocean).toEqual(['gameEnd', 'fish', 'consumed', 'eggsYoung', 'schools']);
    for (const c of FINSPAN_CATEGORIES) expect(['weekly', 'ocean']).toContain(c.group);
  });
});

describe('weeklyTotal', () => {
  it('sums only the three banked weeks, ignoring the rest of the ocean', () => {
    expect(weeklyTotal(row({ week1: 5, week2: 6, week3: 8, fish: 40, schools: 3 }))).toBe(19);
  });

  it('is 0 for an empty or missing row', () => {
    expect(weeklyTotal(emptyRow())).toBe(0);
    expect(weeklyTotal(undefined)).toBe(0);
  });
});

describe('depthZone', () => {
  it('lists Sunlight, Twilight and Midnight, shallowest first', () => {
    expect(DEPTH_ZONES.map((z) => z.key)).toEqual(['sunlight', 'twilight', 'midnight']);
    for (const z of DEPTH_ZONES) {
      expect(z.label.length).toBeGreaterThan(0);
      expect(z.emoji.length).toBeGreaterThan(0);
    }
  });

  it('sinks through the zones as the total grows', () => {
    expect(depthZone(0).key).toBe('sunlight');
    expect(depthZone(39).key).toBe('sunlight');
    expect(depthZone(40).key).toBe('twilight');
    expect(depthZone(79).key).toBe('twilight');
    expect(depthZone(80).key).toBe('midnight');
    expect(depthZone(999).key).toBe('midnight');
  });

  it('clamps a negative or non-finite total to Sunlight', () => {
    expect(depthZone(-10).key).toBe('sunlight');
    expect(depthZone(Number.NaN).key).toBe('sunlight');
  });
});

describe('tankFill', () => {
  it('rises from empty toward a brim-full deep ocean', () => {
    expect(tankFill(0)).toBe(0);
    expect(tankFill(FULL_TANK / 2)).toBeCloseTo(0.5);
    expect(tankFill(FULL_TANK)).toBe(1);
  });

  it('never overflows past full or drops below empty', () => {
    expect(tankFill(FULL_TANK * 3)).toBe(1);
    expect(tankFill(-50)).toBe(0);
    expect(tankFill(Number.NaN)).toBe(0);
  });
});

describe('categoryPoints', () => {
  it('multiplies schools by 6', () => {
    expect(categoryPoints(cat('schools'), 3)).toBe(18);
    expect(categoryPoints(cat('schools'), 0)).toBe(0);
  });

  it('passes point categories through unchanged', () => {
    expect(categoryPoints(cat('fish'), 46)).toBe(46);
    expect(categoryPoints(cat('week1'), 7)).toBe(7);
  });

  it('coerces blank / null / NaN to 0', () => {
    expect(categoryPoints(cat('schools'), undefined)).toBe(0);
    expect(categoryPoints(cat('schools'), null)).toBe(0);
    expect(categoryPoints(cat('fish'), Number.NaN)).toBe(0);
  });
});

describe('scoreRow', () => {
  it('is 0 for an empty or missing row', () => {
    expect(scoreRow(emptyRow())).toBe(0);
    expect(scoreRow(undefined)).toBe(0);
  });

  it('matches the official rulebook worked example', () => {
    // Yellow ability 3 + visible fish 46 + consumed 4 + eggs & young 8 + 3 schools (×6 = 18) = 79.
    const example = row({ gameEnd: 3, fish: 46, consumed: 4, eggsYoung: 8, schools: 3 });
    expect(scoreRow(example)).toBe(79);
  });

  it('adds weekly achievements and multiplies schools', () => {
    expect(scoreRow(row({ week1: 5, week2: 6, week3: 8 }))).toBe(19);
    expect(scoreRow(row({ schools: 4 }))).toBe(24);
    expect(scoreRow(row({ fish: 40, schools: 2 }))).toBe(52);
  });

  it('sums a fully-populated sheet', () => {
    const full = row({
      week1: 7, week2: 6, week3: 8, gameEnd: 3, fish: 46, consumed: 4, eggsYoung: 8, schools: 3,
    });
    // 7+6+8 + 3 + 46 + 4 + 8 + 18
    expect(scoreRow(full)).toBe(100);
  });

  it('treats a NaN entry as 0', () => {
    const r = emptyRow();
    (r as Record<string, number>).fish = Number.NaN;
    expect(scoreRow(r)).toBe(0);
  });
});

describe('scoreFinspan', () => {
  it('returns each seated player total', () => {
    const input = emptyInput(players);
    input.values.a = row({ fish: 40, schools: 2 });
    input.values.b = row({ week1: 5, eggsYoung: 3 });
    expect(scoreFinspan(input, players)).toEqual({ a: 52, b: 8 });
  });

  it('scores a player with no row as 0', () => {
    const input = emptyInput([players[0]]);
    input.values.a = row({ fish: 12 });
    expect(scoreFinspan(input, players)).toEqual({ a: 12, b: 0 });
  });

  it('is 0 for everyone with an undefined input', () => {
    expect(scoreFinspan(undefined, players)).toEqual({ a: 0, b: 0 });
  });
});

describe('validateFinspan', () => {
  it('accepts a fresh or fully-filled sheet', () => {
    expect(validateFinspan(emptyInput(players), players)).toBeNull();
    const input = emptyInput(players);
    input.values.a = row({ fish: 46, schools: 3 });
    expect(validateFinspan(input, players)).toBeNull();
  });

  it('rejects negative entries, naming the player and category', () => {
    const input = emptyInput(players);
    input.values.a.fish = -3;
    const err = validateFinspan(input, players);
    expect(err).toContain('Ada');
    expect(err).toContain('Fish');
  });

  it('rejects fractional entries', () => {
    const input = emptyInput(players);
    input.values.b.week1 = 2.5;
    expect(validateFinspan(input, players)).toMatch(/whole number/);
  });

  it('treats blank / NaN as 0 rather than an error', () => {
    const r = emptyRow();
    (r as Record<string, number>).fish = Number.NaN;
    expect(validateFinspan({ values: { a: r } }, [player('a')])).toBeNull();
  });

  it('is null for an undefined input or a player with no row', () => {
    expect(validateFinspan(undefined, players)).toBeNull();
    expect(validateFinspan({ values: {} }, players)).toBeNull();
  });
});

describe('describeFinspan', () => {
  it('summarises each player total', () => {
    const input = emptyInput(players);
    input.values.a = row({ gameEnd: 3, fish: 46, consumed: 4, eggsYoung: 8, schools: 3 });
    input.values.b = row({ schools: 2 });
    const rd = { id: 'r', gameId: 'g', index: 0, input, deltas: {}, createdAt: 0 } as Round;
    expect(describeFinspan(rd, players)).toBe('Ada 79 · Bo 12');
  });

  it('returns empty string when nothing is recorded', () => {
    const rd = { id: 'r', gameId: 'g', index: 0, input: undefined, deltas: {}, createdAt: 0 } as Round;
    expect(describeFinspan(rd, players)).toBe('');
  });
});

describe('finspan module', () => {
  it('declares faithful catalog metadata', () => {
    expect(finspan.id).toBe('finspan');
    expect(finspan.name).toBe('Finspan');
    expect(finspan.emoji).toBe('🐟');
    expect(finspan.minPlayers).toBe(1);
    expect(finspan.maxPlayers).toBe(5);
  });

  it('is a single final scoresheet', () => {
    expect(finspan.maxRounds?.({}, 4)).toBe(1);
  });

  it('seeds a zeroed row per player', () => {
    const input = finspan.createRoundInput(ctxWith(players)) as ReturnType<typeof emptyInput>;
    expect(Object.keys(input.values).sort()).toEqual(['a', 'b']);
    for (const p of players) {
      for (const c of FINSPAN_CATEGORIES) expect(input.values[p.id][c.key]).toBe(0);
    }
  });

  it('wires scoring and validation to the logic core', () => {
    const input = emptyInput(players);
    input.values.a = row({ fish: 40, schools: 2 });
    input.values.b = row({ week1: 8 });
    expect(finspan.scoreRound(input, ctxWith(players))).toEqual({ a: 52, b: 8 });
    expect(finspan.validateRound(input, ctxWith(players))).toBeNull();
    input.values.a.consumed = -1;
    expect(finspan.validateRound(input, ctxWith(players))).toContain('Ada');
  });

  it('awards the win to the highest total, sharing ties', () => {
    expect(defaultWinners(finspan, { a: 79, b: 12 })).toEqual(['a']);
    expect(defaultWinners(finspan, { a: 40, b: 40 }).sort()).toEqual(['a', 'b']);
  });

  it('ships a scoring help reference that states the schools value', () => {
    expect(finspan.help).toBe(FINSPAN_HELP);
    expect(finspan.help).toContain('6 points');
  });
});
