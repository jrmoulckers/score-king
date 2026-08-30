import { describe, it, expect } from 'vitest';
import type { Player } from '../../types';
import { kingscorners } from './index';
import {
  DEFAULT_CONFIG,
  KING_PENALTY,
  CARD_PENALTY,
  describeRound,
  emptyInput,
  isFinished,
  penaltyFor,
  readConfig,
  scoreRound,
  validateRound,
  wentOutIds,
  type KingsCornersInput,
} from './logic';

// ── helpers ────────────────────────────────────────────────────────────────
function player(id: string): Player {
  return { id, name: id.toUpperCase(), color: '#7c5cff', createdAt: 0 };
}
const P4 = ['a', 'b', 'c', 'd'].map(player);
const IDS = P4.map((p) => p.id);

function input(
  kingsLeft: Record<string, number>,
  othersLeft: Record<string, number>,
): KingsCornersInput {
  return { kingsLeft, othersLeft };
}

// ── config ───────────────────────────────────────────────────────────────
describe('readConfig', () => {
  it('applies defaults', () => {
    expect(readConfig({})).toEqual(DEFAULT_CONFIG);
  });
  it('reads an override', () => {
    expect(readConfig({ endScore: 50 })).toEqual({ endScore: 50 });
  });
  it('never lets the end score fall below 1', () => {
    expect(readConfig({ endScore: -5 }).endScore).toBe(1);
    expect(readConfig({ endScore: 'nope' }).endScore).toBe(25);
  });
});

// ── empty input ────────────────────────────────────────────────────────────
describe('emptyInput', () => {
  it('seeds every player at zero cards left', () => {
    expect(emptyInput(IDS)).toEqual({
      kingsLeft: { a: 0, b: 0, c: 0, d: 0 },
      othersLeft: { a: 0, b: 0, c: 0, d: 0 },
    });
  });
});

// ── penalty math ───────────────────────────────────────────────────────────
describe('penaltyFor', () => {
  it('charges 10 per King and 1 per other card', () => {
    const i = input({ a: 2 }, { a: 3 });
    expect(penaltyFor(i, 'a')).toBe(2 * KING_PENALTY + 3 * CARD_PENALTY);
  });
  it('treats a missing/garbage entry as zero', () => {
    const i = input({}, {});
    expect(penaltyFor(i, 'z')).toBe(0);
  });
});

describe('wentOutIds', () => {
  it('finds the player(s) holding zero cards', () => {
    const i = input({ a: 0, b: 1, c: 0, d: 2 }, { a: 0, b: 2, c: 0, d: 1 });
    expect(wentOutIds(i, IDS)).toEqual(['a', 'c']);
  });
  it('returns none when nobody is empty', () => {
    const i = input({ a: 1 }, { a: 0 });
    expect(wentOutIds(i, ['a'])).toEqual([]);
  });
});

// ── validation ─────────────────────────────────────────────────────────────
describe('validateRound', () => {
  it('requires someone to have gone out', () => {
    const i = input({ a: 1, b: 0, c: 0, d: 0 }, { a: 0, b: 3, c: 4, d: 2 });
    expect(validateRound(i, P4, {})).toMatch(/Mark who went out/);
  });
  it('rejects an all-zero round (nobody actually holding cards)', () => {
    const i = emptyInput(IDS);
    expect(validateRound(i, P4, {})).toMatch(/Everyone can't be at zero/);
  });
  it('passes a well-formed round with exactly one player at zero', () => {
    const i = input({ a: 0, b: 1, c: 0, d: 0 }, { a: 0, b: 5, c: 2, d: 3 });
    expect(validateRound(i, P4, {})).toBeNull();
  });
});

// ── scoring ──────────────────────────────────────────────────────────────
describe('scoreRound', () => {
  it('scores each seat its own penalty; the empty hand banks zero', () => {
    const i = input({ a: 0, b: 1, c: 1, d: 2 }, { a: 0, b: 3, c: 4, d: 1 });
    expect(scoreRound(i, IDS)).toEqual({ a: 0, b: 13, c: 14, d: 21 });
  });

  it('delegates identically through the module', () => {
    const ctx = {
      game: {} as never,
      players: P4,
      config: {},
      roundIndex: 0,
      totals: {},
      rounds: [],
    };
    const i = input({ a: 0, b: 1, c: 1, d: 2 }, { a: 0, b: 3, c: 4, d: 1 });
    expect(kingscorners.scoreRound(i, ctx)).toEqual({ a: 0, b: 13, c: 14, d: 21 });
    expect(kingscorners.validateRound(i, ctx)).toBeNull();
  });
});

// ── end condition ──────────────────────────────────────────────────────────
describe('isFinished', () => {
  it('ends when a player reaches the end score (25 default)', () => {
    expect(isFinished({ a: 25, b: 10 }, {})).toBe(true);
    expect(isFinished({ a: 24, b: 10 }, {})).toBe(false);
    expect(isFinished({ a: 55, b: 40 }, { endScore: 50 })).toBe(true);
  });
});

// ── round storytelling ─────────────────────────────────────────────────────
describe('describeRound', () => {
  it('names who went out and the heaviest hand', () => {
    const i = input({ a: 0, b: 1, c: 1, d: 2 }, { a: 0, b: 3, c: 4, d: 1 });
    expect(describeRound(i, P4)).toMatch(/👑 A went out — D \+21/);
  });
  it('celebrates a clean sweep when everyone else is also at zero', () => {
    const i = input({ a: 0, b: 0 }, { a: 0, b: 0 });
    expect(describeRound(i, P4.slice(0, 2))).toMatch(/clean sweep/);
  });
  it('handles a missing/legacy input', () => {
    expect(describeRound(undefined, P4)).toBe('no cards');
  });
});

// ── module wiring ──────────────────────────────────────────────────────────
describe('kingscorners module', () => {
  it('is configured for 2-4 players, lower-is-better', () => {
    expect(kingscorners.minPlayers).toBe(2);
    expect(kingscorners.maxPlayers).toBe(4);
    expect(kingscorners.lowerIsBetter).toBe(true);
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
    expect(kingscorners.createRoundInput(ctx)).toEqual(emptyInput(IDS));
  });

  it('roundCellTone marks whoever went out this round, and no one else', () => {
    const i = input({ a: 0, b: 1, c: 0, d: 2 }, { a: 0, b: 3, c: 0, d: 1 });
    const round = { input: i } as never;
    expect(kingscorners.roundCellTone!(round, 'a')).toMatchObject({ tone: 'good' });
    expect(kingscorners.roundCellTone!(round, 'b')).toBeNull();
  });

  it('isFinished mirrors the shared logic', () => {
    expect(kingscorners.isFinished!({ a: 25 }, { config: {}, roundCount: 3, playerCount: 4 })).toBe(
      true,
    );
  });
});
