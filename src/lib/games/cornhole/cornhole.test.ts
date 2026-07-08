import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import { cornhole } from './index';
import {
  applyBust,
  BAGS_PER_SIDE,
  cancel,
  type CornholeConfig,
  type CornholeInput,
  isWon,
  readConfig,
  scoreCornhole,
  sideRaw,
} from './logic';

const DEFAULT: CornholeConfig = { target: 21, bust: false, winBy: 1, format: '1v1' };

function player(id: ID, name: string): Player {
  return { id, name, color: '#7c5cff', createdAt: 0 };
}
function ctxOf(
  totals: Record<ID, number>,
  config: Record<string, unknown> = {},
  roundIndex = 0,
): RoundContext {
  return {
    game: {} as Game,
    players: [player('a', 'Aces'), player('b', 'Bombers')],
    config,
    roundIndex,
    totals,
    rounds: [],
  };
}
function input(a: [number, number], b: [number, number]): CornholeInput {
  return {
    sides: {
      a: { inHole: a[0], onBoard: a[1] },
      b: { inHole: b[0], onBoard: b[1] },
    },
  };
}

describe('cornhole: raw side points', () => {
  it('scores 3 per bag in the hole, 1 per bag on the board', () => {
    expect(sideRaw({ inHole: 0, onBoard: 0 })).toBe(0);
    expect(sideRaw({ inHole: 1, onBoard: 0 })).toBe(3);
    expect(sideRaw({ inHole: 0, onBoard: 1 })).toBe(1);
    expect(sideRaw({ inHole: 2, onBoard: 1 })).toBe(7); // 6 + 1
    expect(sideRaw({ inHole: 4, onBoard: 0 })).toBe(12); // a four-bagger
  });

  it('ignores junk / negative bag counts', () => {
    expect(sideRaw(undefined)).toBe(0);
    expect(sideRaw({ inHole: -3, onBoard: 2 })).toBe(2);
    expect(sideRaw({ inHole: 1.9, onBoard: 0 })).toBe(3); // truncates
  });
});

describe('cornhole: cancellation', () => {
  it('only the higher side scores, and only the difference', () => {
    expect(cancel(7, 4)).toEqual({ gainer: 'a', net: 3 });
    expect(cancel(4, 7)).toEqual({ gainer: 'b', net: 3 });
  });

  it('equal points are a wash — nobody scores', () => {
    expect(cancel(0, 0)).toEqual({ gainer: null, net: 0 });
    expect(cancel(6, 6)).toEqual({ gainer: null, net: 0 });
  });

  it('resolves the canonical example: A 7, B 4 -> A +3, B +0', () => {
    const out = scoreCornhole(['a', 'b'], input([2, 1], [1, 1]), { a: 0, b: 0 }, DEFAULT);
    expect(out.deltas).toEqual({ a: 3, b: 0 });
    expect(out.gainerId).toBe('a');
    expect(out.net).toBe(3);
    expect(out.busted).toBe(false);
  });

  it('a wash leaves both sides unchanged', () => {
    const out = scoreCornhole(['a', 'b'], input([1, 0], [1, 0]), { a: 5, b: 5 }, DEFAULT);
    expect(out.deltas).toEqual({ a: 0, b: 0 });
    expect(out.gainerId).toBeNull();
  });
});

describe('cornhole: bust variant (reset to 15)', () => {
  const bustCfg: CornholeConfig = { ...DEFAULT, bust: true };

  it('overshooting the target drops the scoring side to 15', () => {
    // A at 20, sinks two bags (6) vs nothing -> would hit 26 -> bust to 15.
    const out = scoreCornhole(['a', 'b'], input([2, 0], [0, 0]), { a: 20, b: 12 }, bustCfg);
    expect(out.busted).toBe(true);
    expect(out.deltas.a).toBe(-5); // 20 -> 15
    expect(20 + out.deltas.a).toBe(15);
  });

  it('a bust from below 15 still lands exactly on 15', () => {
    // A at 14, four-bagger (12) -> 26 -> bust to 15 (net delta +1).
    const out = scoreCornhole(['a', 'b'], input([4, 0], [0, 0]), { a: 14, b: 3 }, bustCfg);
    expect(out.busted).toBe(true);
    expect(out.deltas.a).toBe(1);
    expect(14 + out.deltas.a).toBe(15);
  });

  it('landing exactly on the target is a win, never a bust', () => {
    // A at 18, sinks one bag (3) -> exactly 21.
    const out = scoreCornhole(['a', 'b'], input([1, 0], [0, 0]), { a: 18, b: 10 }, bustCfg);
    expect(out.busted).toBe(false);
    expect(18 + out.deltas.a).toBe(21);
  });

  it('with bust off, the side simply sails past the target', () => {
    const out = scoreCornhole(['a', 'b'], input([2, 0], [0, 0]), { a: 20, b: 12 }, DEFAULT);
    expect(out.busted).toBe(false);
    expect(20 + out.deltas.a).toBe(26);
  });

  it('does not bite when the target is not above 15 (reset would not punish)', () => {
    const shortBust: CornholeConfig = { ...bustCfg, target: 11 };
    const res = applyBust(10, 4, shortBust); // 14 > 11, but target <= 15
    expect(res.busted).toBe(false);
    expect(res.delta).toBe(4);
  });
});

describe('cornhole: win detection', () => {
  it('first side to the target wins (win-by 1)', () => {
    expect(isWon({ a: 21, b: 15 }, DEFAULT)).toBe(true);
    expect(isWon({ a: 20, b: 19 }, DEFAULT)).toBe(false);
    expect(isWon({ a: 24, b: 12 }, DEFAULT)).toBe(true); // over the top counts (no bust)
  });

  it('win-by margin keeps the game alive until the lead is big enough', () => {
    const winBy2: CornholeConfig = { ...DEFAULT, winBy: 2 };
    expect(isWon({ a: 21, b: 20 }, winBy2)).toBe(false);
    expect(isWon({ a: 21, b: 19 }, winBy2)).toBe(true);
    expect(isWon({ a: 22, b: 20 }, winBy2)).toBe(true);
  });

  it('nobody wins before the target', () => {
    expect(isWon({ a: 0, b: 0 }, DEFAULT)).toBe(false);
    expect(isWon({}, DEFAULT)).toBe(false);
  });
});

describe('cornhole: config parsing', () => {
  it('fills sensible defaults', () => {
    expect(readConfig({})).toEqual({ target: 21, bust: false, winBy: 1, format: '1v1' });
  });
  it('coerces and guards raw values', () => {
    expect(readConfig({ target: '15', bust: true, winBy: 0, format: '2v2' })).toEqual({
      target: 15,
      bust: true,
      winBy: 1, // clamped up from 0
      format: '2v2',
    });
    expect(readConfig({ format: 'nonsense' }).format).toBe('1v1');
  });
});

describe('cornhole: module wiring', () => {
  it('is a two-sided, higher-wins game with the right identity', () => {
    expect(cornhole.id).toBe('cornhole');
    expect(cornhole.minPlayers).toBe(2);
    expect(cornhole.maxPlayers).toBe(2);
    expect(cornhole.lowerIsBetter).toBeFalsy();
  });

  it('seeds an empty throw for each side', () => {
    const draft = cornhole.createRoundInput(ctxOf({ a: 0, b: 0 })) as CornholeInput;
    expect(draft.sides.a).toEqual({ inHole: 0, onBoard: 0 });
    expect(draft.sides.b).toEqual({ inHole: 0, onBoard: 0 });
  });

  it('scoreRound routes through cancellation + config', () => {
    const deltas = cornhole.scoreRound(input([3, 0], [1, 0]), ctxOf({ a: 0, b: 0 }));
    expect(deltas).toEqual({ a: 6, b: 0 }); // 9 vs 3 -> A +6
  });

  it('scoreRound honors the bust config from ctx', () => {
    const deltas = cornhole.scoreRound(input([2, 0], [0, 0]), ctxOf({ a: 20, b: 0 }, { bust: true }));
    expect(20 + deltas.a).toBe(15);
  });

  it('isFinished fires exactly at the target', () => {
    expect(cornhole.isFinished!({ a: 20, b: 10 }, { config: {}, roundCount: 8, playerCount: 2 })).toBe(false);
    expect(cornhole.isFinished!({ a: 21, b: 10 }, { config: {}, roundCount: 9, playerCount: 2 })).toBe(true);
  });

  it('validateRound rejects more than four bags a side', () => {
    const ctx = ctxOf({ a: 0, b: 0 });
    expect(cornhole.validateRound(input([3, 2], [0, 0]), ctx)).toMatch(/bags per round/i);
    expect(cornhole.validateRound(input([-1, 0], [0, 0]), ctx)).toMatch(/negative/i);
    expect(cornhole.validateRound(input([BAGS_PER_SIDE, 0], [1, 3]), ctx)).toBeNull();
  });

  it('describeRound narrates the cancelled result', () => {
    const players = [player('a', 'Aces'), player('b', 'Bombers')];
    const round = { input: input([2, 1], [1, 1]) } as unknown as Round;
    expect(cornhole.describeRound!(round, players)).toBe('🌽 Aces +3 · 7–4');
    const washed = { input: input([1, 0], [1, 0]) } as unknown as Round;
    expect(cornhole.describeRound!(washed, players)).toMatch(/Wash/);
  });
});
