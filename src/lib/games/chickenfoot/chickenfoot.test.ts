import { describe, expect, it } from 'vitest';
import type { Game, Player, Round, RoundContext } from '../../types';
import { defaultWinners, resolveLower } from '../../types';
import { getModule } from '../registry';
import { chickenfoot, type ChickenFootInput } from './index';
import {
  blankValue,
  describeRound,
  doubleLabel,
  leadingDouble,
  playerRoundScore,
  scoreRound,
  startDouble,
  totalRounds,
  validateRound,
} from './logic';

const p = (id: string, name: string): Player => ({ id, name, color: '#7c5cff', createdAt: 0 });
const PLAYERS = [p('a', 'Ada'), p('b', 'Bo'), p('c', 'Cy')];

function ctxOf(config: Record<string, unknown>, roundIndex = 0, players = PLAYERS): RoundContext {
  return {
    game: {
      id: 'g',
      type: 'chickenfoot',
      config,
      playerIds: players.map((pl) => pl.id),
      status: 'active',
      createdAt: 0,
      roundCount: 0,
    } as Game,
    players,
    config,
    roundIndex,
    totals: Object.fromEntries(players.map((pl) => [pl.id, 0])),
    rounds: [],
  };
}

function input(partial: Partial<ChickenFootInput> = {}): ChickenFootInput {
  return {
    double: 9,
    pips: { a: 0, b: 0, c: 0 },
    outId: null,
    blankId: null,
    ...partial,
  };
}

describe('chicken foot · config helpers', () => {
  it('defaults to double-9 and parses the offered starting doubles', () => {
    expect(startDouble({})).toBe(9);
    expect(startDouble({ startDouble: '6' })).toBe(6);
    expect(startDouble({ startDouble: '12' })).toBe(12);
    expect(startDouble({ startDouble: '99' })).toBe(9); // out of range → default
    expect(startDouble({ startDouble: 'nope' })).toBe(9);
  });

  it('runs one round per double down to double-blank', () => {
    expect(totalRounds({ startDouble: '6' })).toBe(7);
    expect(totalRounds({ startDouble: '9' })).toBe(10);
    expect(totalRounds({ startDouble: '12' })).toBe(13);
  });

  it('counts the leading double down each round and clamps at blank', () => {
    const cfg = { startDouble: '9' };
    expect(leadingDouble(cfg, 0)).toBe(9);
    expect(leadingDouble(cfg, 1)).toBe(8);
    expect(leadingDouble(cfg, 9)).toBe(0);
    expect(leadingDouble(cfg, 20)).toBe(0);
  });

  it('labels doubles, with a friendly name for the blank', () => {
    expect(doubleLabel(7)).toBe('Double-7');
    expect(doubleLabel(0)).toBe('Double-blank');
    expect(doubleLabel(-3)).toBe('Double-blank');
  });

  it('reads the double-blank penalty, treating non-positive as disabled', () => {
    expect(blankValue({ doubleBlankValue: 50 })).toBe(50);
    expect(blankValue({ doubleBlankValue: 0 })).toBe(0);
    expect(blankValue({ doubleBlankValue: -5 })).toBe(0);
    expect(blankValue({})).toBe(0);
  });
});

describe('chicken foot · round scoring', () => {
  it('scores leftover pips per player', () => {
    const deltas = scoreRound(input({ pips: { a: 12, b: 3, c: 0 } }), PLAYERS, 50);
    expect(deltas).toEqual({ a: 12, b: 3, c: 0 });
  });

  it('gives the player who went out zero, ignoring any stray pips', () => {
    const deltas = scoreRound(input({ pips: { a: 12, b: 3, c: 7 }, outId: 'b' }), PLAYERS, 50);
    expect(deltas.b).toBe(0);
    expect(deltas.a).toBe(12);
    expect(deltas.c).toBe(7);
  });

  it('adds the double-blank penalty to whoever holds the 0–0 tile', () => {
    const deltas = scoreRound(input({ pips: { a: 4, b: 0, c: 0 }, blankId: 'a' }), PLAYERS, 50);
    expect(deltas.a).toBe(54); // 4 pips + 50 penalty
    expect(deltas.b).toBe(0);
  });

  it('scores the double-blank as a plain 0 when the penalty is disabled', () => {
    const deltas = scoreRound(input({ pips: { a: 4, b: 0, c: 0 }, blankId: 'a' }), PLAYERS, 0);
    expect(deltas.a).toBe(4);
  });

  it('never returns negative points from junk input', () => {
    expect(playerRoundScore(input({ pips: { a: -20 } as never }), 'a', 50)).toBe(0);
    expect(playerRoundScore(input({ pips: { a: NaN } as never }), 'a', 50)).toBe(0);
  });

  it('a blocked round (nobody out) scores everyone their hand', () => {
    const deltas = scoreRound(input({ pips: { a: 5, b: 9, c: 2 }, outId: null }), PLAYERS, 50);
    expect(deltas).toEqual({ a: 5, b: 9, c: 2 });
  });
});

describe('chicken foot · validation', () => {
  it('accepts a normal round', () => {
    expect(validateRound(input({ pips: { a: 5, b: 0, c: 3 }, outId: 'b' }), PLAYERS)).toBeNull();
  });

  it('accepts unset pip entries as zero', () => {
    expect(validateRound(input({ pips: {} as never }), PLAYERS)).toBeNull();
  });

  it('rejects negative pips with the offending player named', () => {
    const err = validateRound(input({ pips: { a: -1, b: 0, c: 0 } }), PLAYERS);
    expect(err).toMatch(/Ada/);
    expect(err).toMatch(/negative/);
  });

  it('rejects the same player being both out and holding the double-blank', () => {
    const err = validateRound(input({ outId: 'a', blankId: 'a' }), PLAYERS);
    expect(err).toMatch(/double-blank/);
  });
});

describe('chicken foot · round description', () => {
  const round = (input: ChickenFootInput, deltas: Record<string, number>): Round =>
    ({ id: 'r', gameId: 'g', index: 0, input, deltas, createdAt: 0 }) as Round;

  it('names the double, who went out, and the biggest hand', () => {
    const r = round(input({ double: 7, outId: 'b' }), { a: 23, b: 0, c: 4 });
    const text = describeRound(r, PLAYERS);
    expect(text).toContain('Double-7');
    expect(text).toContain('🐔 Bo out');
    expect(text).toContain('Ada +23');
  });

  it('marks a blocked round', () => {
    const r = round(input({ double: 3, outId: null }), { a: 1, b: 2, c: 3 });
    expect(describeRound(r, PLAYERS)).toContain('blocked');
  });

  it('uses the blank label for the 0–0 round', () => {
    const r = round(input({ double: 0, outId: 'a' }), { a: 0, b: 0, c: 0 });
    expect(describeRound(r, PLAYERS)).toContain('Double-blank');
  });
});

describe('chicken foot · module wiring', () => {
  it('is auto-discovered by the registry', () => {
    expect(getModule('chickenfoot')).toBe(chickenfoot);
  });

  it('exposes a lower-is-better dominoes identity', () => {
    expect(chickenfoot.id).toBe('chickenfoot');
    expect(chickenfoot.lowerIsBetter).toBe(true);
    expect(chickenfoot.emoji).toBe('🐔');
    expect(chickenfoot.minPlayers).toBeLessThanOrEqual(chickenfoot.maxPlayers);
  });

  it('ends after the double-blank round for each starting double', () => {
    expect(chickenfoot.maxRounds!({ startDouble: '6' }, 4)).toBe(7);
    expect(chickenfoot.maxRounds!({ startDouble: '9' }, 4)).toBe(10);
    expect(chickenfoot.maxRounds!({ startDouble: '12' }, 4)).toBe(13);
  });

  it('builds a fresh input seeded with the round’s leading double', () => {
    const draft = chickenfoot.createRoundInput(ctxOf({ startDouble: '9' }, 3)) as ChickenFootInput;
    expect(draft.double).toBe(6); // 9 − round index 3
    expect(draft.outId).toBeNull();
    expect(draft.blankId).toBeNull();
    expect(draft.pips).toEqual({ a: 0, b: 0, c: 0 });
  });

  it('scores through the module using the configured penalty', () => {
    const ctx = ctxOf({ startDouble: '9', doubleBlankValue: 25 });
    const deltas = chickenfoot.scoreRound(input({ pips: { a: 6, b: 0, c: 0 }, blankId: 'a' }), ctx);
    expect(deltas.a).toBe(31); // 6 + 25
  });

  it('lowest cumulative total wins', () => {
    const config = { startDouble: '9', doubleBlankValue: 50 };
    expect(resolveLower(chickenfoot, config)).toBe(true);
    expect(defaultWinners(chickenfoot, { a: 40, b: 12, c: 33 }, config)).toEqual(['b']);
  });
});
