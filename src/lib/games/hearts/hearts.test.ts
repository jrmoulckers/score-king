import { describe, it, expect } from 'vitest';
import type { Game, Player, Round, RoundContext } from '../../types';
import { hearts } from './index';
import {
  isFinished,
  readConfig,
  scoreRound,
  shooter,
  totalHearts,
  validateRound,
  type HeartsInput,
} from './logic';

// ── helpers ──────────────────────────────────────────────────────────────
function player(id: string): Player {
  return { id, name: id.toUpperCase(), color: '#7c5cff', createdAt: 0 };
}
function hand(hearts: Record<string, number>, queen: string | null, jack: string | null = null): HeartsInput {
  return { hearts, queen, jack };
}
function ctx(
  players: Player[],
  config: Record<string, unknown> = {},
): RoundContext {
  const game: Game = {
    id: 'g',
    type: 'hearts',
    config,
    playerIds: players.map((p) => p.id),
    status: 'active',
    createdAt: 0,
    roundCount: 0,
  };
  return { game, players, config, roundIndex: 0, totals: {}, rounds: [] };
}

const P = [player('a'), player('b'), player('c'), player('d')];

// ── config ───────────────────────────────────────────────────────────────
describe('hearts readConfig', () => {
  it('defaults sensibly and coerces the moon rule', () => {
    expect(readConfig({})).toEqual({ endScore: 100, variantJack: false, moonRule: 'add26' });
    expect(readConfig({ endScore: 50, variantJack: true, moonRule: 'subtract' })).toEqual({
      endScore: 50,
      variantJack: true,
      moonRule: 'subtract',
    });
    expect(readConfig({ moonRule: 'nonsense' }).moonRule).toBe('add26');
  });
});

// ── plain scoring ────────────────────────────────────────────────────────
describe('hearts scoreRound (no moon)', () => {
  it('counts hearts plus the ♠Q', () => {
    const input = hand({ a: 5, b: 3, c: 5, d: 0 }, 'c');
    expect(scoreRound(input, P, {})).toEqual({ a: 5, b: 3, c: 18, d: 0 });
  });

  it('applies the ♦J −10 bonus only when the variant is on', () => {
    const input = hand({ a: 5, b: 3, c: 5, d: 0 }, 'c', 'a');
    expect(scoreRound(input, P, { variantJack: false })).toEqual({ a: 5, b: 3, c: 18, d: 0 });
    expect(scoreRound(input, P, { variantJack: true })).toEqual({ a: -5, b: 3, c: 18, d: 0 });
  });
});

// ── shoot the moon ───────────────────────────────────────────────────────
describe('hearts shoot the moon', () => {
  it('detects the shooter (all 13 hearts + ♠Q)', () => {
    expect(shooter(hand({ a: 13, b: 0, c: 0, d: 0 }, 'a'))).toBe('a');
    expect(shooter(hand({ a: 13, b: 0, c: 0, d: 0 }, 'b'))).toBeNull();
    expect(shooter(hand({ a: 12, b: 1, c: 0, d: 0 }, 'a'))).toBeNull();
  });

  it('add26 rule: shooter scores 0, everyone else +26', () => {
    const input = hand({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    expect(scoreRound(input, P, { moonRule: 'add26' })).toEqual({ a: 0, b: 26, c: 26, d: 26 });
  });

  it('subtract rule: shooter scores −26, everyone else 0', () => {
    const input = hand({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    expect(scoreRound(input, P, { moonRule: 'subtract' })).toEqual({ a: -26, b: 0, c: 0, d: 0 });
  });

  it('keeps a non-shooter ♦J bonus during a moon', () => {
    // b holds the ♦J while a shoots the moon.
    const input = hand({ a: 13, b: 0, c: 0, d: 0 }, 'a', 'b');
    expect(scoreRound(input, P, { variantJack: true, moonRule: 'add26' })).toEqual({
      a: 0,
      b: 16, // +26 − 10
      c: 26,
      d: 26,
    });
    expect(scoreRound(input, P, { variantJack: true, moonRule: 'subtract' })).toEqual({
      a: -26,
      b: -10,
      c: 0,
      d: 0,
    });
  });

  it('still credits the ♦J to the shooter when they also took it (bug fix)', () => {
    // a shoots the moon AND holds the ♦J — the −10 bonus is a separate card.
    const input = hand({ a: 13, b: 0, c: 0, d: 0 }, 'a', 'a');
    expect(scoreRound(input, P, { variantJack: true, moonRule: 'add26' })).toEqual({
      a: -10, // 0 − 10
      b: 26,
      c: 26,
      d: 26,
    });
    expect(scoreRound(input, P, { variantJack: true, moonRule: 'subtract' })).toEqual({
      a: -36, // −26 − 10
      b: 0,
      c: 0,
      d: 0,
    });
  });
});

// ── validation ───────────────────────────────────────────────────────────
describe('hearts validateRound', () => {
  it('requires hearts to total 13', () => {
    expect(validateRound(hand({ a: 5, b: 3, c: 4, d: 0 }, 'a'), P, {})).toMatch(/must total 13/);
    expect(totalHearts(hand({ a: 5, b: 3, c: 4, d: 0 }, 'a'))).toBe(12);
  });

  it('requires the ♠Q to be assigned', () => {
    expect(validateRound(hand({ a: 5, b: 3, c: 5, d: 0 }, null), P, {})).toMatch(/Queen of Spades/);
  });

  it('requires the ♦J when the variant is on', () => {
    expect(validateRound(hand({ a: 5, b: 3, c: 5, d: 0 }, 'a', null), P, { variantJack: true })).toMatch(
      /Jack of Diamonds/,
    );
    expect(validateRound(hand({ a: 5, b: 3, c: 5, d: 0 }, 'a', 'b'), P, { variantJack: true })).toBeNull();
  });

  it('rejects out-of-range hearts', () => {
    expect(validateRound(hand({ a: 14, b: -1, c: 0, d: 0 }, 'a'), P, {})).toMatch(/between 0 and 13/);
  });

  it('accepts a legal round', () => {
    expect(validateRound(hand({ a: 5, b: 3, c: 5, d: 0 }, 'c'), P, {})).toBeNull();
  });
});

// ── end condition ────────────────────────────────────────────────────────
describe('hearts isFinished', () => {
  it('ends when a player reaches the end score', () => {
    expect(isFinished({ a: 40, b: 99, c: 12 }, {})).toBe(false);
    expect(isFinished({ a: 40, b: 100, c: 12 }, {})).toBe(true);
    expect(isFinished({ a: 40, b: 51, c: 12 }, { endScore: 50 })).toBe(true);
  });
});

// ── module contract ──────────────────────────────────────────────────────
describe('hearts module', () => {
  it('is lower-is-better', () => {
    expect(hearts.lowerIsBetter).toBe(true);
  });

  it('wires validate/score/isFinished through the module', () => {
    const c = ctx(P, { variantJack: true, moonRule: 'add26' });
    const input = hand({ a: 13, b: 0, c: 0, d: 0 }, 'a', 'b');
    expect(hearts.validateRound(input, c)).toBeNull();
    expect(hearts.scoreRound(input, c)).toEqual({ a: 0, b: 16, c: 26, d: 26 });
    expect(hearts.isFinished?.({ a: 100 }, { config: {}, roundCount: 3, playerCount: 4 })).toBe(true);
  });

  it('celebrates a moon and lists the ♦J holder in the round summary', () => {
    const moonRound = { input: hand({ a: 13, b: 0, c: 0, d: 0 }, 'a') } as unknown as Round;
    expect(hearts.describeRound?.(moonRound, P)).toBe('🌙 A shot the moon');
    const plainRound = { input: hand({ a: 5, b: 3, c: 5, d: 0 }, 'c', 'd') } as unknown as Round;
    expect(hearts.describeRound?.(plainRound, P)).toBe('♠Q: C · ♦J: D');
  });
});
