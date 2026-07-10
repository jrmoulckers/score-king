import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import { tally } from './index';
import {
  createTallyInput,
  deltaOf,
  isTallyFinished,
  lowerIsBetter,
  projectedTotal,
  reachedTarget,
  readConfig,
  remainingToTarget,
  scoreTally,
  targetProgress,
  type TallyInput,
} from './logic';

// ---- helpers ---------------------------------------------------------------

function player(id: string, name = id): Player {
  return { id, name, color: '#7c5cff', createdAt: 0 };
}

const A = player('A', 'Ada');
const B = player('B', 'Bo');
const C = player('C', 'Cy');
const players = [A, B, C];
const ids = players.map((p) => p.id);

function ctx(
  config: Record<string, unknown> = {},
  totals: Record<ID, number> = {},
  roundIndex = 0,
): RoundContext {
  return {
    game: {} as Game,
    players,
    config,
    roundIndex,
    totals,
    rounds: [] as Round[],
  };
}

function input(deltas: Record<ID, number>): TallyInput {
  return { deltas };
}

// ---- readConfig ------------------------------------------------------------

describe('readConfig', () => {
  it('defaults to high / no target / step 1', () => {
    expect(readConfig(undefined)).toEqual({ direction: 'high', target: 0, step: 1 });
    expect(readConfig({})).toEqual({ direction: 'high', target: 0, step: 1 });
  });

  it('reads direction, target and step', () => {
    expect(readConfig({ direction: 'low', target: 100, step: 5 })).toEqual({
      direction: 'low',
      target: 100,
      step: 5,
    });
  });

  it('coerces and floors messy values, clamps step to >= 1', () => {
    expect(readConfig({ direction: 'sideways', target: -50, step: 0 })).toEqual({
      direction: 'high',
      target: 0,
      step: 1,
    });
    expect(readConfig({ target: '10', step: '2.9' })).toEqual({
      direction: 'high',
      target: 10,
      step: 2,
    });
    expect(readConfig({ step: 'garbage' }).step).toBe(1);
  });

  it('lowerIsBetter reflects the direction', () => {
    expect(lowerIsBetter({ direction: 'low' })).toBe(true);
    expect(lowerIsBetter({ direction: 'high' })).toBe(false);
    expect(lowerIsBetter(undefined)).toBe(false);
  });
});

// ---- input + scoring -------------------------------------------------------

describe('createTallyInput / scoreTally', () => {
  it('creates a zeroed delta for every player', () => {
    expect(createTallyInput(ids)).toEqual({ deltas: { A: 0, B: 0, C: 0 } });
  });

  it('passes entered deltas straight through', () => {
    expect(scoreTally(input({ A: 5, B: -3, C: 0 }))).toEqual({ A: 5, B: -3, C: 0 });
  });

  it('coerces garbage deltas to 0 without dropping the player', () => {
    const out = scoreTally({ deltas: { A: Number.NaN, B: '7' as unknown as number, C: 4 } });
    expect(out).toEqual({ A: 0, B: 7, C: 4 });
  });

  it('deltaOf reads a single finite delta or 0', () => {
    expect(deltaOf(input({ A: 9 }), 'A')).toBe(9);
    expect(deltaOf(input({}), 'A')).toBe(0);
    expect(deltaOf({ deltas: { A: Number.NaN } }, 'A')).toBe(0);
  });
});

// ---- finish / target -------------------------------------------------------

describe('isTallyFinished', () => {
  it('is off when there is no target', () => {
    expect(isTallyFinished({ A: 999 }, { target: 0 })).toBe(false);
    expect(isTallyFinished({ A: 999 }, {})).toBe(false);
  });

  it('ends a high-score game when anyone reaches the target', () => {
    expect(isTallyFinished({ A: 40, B: 99 }, { direction: 'high', target: 100 })).toBe(false);
    expect(isTallyFinished({ A: 40, B: 100 }, { direction: 'high', target: 100 })).toBe(true);
    expect(isTallyFinished({ A: 40, B: 101 }, { direction: 'high', target: 100 })).toBe(true);
  });

  it('also ends a LOW-score game when anyone reaches the threshold (Hearts-style)', () => {
    // The previously-dead combo: reaching the threshold ends the night, lowest wins.
    expect(isTallyFinished({ A: 30, B: 99 }, { direction: 'low', target: 100 })).toBe(false);
    expect(isTallyFinished({ A: 30, B: 100 }, { direction: 'low', target: 100 })).toBe(true);
  });

  it('never finishes an empty board', () => {
    expect(isTallyFinished({}, { target: 50 })).toBe(false);
  });
});

// ---- editor helpers --------------------------------------------------------

describe('editor helpers', () => {
  it('projectedTotal adds delta onto the running total', () => {
    expect(projectedTotal(20, 5)).toBe(25);
    expect(projectedTotal(20, -8)).toBe(12);
    expect(projectedTotal(Number.NaN as unknown as number, 5)).toBe(5);
  });

  it('remainingToTarget counts down, and is null once reached or with no target', () => {
    expect(remainingToTarget(70, 100)).toBe(30);
    expect(remainingToTarget(100, 100)).toBeNull();
    expect(remainingToTarget(120, 100)).toBeNull();
    expect(remainingToTarget(50, 0)).toBeNull();
  });

  it('reachedTarget flips at or above the target only when one is set', () => {
    expect(reachedTarget(99, 100)).toBe(false);
    expect(reachedTarget(100, 100)).toBe(true);
    expect(reachedTarget(150, 100)).toBe(true);
    expect(reachedTarget(150, 0)).toBe(false);
  });

  it('targetProgress is a clamped 0..1 fraction, null without a target', () => {
    expect(targetProgress(0, 100)).toBe(0);
    expect(targetProgress(50, 100)).toBe(0.5);
    expect(targetProgress(150, 100)).toBe(1);
    expect(targetProgress(-10, 100)).toBe(0);
    expect(targetProgress(50, 0)).toBeNull();
  });
});

// ---- module wiring ---------------------------------------------------------

describe('tally module', () => {
  it('exposes the expected identity and config fields', () => {
    expect(tally.id).toBe('tally');
    const keys = (tally.configFields ?? []).map((f) => f.key);
    expect(keys).toEqual(['direction', 'step', 'target']);
    expect(tally.help).toBeTruthy();
  });

  it('resolveLowerIsBetter follows the direction config', () => {
    expect(tally.resolveLowerIsBetter?.({ direction: 'low' })).toBe(true);
    expect(tally.resolveLowerIsBetter?.({ direction: 'high' })).toBe(false);
  });

  it('createRoundInput seeds a zeroed delta per seated player', () => {
    expect(tally.createRoundInput(ctx())).toEqual({ deltas: { A: 0, B: 0, C: 0 } });
  });

  it('scoreRound and isFinished route through the pure logic', () => {
    expect(tally.scoreRound(input({ A: 3, B: 0, C: -1 }), ctx())).toEqual({ A: 3, B: 0, C: -1 });
    expect(
      tally.isFinished?.({ A: 100 }, { config: { target: 100 }, roundCount: 1, playerCount: 3 }),
    ).toBe(true);
  });

  it('picks the highest or lowest total as winner by direction', () => {
    const totals = { A: 40, B: 90, C: 12 };
    expect(defaultWinners(tally, totals, { direction: 'high' })).toEqual(['B']);
    expect(defaultWinners(tally, totals, { direction: 'low' })).toEqual(['C']);
  });

  it('describeRound summarises the non-zero deltas', () => {
    const round = { input: input({ A: 5, B: 0, C: -2 }) } as unknown as Round;
    expect(tally.describeRound?.(round, players)).toBe('+5 / -2');
    const empty = { input: input({ A: 0, B: 0, C: 0 }) } as unknown as Round;
    expect(tally.describeRound?.(empty, players)).toBe('no change');
  });
});
