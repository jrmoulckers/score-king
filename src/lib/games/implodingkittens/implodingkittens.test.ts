import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import {
  emptyInput,
  finishingPositions,
  isFinished,
  pickMatchLeaders,
  scoreMatch,
  targetWins,
  validateMatch,
  type ImplodingKittensInput,
} from './logic';
import { implodingkittens } from './index';
import { implodingKittensStats } from './stats';

const player = (id: string, name = id): Player => ({ id, name, color: '#7c5cff', createdAt: 0 });

function ctxFor(playerIds: string[], config: Record<string, unknown> = {}): RoundContext {
  return {
    game: {
      id: 'g',
      type: 'implodingkittens',
      config,
      playerIds,
      status: 'active',
      createdAt: 0,
      roundCount: 0,
    } as Game,
    players: playerIds.map((id) => player(id)),
    config,
    roundIndex: 0,
    totals: Object.fromEntries(playerIds.map((id) => [id, 0])),
    rounds: [],
  };
}

function mkRound(gameId: string, index: number, input: ImplodingKittensInput, players: string[]): Round {
  return {
    id: `${gameId}-r${index}`,
    gameId,
    index,
    input,
    deltas: scoreMatch(input, players),
    createdAt: 0,
  };
}

describe('scoreMatch — a match win is +1 to the survivor', () => {
  it('gives the survivor +1 and everyone else 0', () => {
    expect(scoreMatch({ winner: 'A', order: ['C', 'B'] }, ['A', 'B', 'C'])).toEqual({
      A: 1,
      B: 0,
      C: 0,
    });
  });

  it('keys every seat so the whole table appears on the scorecard', () => {
    const out = scoreMatch({ winner: 'B', order: ['A'] }, ['A', 'B']);
    expect(Object.keys(out).sort()).toEqual(['A', 'B']);
    expect(out).toEqual({ A: 0, B: 1 });
  });

  it('scores nobody when there is no survivor', () => {
    expect(scoreMatch({ winner: null, order: [] }, ['A', 'B'])).toEqual({ A: 0, B: 0 });
  });

  it('ignores a winner who is not one of the players', () => {
    expect(scoreMatch({ winner: 'Z', order: [] }, ['A', 'B'])).toEqual({ A: 0, B: 0 });
  });
});

describe('validateMatch — survivor only (track order off)', () => {
  it('requires a survivor', () => {
    expect(validateMatch({ winner: null, order: [] }, ['A', 'B'], false)).toMatch(
      /last player standing/i,
    );
  });

  it('accepts a valid survivor', () => {
    expect(validateMatch({ winner: 'A', order: [] }, ['A', 'B'], false)).toBeNull();
  });

  it('rejects a survivor who is not in the game', () => {
    expect(validateMatch({ winner: 'Z', order: [] }, ['A', 'B'], false)).toMatch(
      /one of the players/i,
    );
  });
});

describe('validateMatch — full elimination order (track order on)', () => {
  it('accepts a complete order with the correct auto-survivor', () => {
    expect(validateMatch({ winner: 'A', order: ['C', 'B'] }, ['A', 'B', 'C'], true)).toBeNull();
  });

  it('nudges while players are still in play', () => {
    expect(validateMatch({ winner: null, order: ['B'] }, ['A', 'B', 'C'], true)).toMatch(
      /2 still in play/,
    );
  });

  it('requires the survivor to be crowned once one remains', () => {
    expect(validateMatch({ winner: null, order: ['C', 'B'] }, ['A', 'B', 'C'], true)).toMatch(
      /last kitten standing/i,
    );
  });

  it('rejects a duplicate implosion', () => {
    expect(validateMatch({ winner: null, order: ['B', 'B'] }, ['A', 'B', 'C'], true)).toMatch(
      /only implode once/i,
    );
  });

  it('rejects an unknown player in the order', () => {
    expect(validateMatch({ winner: null, order: ['Z'] }, ['A', 'B', 'C'], true)).toMatch(
      /isn’t in this game/i,
    );
  });

  it('rejects a survivor who also appears in the elimination pile', () => {
    expect(validateMatch({ winner: 'B', order: ['C', 'B'] }, ['A', 'B', 'C'], true)).toMatch(
      /elimination pile/i,
    );
  });

  it('rejects a match where everybody imploded', () => {
    expect(validateMatch({ winner: null, order: ['A', 'B', 'C'] }, ['A', 'B', 'C'], true)).toMatch(
      /has to survive/i,
    );
  });
});

describe('pickMatchLeaders — most match wins leads', () => {
  it('returns the single leader', () => {
    expect(pickMatchLeaders({ A: 2, B: 1, C: 0 })).toEqual(['A']);
  });

  it('returns everyone tied for the lead', () => {
    expect(pickMatchLeaders({ A: 2, B: 2, C: 1 }).sort()).toEqual(['A', 'B']);
  });

  it('crowns nobody before a match has been won', () => {
    expect(pickMatchLeaders({ A: 0, B: 0 })).toEqual([]);
  });

  it('handles an empty table', () => {
    expect(pickMatchLeaders({})).toEqual([]);
  });
});

describe('finishingPositions — 1 = survivor, first-out finishes last', () => {
  it('orders a full 3-player match', () => {
    expect(finishingPositions({ winner: 'A', order: ['C', 'B'] }, ['A', 'B', 'C'])).toEqual({
      A: 1,
      B: 2,
      C: 3,
    });
  });

  it('only positions the players it knows about', () => {
    expect(finishingPositions({ winner: 'A', order: [] }, ['A', 'B'])).toEqual({ A: 1 });
  });
});

describe('targetWins / isFinished — ends once a player reaches the target', () => {
  it('is open-ended by default', () => {
    expect(targetWins({})).toBe(0);
    expect(targetWins({ targetWins: 0 })).toBe(0);
    expect(isFinished({ A: 5, B: 2 }, {})).toBe(false);
  });

  it('caps to a positive target and coerces strings', () => {
    expect(targetWins({ targetWins: 3 })).toBe(3);
    expect(targetWins({ targetWins: '5' })).toBe(5);
  });

  it('finishes once any player reaches the target', () => {
    expect(isFinished({ A: 2, B: 1 }, { targetWins: 3 })).toBe(false);
    expect(isFinished({ A: 3, B: 1 }, { targetWins: 3 })).toBe(true);
    expect(isFinished({ A: 1, B: 5 }, { targetWins: 3 })).toBe(true);
  });

  it('never finishes when open-ended, no matter the totals', () => {
    expect(isFinished({ A: 99 }, { targetWins: 0 })).toBe(false);
  });
});

describe('implodingkittens module', () => {
  it('has the folder id and expansion-appropriate seat range', () => {
    expect(implodingkittens.id).toBe('implodingkittens');
    expect(implodingkittens.minPlayers).toBe(2);
    expect(implodingkittens.maxPlayers).toBe(6);
    expect(typeof implodingkittens.emoji).toBe('string');
  });

  it('creates a fresh, empty match', () => {
    expect(implodingkittens.createRoundInput(ctxFor(['A', 'B']))).toEqual(emptyInput());
    expect(emptyInput()).toEqual({ winner: null, order: [] });
  });

  it('finishes the game once the configured target win count is reached', () => {
    expect(
      implodingkittens.isFinished!({ A: 2, B: 1 }, { config: { targetWins: 3 }, roundCount: 3, playerCount: 2 }),
    ).toBe(false);
    expect(
      implodingkittens.isFinished!({ A: 3, B: 1 }, { config: { targetWins: 3 }, roundCount: 4, playerCount: 2 }),
    ).toBe(true);
    expect(
      implodingkittens.isFinished!({ A: 10, B: 1 }, { config: { targetWins: 0 }, roundCount: 11, playerCount: 2 }),
    ).toBe(false);
  });

  it('validates & scores a round through the context (order tracked by default)', () => {
    const ctx = ctxFor(['A', 'B', 'C']);
    const input: ImplodingKittensInput = { winner: 'A', order: ['C', 'B'] };
    expect(implodingkittens.validateRound(input, ctx)).toBeNull();
    expect(implodingkittens.scoreRound(input, ctx)).toEqual({ A: 1, B: 0, C: 0 });
  });

  it('honors the track-order-off config', () => {
    const ctx = ctxFor(['A', 'B', 'C'], { trackOrder: false });
    expect(implodingkittens.validateRound({ winner: 'B', order: [] }, ctx)).toBeNull();
  });

  it('picks the leaderboard winner from totals', () => {
    expect(implodingkittens.pickWinners!({ A: 3, B: 1 }, {})).toEqual(['A']);
  });

  it('describes a match with survivor and first-out', () => {
    const players = [player('Ana'), player('Bo'), player('Cy')];
    const round = mkRound('g', 0, { winner: 'Ana', order: ['Cy', 'Bo'] }, ['Ana', 'Bo', 'Cy']);
    const desc = implodingkittens.describeRound!(round, players);
    expect(desc).toContain('Ana');
    expect(desc).toContain('👑');
    expect(desc).toMatch(/Cy out first/);
  });
});

describe('implodingKittensStats', () => {
  const games: Game[] = [
    {
      id: 'g',
      type: 'implodingkittens',
      config: {},
      playerIds: ['A', 'B', 'C'],
      status: 'finished',
      createdAt: 0,
      roundCount: 2,
    } as Game,
  ];
  const rounds: Round[] = [
    mkRound('g', 0, { winner: 'A', order: ['C', 'B'] }, ['A', 'B', 'C']),
    mkRound('g', 1, { winner: 'B', order: ['A', 'C'] }, ['A', 'B', 'C']),
  ];
  const out = implodingKittensStats({ games, rounds, players: [], canonical: (id: ID) => id });

  it('counts first-to-implode per player', () => {
    expect(out.perPlayer?.['C']?.find((m) => m.key === 'ik_first')?.value).toBe('1');
    expect(out.perPlayer?.['A']?.find((m) => m.key === 'ik_first')?.value).toBe('1');
  });

  it('counts runner-up finishes', () => {
    expect(out.perPlayer?.['B']?.find((m) => m.key === 'ik_runnerup')?.value).toBe('1');
    expect(out.perPlayer?.['C']?.find((m) => m.key === 'ik_runnerup')?.value).toBe('1');
  });

  it('averages finishing position', () => {
    // A finished 1st then 3rd -> avg 2; B finished 2nd then 1st -> avg 1.5
    expect(out.perPlayer?.['A']?.find((m) => m.key === 'ik_finish')?.value).toBe('2');
    expect(out.perPlayer?.['B']?.find((m) => m.key === 'ik_finish')?.value).toBe('1.5');
  });

  it('totals kittens imploded globally', () => {
    expect(out.global?.find((m) => m.key === 'ik_boom')?.value).toBe('4');
  });

  it('maps merged players to their canonical id', () => {
    const merged = implodingKittensStats({
      games,
      rounds: [mkRound('g', 0, { winner: 'A', order: ['C2', 'B'] }, ['A', 'B', 'C2'])],
      players: [],
      canonical: (id: ID) => (id === 'C2' ? 'C' : id),
    });
    expect(merged.perPlayer?.['C']?.find((m) => m.key === 'ik_first')?.value).toBe('1');
  });

  it('contributes nothing when elimination order is not tracked', () => {
    const noOrder = implodingKittensStats({
      games,
      rounds: [mkRound('g', 0, { winner: 'A', order: [] }, ['A', 'B', 'C'])],
      players: [],
      canonical: (id: ID) => id,
    });
    expect(noOrder.perPlayer).toEqual({});
    expect(noOrder.global).toEqual([]);
  });

  it('reports the longest run of back-to-back match wins', () => {
    const streakRounds: Round[] = [
      mkRound('g', 0, { winner: 'A', order: ['C', 'B'] }, ['A', 'B', 'C']),
      mkRound('g', 1, { winner: 'A', order: ['B', 'C'] }, ['A', 'B', 'C']),
      mkRound('g', 2, { winner: 'B', order: ['C', 'A'] }, ['A', 'B', 'C']),
    ];
    const streakOut = implodingKittensStats({
      games,
      rounds: streakRounds,
      players: [],
      canonical: (id: ID) => id,
    });
    expect(streakOut.perPlayer?.['A']?.find((m) => m.key === 'ik_streak')?.value).toBe('2');
    // A single win isn't a streak, so B (one win) gets no streak metric.
    expect(streakOut.perPlayer?.['B']?.find((m) => m.key === 'ik_streak')).toBeUndefined();
  });
});
