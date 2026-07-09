import { describe, it, expect } from 'vitest';
import type { Player } from '../../types';
import { hearts } from './index';
import {
  HEARTS_TOTAL,
  baseDelta,
  emptyInput,
  heartsRemaining,
  heartsTotal,
  isFinished,
  outcomeFor,
  previewDelta,
  readConfig,
  scoreRound,
  shooter,
  validateRound,
  type HeartsInput,
} from './logic';

// ── helpers ────────────────────────────────────────────────────────────────
function player(id: string): Player {
  return { id, name: id.toUpperCase(), color: '#7c5cff', createdAt: 0 };
}
const P4 = ['a', 'b', 'c', 'd'].map(player);
const IDS = P4.map((p) => p.id);

function input(
  hearts: Record<string, number>,
  queen: string | null = null,
  jack: string | null = null,
): HeartsInput {
  return { hearts, queen, jack };
}

// ── config ───────────────────────────────────────────────────────────────
describe('readConfig', () => {
  it('applies defaults', () => {
    expect(readConfig({})).toEqual({ endScore: 100, variantJack: false, moonRule: 'add26' });
  });
  it('reads overrides and clamps moonRule to a known value', () => {
    expect(readConfig({ endScore: 50, variantJack: true, moonRule: 'subtract' })).toEqual({
      endScore: 50,
      variantJack: true,
      moonRule: 'subtract',
    });
    expect(readConfig({ moonRule: 'nonsense' }).moonRule).toBe('add26');
  });
});

// ── heart bookkeeping ──────────────────────────────────────────────────────
describe('heart tallies', () => {
  it('emptyInput seeds every player at zero hearts', () => {
    expect(emptyInput(IDS)).toEqual({
      hearts: { a: 0, b: 0, c: 0, d: 0 },
      queen: null,
      jack: null,
    });
  });
  it('totals and remaining hearts', () => {
    const i = input({ a: 5, b: 3, c: 0, d: 1 });
    expect(heartsTotal(i)).toBe(9);
    expect(heartsRemaining(i)).toBe(4);
  });
  it('remaining never goes negative', () => {
    expect(heartsRemaining(input({ a: 20 }))).toBe(0);
  });
});

// ── validation ─────────────────────────────────────────────────────────────
describe('validateRound', () => {
  it('nudges toward 13 when hearts are short', () => {
    const msg = validateRound(input({ a: 5, b: 3, c: 0, d: 0 }, 'a'), P4, {});
    expect(msg).toMatch(/5 more hearts/);
  });
  it('flags too many hearts', () => {
    const msg = validateRound(input({ a: 10, b: 5, c: 0, d: 0 }, 'a'), P4, {});
    expect(msg).toMatch(/2 too many/);
  });
  it('requires the Queen to be assigned', () => {
    const msg = validateRound(input({ a: 13, b: 0, c: 0, d: 0 }, null), P4, {});
    expect(msg).toMatch(/Queen of Spades/);
  });
  it('requires the Jack under the Omnibus variant', () => {
    const i = input({ a: 13, b: 0, c: 0, d: 0 }, 'a', null);
    expect(validateRound(i, P4, { variantJack: true })).toMatch(/Jack of Diamonds/);
    expect(validateRound(i, P4, { variantJack: false })).toBeNull();
  });
  it('passes a well-formed round', () => {
    expect(validateRound(input({ a: 4, b: 4, c: 4, d: 1 }, 'd'), P4, {})).toBeNull();
  });
});

// ── scoring ──────────────────────────────────────────────────────────────
describe('scoreRound', () => {
  it('adds hearts and the Queen (+13)', () => {
    const out = scoreRound(input({ a: 4, b: 4, c: 4, d: 1 }, 'd'), IDS, {});
    expect(out).toEqual({ a: 4, b: 4, c: 4, d: 14 });
    // 26 points distributed in all.
    expect(Object.values(out).reduce((x, y) => x + y, 0)).toBe(26);
  });

  it('applies the Omnibus Jack (−10) only when enabled', () => {
    const i = input({ a: 4, b: 4, c: 4, d: 1 }, 'd', 'a');
    expect(scoreRound(i, IDS, { variantJack: true })).toEqual({ a: -6, b: 4, c: 4, d: 14 });
    // Ignored when the variant is off.
    expect(scoreRound(i, IDS, { variantJack: false })).toEqual({ a: 4, b: 4, c: 4, d: 14 });
  });

  it('12 hearts + the Queen is NOT a moon', () => {
    const i = input({ a: 12, b: 1, c: 0, d: 0 }, 'a');
    expect(shooter(i)).toBeNull();
    expect(scoreRound(i, IDS, {})).toEqual({ a: 25, b: 1, c: 0, d: 0 });
  });

  it('shoots the moon: everyone else +26 (add26)', () => {
    const i = input({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    expect(shooter(i)).toBe('a');
    expect(scoreRound(i, IDS, { moonRule: 'add26' })).toEqual({ a: 0, b: 26, c: 26, d: 26 });
  });

  it('shoots the moon: shooter −26 (subtract)', () => {
    const i = input({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    expect(scoreRound(i, IDS, { moonRule: 'subtract' })).toEqual({ a: -26, b: 0, c: 0, d: 0 });
  });

  it('a moon ignores the Jack for the shooter under add26', () => {
    const i = input({ a: 13, b: 0, c: 0, d: 0 }, 'a', 'a');
    expect(scoreRound(i, IDS, { moonRule: 'add26', variantJack: true })).toEqual({
      a: 0,
      b: 26,
      c: 26,
      d: 26,
    });
  });
});

// ── previews & outcomes ────────────────────────────────────────────────────
describe('previews', () => {
  it('baseDelta ignores the moon reversal; previewDelta honors it', () => {
    const i = input({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    expect(baseDelta(i, 'a', readConfig({}))).toBe(26);
    expect(previewDelta(i, 'a', IDS, {})).toBe(0);
    expect(previewDelta(i, 'b', IDS, {})).toBe(26);
  });

  it('outcomeFor classifies clean, lady, moon and mooned', () => {
    const clean = input({ a: 0, b: 5, c: 7, d: 1 }, 'd');
    expect(outcomeFor(clean, 'a', IDS, {}).kind).toBe('clean');
    expect(outcomeFor(clean, 'd', IDS, {}).kind).toBe('lady');

    const moon = input({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    expect(outcomeFor(moon, 'a', IDS, {}).kind).toBe('moon');
    expect(outcomeFor(moon, 'b', IDS, {}).kind).toBe('points');
  });
});

// ── end condition ──────────────────────────────────────────────────────────
describe('isFinished', () => {
  it('ends when a player reaches the end score', () => {
    expect(isFinished({ a: 100, b: 40 }, {})).toBe(true);
    expect(isFinished({ a: 99, b: 40 }, {})).toBe(false);
    expect(isFinished({ a: 55, b: 40 }, { endScore: 50 })).toBe(true);
  });
});

// ── module wiring ──────────────────────────────────────────────────────────
describe('hearts module', () => {
  it('delegates validate/score/finish to the shared logic', () => {
    const ctx = {
      game: {} as never,
      players: P4,
      config: {},
      roundIndex: 0,
      totals: {},
      rounds: [],
    };
    const i = input({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    expect(hearts.validateRound(i, ctx)).toBeNull();
    expect(hearts.scoreRound(i, ctx)).toEqual({ a: 0, b: 26, c: 26, d: 26 });
    expect(hearts.isFinished!({ a: 100 }, { config: {}, roundCount: 3, playerCount: 4 })).toBe(true);
  });

  it('createRoundInput seeds every seat', () => {
    const ctx = {
      game: {} as never,
      players: P4,
      config: {},
      roundIndex: 0,
      totals: {},
      rounds: [],
    };
    expect(hearts.createRoundInput(ctx)).toEqual(emptyInput(IDS));
    expect(HEARTS_TOTAL).toBe(13);
  });

  it('describeRound summarizes a moon and an ordinary round', () => {
    const moon = { input: input({ a: 13, b: 0, c: 0, d: 0 }, 'a') } as never;
    expect(hearts.describeRound!(moon, P4)).toMatch(/shot the moon/);
    const ordinary = { input: input({ a: 4, b: 4, c: 4, d: 1 }, 'd', 'a') } as never;
    expect(hearts.describeRound!(ordinary, P4)).toMatch(/♠Q D · ♦J A/);
  });
});
