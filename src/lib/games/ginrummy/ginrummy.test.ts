import { describe, expect, it } from 'vitest';
import type { ID, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import { ginRummy } from './index';
import { ginRummyStats } from './stats';
import {
  DEFAULT_CONFIG,
  boxCounts,
  describeHand,
  isFinished,
  opponentOf,
  readConfig,
  scoreHand,
  scoreRound,
  validateRound,
  type GinRummyInput,
} from './logic';

const players = [
  { id: 'a', name: 'Ada', color: '#111', createdAt: 0 },
  { id: 'b', name: 'Bo', color: '#222', createdAt: 0 },
];

function mk(partial: Partial<GinRummyInput> = {}): GinRummyInput {
  return { knockerId: null, gin: false, deadwood: { a: 0, b: 0 }, ...partial };
}

function round(index: number, input: GinRummyInput, deltas: Record<ID, number>): Round {
  return { id: `r${index}`, gameId: 'g1', index, input, deltas, createdAt: 0 };
}

describe('readConfig', () => {
  it('falls back to defaults for missing/garbage values', () => {
    expect(readConfig({})).toEqual(DEFAULT_CONFIG);
    expect(readConfig({ target: -5, ginBonus: 'nope' })).toEqual(DEFAULT_CONFIG);
  });

  it('reads valid overrides', () => {
    expect(readConfig({ target: 200, shutoutDoubling: false })).toMatchObject({
      target: 200,
      shutoutDoubling: false,
    });
  });
});

describe('opponentOf', () => {
  it('returns the other seat', () => {
    expect(opponentOf(players, 'a')).toBe('b');
    expect(opponentOf(players, 'b')).toBe('a');
  });
  it('returns null for a null or unknown id', () => {
    expect(opponentOf(players, null)).toBeNull();
    expect(opponentOf(players, 'z')).toBeNull();
  });
});

describe('scoreHand', () => {
  it('returns null while no one has knocked', () => {
    expect(scoreHand(mk(), players, {})).toBeNull();
  });

  it('scores a plain knock as the deadwood difference', () => {
    const hand = scoreHand(mk({ knockerId: 'a', deadwood: { a: 4, b: 15 } }), players, {});
    expect(hand).toMatchObject({ outcome: 'knock', margin: 11, deltas: { a: 11, b: 0 } });
  });

  it('scores gin as opponent deadwood plus the gin bonus', () => {
    const hand = scoreHand(mk({ knockerId: 'a', gin: true, deadwood: { a: 0, b: 18 } }), players, {});
    expect(hand).toMatchObject({ outcome: 'gin', margin: 18 + 25, deltas: { a: 43, b: 0 } });
  });

  it('ignores a nonzero knocker deadwood entry when gin is marked', () => {
    const hand = scoreHand(mk({ knockerId: 'a', gin: true, deadwood: { a: 7, b: 18 } }), players, {});
    expect(hand?.knockerDeadwood).toBe(0);
    expect(hand?.margin).toBe(18 + 25);
  });

  it('flips to an undercut when the opponent matches the knocker exactly', () => {
    const hand = scoreHand(mk({ knockerId: 'a', deadwood: { a: 8, b: 8 } }), players, {});
    expect(hand).toMatchObject({ outcome: 'undercut', margin: 20, deltas: { a: 0, b: 20 } });
  });

  it('flips to an undercut when the opponent beats the knocker', () => {
    const hand = scoreHand(mk({ knockerId: 'a', deadwood: { a: 9, b: 3 } }), players, {});
    expect(hand).toMatchObject({ outcome: 'undercut', margin: 9 - 3 + 20, deltas: { a: 0, b: 26 } });
  });

  it('honors custom gin/undercut bonuses from config', () => {
    const gin = scoreHand(
      mk({ knockerId: 'a', gin: true, deadwood: { a: 0, b: 10 } }),
      players,
      { ginBonus: 40 },
    );
    expect(gin?.margin).toBe(50);

    const cut = scoreHand(mk({ knockerId: 'a', deadwood: { a: 5, b: 5 } }), players, {
      undercutBonus: 5,
    });
    expect(cut?.margin).toBe(5);
  });
});

describe('validateRound', () => {
  it('requires exactly two players', () => {
    expect(validateRound(mk({ knockerId: 'a' }), [players[0]], {})).toMatch(/two-handed/);
  });

  it('requires a knocker', () => {
    expect(validateRound(mk(), players, {})).toMatch(/knocked/);
  });

  it('rejects negative deadwood', () => {
    expect(
      validateRound(mk({ knockerId: 'a', deadwood: { a: -1, b: 4 } }), players, {}),
    ).toMatch(/negative/);
  });

  it('rejects a knock with too much deadwood', () => {
    expect(
      validateRound(mk({ knockerId: 'a', deadwood: { a: 15, b: 20 } }), players, {}),
    ).toMatch(/too much to knock/);
  });

  it('allows any knocker deadwood when gin is marked', () => {
    expect(
      validateRound(mk({ knockerId: 'a', gin: true, deadwood: { a: 0, b: 20 } }), players, {}),
    ).toBeNull();
  });

  it('accepts a legal knock', () => {
    expect(
      validateRound(mk({ knockerId: 'a', deadwood: { a: 10, b: 20 } }), players, {}),
    ).toBeNull();
  });

  it('honors a custom knock ceiling', () => {
    expect(
      validateRound(mk({ knockerId: 'a', deadwood: { a: 12, b: 20 } }), players, {
        maxKnockDeadwood: 15,
      }),
    ).toBeNull();
  });
});

describe('scoreRound — mid-game (no settlement)', () => {
  it('returns the raw hand deltas when nobody has reached the target', () => {
    const input = mk({ knockerId: 'a', deadwood: { a: 4, b: 15 } });
    const deltas = scoreRound(input, players, {}, { a: 0, b: 0 }, []);
    expect(deltas).toEqual({ a: 11, b: 0 });
  });
});

describe('scoreRound — settlement at game end', () => {
  it('adds the game bonus and line bonuses once the target is crossed', () => {
    const prior: Round[] = [
      round(0, mk({ knockerId: 'a', deadwood: { a: 2, b: 20 } }), { a: 18, b: 0 }), // a wins box 1
      round(1, mk({ knockerId: 'b', deadwood: { b: 3, a: 25 } }), { a: 0, b: 22 }), // b wins box 1
    ];
    // a is at 18, b is at 22 going into this hand. a goes gin for 18+25=43,
    // pushing a to 61 — short of the default target (100), so no settlement yet.
    const midInput = mk({ knockerId: 'a', gin: true, deadwood: { a: 0, b: 18 } });
    const mid = scoreRound(midInput, players, {}, { a: 18, b: 22 }, prior);
    expect(mid).toEqual({ a: 43, b: 0 });

    // Now a knocks big enough to cross 100 from 61: deadwood gap of 40+ does it.
    const finishing = round(2, midInput, mid);
    const finalInput = mk({ knockerId: 'a', deadwood: { a: 0, b: 45 } });
    const final = scoreRound(finalInput, players, {}, { a: 61, b: 22 }, [...prior, finishing]);

    // Raw hand margin: 45. a now has 2 prior boxes + this hand = 3 boxes * 25 = 75.
    // b has 1 prior box * 25 = 25. a also gets the +100 game bonus (no shutout,
    // b has non-zero raw total).
    expect(final.a).toBe(45 + 75 + 100);
    expect(final.b).toBe(25);
  });

  it('doubles the game bonus on a shutout (loser scored zero)', () => {
    // b never scores a single hand-point; a gins for exactly the target.
    const input = mk({ knockerId: 'a', gin: true, deadwood: { a: 0, b: 75 } });
    const deltas = scoreRound(input, players, {}, { a: 0, b: 0 }, []);
    // margin = 75 + 25 = 100, hits the target in one hand. b's raw total is 0 → shutout.
    expect(deltas.a).toBe(100 + 25 /* one box */ + 200 /* doubled game bonus */);
    expect(deltas.b).toBe(0);
  });

  it('does not double the bonus when shutoutDoubling is disabled', () => {
    const input = mk({ knockerId: 'a', gin: true, deadwood: { a: 0, b: 75 } });
    const deltas = scoreRound(input, players, { shutoutDoubling: false }, { a: 0, b: 0 }, []);
    expect(deltas.a).toBe(100 + 25 + 100);
  });
});

describe('boxCounts', () => {
  it('replays winners from stored inputs, ignoring bonus-laden deltas', () => {
    const rounds: Round[] = [
      round(0, mk({ knockerId: 'a', deadwood: { a: 2, b: 20 } }), { a: 18, b: 0 }),
      round(1, mk({ knockerId: 'b', deadwood: { b: 3, a: 25 } }), { a: 0, b: 22 }),
      // A settlement-laden hand where b's stored delta (line bonus for prior
      // boxes) happens to exceed a's raw hand delta — boxCounts must still
      // credit the hand to whoever actually won it (a, via gin).
      round(2, mk({ knockerId: 'a', gin: true, deadwood: { a: 0, b: 10 } }), { a: 5, b: 999 }),
    ];
    expect(boxCounts(rounds, players, {})).toEqual({ a: 2, b: 1 });
  });
});

describe('isFinished', () => {
  it('is true once any total reaches the target', () => {
    expect(isFinished({ a: 99, b: 0 }, {})).toBe(false);
    expect(isFinished({ a: 100, b: 0 }, {})).toBe(true);
  });
});

describe('describeHand', () => {
  it('describes gin, knock and undercut hands', () => {
    expect(
      describeHand(mk({ knockerId: 'a', gin: true }), players, { a: 43, b: 0 }),
    ).toMatch(/gin/i);
    expect(
      describeHand(mk({ knockerId: 'a', deadwood: { a: 2, b: 10 } }), players, { a: 8, b: 0 }),
    ).toMatch(/knocked/i);
    expect(
      describeHand(mk({ knockerId: 'a', deadwood: { a: 8, b: 2 } }), players, { a: 0, b: 26 }),
    ).toMatch(/undercut/i);
    expect(describeHand(undefined, players)).toMatch(/not recorded/i);
  });
});

describe('ginRummy module', () => {
  function ctx(config: Record<string, unknown> = {}, overrides: Partial<RoundContext> = {}) {
    return {
      game: { id: 'g1', type: 'ginrummy', config, playerIds: ['a', 'b'], status: 'active' },
      players,
      config,
      roundIndex: 0,
      totals: { a: 0, b: 0 },
      rounds: [],
      ...overrides,
    } as unknown as RoundContext;
  }

  it('creates an empty input for both seats', () => {
    const input = ginRummy.createRoundInput(ctx()) as GinRummyInput;
    expect(input.knockerId).toBeNull();
    expect(input.deadwood).toEqual({ a: 0, b: 0 });
  });

  it('validates and scores a hand end to end', () => {
    const input: GinRummyInput = { knockerId: 'a', gin: false, deadwood: { a: 3, b: 20 } };
    expect(ginRummy.validateRound(input, ctx())).toBeNull();
    expect(ginRummy.scoreRound(input, ctx())).toEqual({ a: 17, b: 0 });
  });

  it('rejects a game with more than two players', () => {
    const threePlayers = [...players, { id: 'c', name: 'Cy', color: '#333', createdAt: 0 }];
    const input: GinRummyInput = { knockerId: 'a', gin: false, deadwood: { a: 3, b: 20 } };
    expect(
      ginRummy.validateRound(input, ctx({}, { players: threePlayers } as Partial<RoundContext>)),
    ).toMatch(/two-handed/);
  });

  it('reports finished once a total reaches the target', () => {
    expect(ginRummy.isFinished?.({ a: 100, b: 0 }, { config: {}, roundCount: 1, playerCount: 2 })).toBe(
      true,
    );
    expect(ginRummy.isFinished?.({ a: 40, b: 0 }, { config: {}, roundCount: 1, playerCount: 2 })).toBe(
      false,
    );
  });

  it('picks the higher-total player as the default winner', () => {
    expect(defaultWinners(ginRummy, { a: 130, b: 40 })).toEqual(['a']);
  });

  it('flags a gin hand as good and an undercut as warn in the scorecard', () => {
    const ginInput: GinRummyInput = { knockerId: 'a', gin: true, deadwood: { a: 0, b: 10 } };
    const ginRound = round(0, ginInput, { a: 35, b: 0 });
    expect(ginRummy.roundCellTone?.(ginRound, 'a')).toMatchObject({ tone: 'good' });

    const cutInput: GinRummyInput = { knockerId: 'a', gin: false, deadwood: { a: 5, b: 5 } };
    const cutRound = round(1, cutInput, { a: 0, b: 20 });
    expect(ginRummy.roundCellTone?.(cutRound, 'b')).toMatchObject({ tone: 'warn' });
  });

  it('describes a recorded round', () => {
    const input: GinRummyInput = { knockerId: 'a', gin: true, deadwood: { a: 0, b: 10 } };
    const r = round(0, input, { a: 35, b: 0 });
    expect(ginRummy.describeRound?.(r, players)).toMatch(/gin/i);
  });
});

describe('ginRummyStats', () => {
  it('tallies gins, knocks, undercuts and games won across a finished game', () => {
    const game = {
      id: 'g1',
      type: 'ginrummy',
      config: {},
      playerIds: ['a', 'b'] as ID[],
      status: 'finished' as const,
      createdAt: 0,
      roundCount: 2,
    };
    const rounds: Round[] = [
      round(0, mk({ knockerId: 'a', deadwood: { a: 2, b: 20 } }), { a: 18, b: 0 }),
      round(
        1,
        mk({ knockerId: 'a', gin: true, deadwood: { a: 0, b: 30 } }),
        { a: 55 + 100, b: 0 },
      ),
    ];
    const result = ginRummyStats({
      games: [game],
      rounds,
      players,
      canonical: (id) => id,
    });
    expect(result.perPlayer?.a).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'gr_games' })]),
    );
    expect(result.perPlayer?.a).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'gr_gins' })]),
    );
    expect(result.global).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'gr_gins_all' })]),
    );
  });
});
