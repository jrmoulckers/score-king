import { describe, it, expect } from 'vitest';
import type { Player } from '../../types';
import { catan } from './index';
import {
  AWARD_POINTS,
  CITY_POINTS,
  DEFAULT_TARGET_VP,
  DEV_VP_POINTS,
  MAX_CITIES,
  MAX_DEV_VP,
  MAX_SETTLEMENTS,
  SETTLEMENT_POINTS,
  carryForward,
  describeRound,
  emptyInput,
  isFinished,
  readConfig,
  scoreRound,
  totalsFor,
  validateRound,
  vpFor,
  type CatanInput,
} from './logic';

// ── helpers ────────────────────────────────────────────────────────────────
function player(id: string): Player {
  return { id, name: id.toUpperCase(), color: '#7c5cff', createdAt: 0 };
}
const P4 = ['a', 'b', 'c', 'd'].map(player);
const IDS = P4.map((p) => p.id);

// ── config ───────────────────────────────────────────────────────────────
describe('readConfig', () => {
  it('applies the standard 10 VP default', () => {
    expect(readConfig({})).toEqual({ targetVP: DEFAULT_TARGET_VP });
  });
  it('reads an override (e.g. 13 for the 5–6 player expansion)', () => {
    expect(readConfig({ targetVP: 13 })).toEqual({ targetVP: 13 });
  });
  it('floors an absurdly low target at 3', () => {
    expect(readConfig({ targetVP: 1 }).targetVP).toBe(3);
  });
});

// ── input shaping ────────────────────────────────────────────────────────
describe('emptyInput / carryForward', () => {
  it('starts every player at zero with no awards claimed', () => {
    const input = emptyInput(IDS);
    expect(input.settlements).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(input.cities).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(input.devVP).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(input.longestRoad).toBeNull();
    expect(input.largestArmy).toBeNull();
  });

  it('carries the previous checkpoint forward untouched', () => {
    const prev: CatanInput = {
      settlements: { a: 2, b: 1, c: 0, d: 0 },
      cities: { a: 1, b: 0, c: 0, d: 0 },
      devVP: { a: 0, b: 0, c: 0, d: 0 },
      longestRoad: 'b',
      largestArmy: null,
    };
    const next = carryForward(IDS, prev);
    expect(next.settlements.a).toBe(2);
    expect(next.cities.a).toBe(1);
    expect(next.longestRoad).toBe('b');
  });

  it('falls back to an empty checkpoint with no previous round', () => {
    expect(carryForward(IDS, undefined)).toEqual(emptyInput(IDS));
  });

  it('drops an award held by a player no longer in the roster', () => {
    const prev: CatanInput = {
      settlements: { a: 0 },
      cities: { a: 0 },
      devVP: { a: 0 },
      longestRoad: 'ghost',
      largestArmy: null,
    };
    expect(carryForward(['a'], prev).longestRoad).toBeNull();
  });
});

// ── scoring ──────────────────────────────────────────────────────────────
describe('vpFor / totalsFor', () => {
  it('sums settlements, cities, VP cards and awards', () => {
    const input: CatanInput = {
      settlements: { a: 3 },
      cities: { a: 1 },
      devVP: { a: 1 },
      longestRoad: 'a',
      largestArmy: null,
    };
    // 3 settlements + 1 city*2 + 1 devVP + longest road (2) = 3+2+1+2 = 8
    expect(vpFor(input, 'a')).toBe(
      3 * SETTLEMENT_POINTS + 1 * CITY_POINTS + 1 * DEV_VP_POINTS + AWARD_POINTS,
    );
    expect(vpFor(input, 'a')).toBe(8);
  });

  it('awards both Longest Road and Largest Army to the same player when held', () => {
    const input: CatanInput = {
      settlements: { a: 0 },
      cities: { a: 0 },
      devVP: { a: 0 },
      longestRoad: 'a',
      largestArmy: 'a',
    };
    expect(vpFor(input, 'a')).toBe(AWARD_POINTS * 2);
  });

  it('totals every player from one checkpoint', () => {
    const input = emptyInput(IDS);
    input.settlements.a = 2;
    input.cities.b = 1;
    expect(totalsFor(input, IDS)).toEqual({ a: 2, b: 2, c: 0, d: 0 });
  });
});

describe('scoreRound', () => {
  it('reports each player’s change since the last checkpoint as the delta', () => {
    const input = emptyInput(IDS);
    input.settlements.a = 3; // 3 VP
    input.cities.b = 2; // 4 VP
    const before = { a: 1, b: 0, c: 0, d: 0 };
    expect(scoreRound(input, IDS, before)).toEqual({ a: 2, b: 4, c: 0, d: 0 });
  });

  it('can produce a negative delta if a total is corrected downward', () => {
    const input = emptyInput(IDS);
    input.settlements.a = 1;
    const before = { a: 5, b: 0, c: 0, d: 0 };
    expect(scoreRound(input, IDS, before).a).toBe(-4);
  });
});

// ── validation ───────────────────────────────────────────────────────────
describe('validateRound', () => {
  it('accepts a clean checkpoint', () => {
    expect(validateRound(emptyInput(IDS), P4)).toBeNull();
  });

  it('rejects negative settlements', () => {
    const input = emptyInput(IDS);
    input.settlements.a = -1;
    expect(validateRound(input, P4)).toMatch(/negative/);
  });

  it(`rejects more than ${MAX_SETTLEMENTS} settlements`, () => {
    const input = emptyInput(IDS);
    input.settlements.a = MAX_SETTLEMENTS + 1;
    expect(validateRound(input, P4)).toMatch(/settlement pieces/);
  });

  it(`rejects more than ${MAX_CITIES} cities`, () => {
    const input = emptyInput(IDS);
    input.cities.a = MAX_CITIES + 1;
    expect(validateRound(input, P4)).toMatch(/city pieces/);
  });

  it(`rejects more than ${MAX_DEV_VP} Victory Point cards`, () => {
    const input = emptyInput(IDS);
    input.devVP.a = MAX_DEV_VP + 1;
    expect(validateRound(input, P4)).toMatch(/Victory Point cards/);
  });

  it('rejects an award assigned to a player outside the roster', () => {
    const input = emptyInput(IDS);
    input.longestRoad = 'ghost';
    expect(validateRound(input, P4)).toMatch(/Longest Road/);
  });
});

// ── game end ─────────────────────────────────────────────────────────────
describe('isFinished', () => {
  it('is false until someone reaches the target', () => {
    expect(isFinished({ a: 9, b: 5 }, { targetVP: 10 })).toBe(false);
  });
  it('is true the instant a total reaches the target', () => {
    expect(isFinished({ a: 10, b: 5 }, { targetVP: 10 })).toBe(true);
  });
  it('honors a raised target (5–6 player expansion)', () => {
    expect(isFinished({ a: 12 }, { targetVP: 13 })).toBe(false);
    expect(isFinished({ a: 13 }, { targetVP: 13 })).toBe(true);
  });
});

// ── history ──────────────────────────────────────────────────────────────
describe('describeRound', () => {
  it('names the current leader and their total', () => {
    const input = emptyInput(IDS);
    input.settlements.a = 3;
    input.cities.b = 1;
    expect(describeRound(input, P4)).toBe('A 3 VP');
  });

  it('calls out an award the leader holds', () => {
    const input = emptyInput(IDS);
    input.settlements.a = 1;
    input.longestRoad = 'a';
    expect(describeRound(input, P4)).toBe('A 3 VP (🛣️ Longest Road)');
  });

  it('reads "no update" for an all-zero checkpoint', () => {
    expect(describeRound(emptyInput(IDS), P4)).toBe('no update');
  });
});

// ── module wiring ──────────────────────────────────────────────────────────
describe('catan module', () => {
  it('exposes the expected identity and player range', () => {
    expect(catan.id).toBe('catan');
    expect(catan.minPlayers).toBe(3);
    expect(catan.maxPlayers).toBe(6);
  });

  it('scores a round through the module contract', () => {
    const ctx = {
      game: { id: 'g', type: 'catan', config: {}, playerIds: IDS, status: 'active' as const, createdAt: 0, roundCount: 0 },
      players: P4,
      config: {},
      roundIndex: 0,
      totals: { a: 0, b: 0, c: 0, d: 0 },
      rounds: [],
    };
    const input = catan.createRoundInput(ctx) as CatanInput;
    input.settlements.a = 2;
    expect(catan.scoreRound(input, ctx)).toEqual({ a: 2, b: 0, c: 0, d: 0 });
    expect(catan.isFinished?.({ a: 2, b: 0, c: 0, d: 0 }, { config: {}, roundCount: 1, playerCount: 4 })).toBe(
      false,
    );
  });
});
