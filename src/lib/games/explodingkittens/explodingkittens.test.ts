import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import {
  emptyInput,
  defuseTotal,
  finishingPositions,
  matchLimit,
  pickMatchLeaders,
  scoreMatch,
  validateMatch,
  type EKInput,
} from './logic';
import { explodingkittens } from './index';
import { explodingKittensStats } from './stats';

const player = (id: string, name = id): Player => ({ id, name, color: '#7c5cff', createdAt: 0 });

function ctxFor(playerIds: string[], config: Record<string, unknown> = {}): RoundContext {
  return {
    game: {
      id: 'g',
      type: 'explodingkittens',
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

function mkRound(gameId: string, index: number, input: EKInput, players: string[]): Round {
  return { id: `${gameId}-r${index}`, gameId, index, input, deltas: scoreMatch(input, players), createdAt: 0 };
}

describe('scoreMatch — a match win is +1 to the survivor', () => {
  it('gives the survivor +1 and everyone else 0', () => {
    expect(scoreMatch({ winner: 'A', order: ['C', 'B'] }, ['A', 'B', 'C'])).toEqual({ A: 1, B: 0, C: 0 });
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
    expect(validateMatch({ winner: null, order: [] }, ['A', 'B'], false)).toMatch(/last player standing/i);
  });

  it('accepts a valid survivor', () => {
    expect(validateMatch({ winner: 'A', order: [] }, ['A', 'B'], false)).toBeNull();
  });

  it('rejects a survivor who is not in the game', () => {
    expect(validateMatch({ winner: 'Z', order: [] }, ['A', 'B'], false)).toMatch(/one of the players/i);
  });
});

describe('validateMatch — full elimination order (track order on)', () => {
  it('accepts a complete order with the correct auto-survivor', () => {
    expect(validateMatch({ winner: 'A', order: ['C', 'B'] }, ['A', 'B', 'C'], true)).toBeNull();
  });

  it('nudges while players are still in play', () => {
    expect(validateMatch({ winner: null, order: ['B'] }, ['A', 'B', 'C'], true)).toMatch(/2 still in play/);
  });

  it('requires the survivor to be crowned once one remains', () => {
    expect(validateMatch({ winner: null, order: ['C', 'B'] }, ['A', 'B', 'C'], true)).toMatch(/last kitten standing/i);
  });

  it('rejects a duplicate explosion', () => {
    expect(validateMatch({ winner: null, order: ['B', 'B'] }, ['A', 'B', 'C'], true)).toMatch(/only explode once/i);
  });

  it('rejects an unknown player in the order', () => {
    expect(validateMatch({ winner: null, order: ['Z'] }, ['A', 'B', 'C'], true)).toMatch(/isn’t in this game/i);
  });

  it('rejects a survivor who also appears in the elimination pile', () => {
    expect(validateMatch({ winner: 'B', order: ['C', 'B'] }, ['A', 'B', 'C'], true)).toMatch(/elimination pile/i);
  });

  it('rejects a match where everybody exploded', () => {
    expect(validateMatch({ winner: null, order: ['A', 'B', 'C'] }, ['A', 'B', 'C'], true)).toMatch(/has to survive/i);
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
    expect(finishingPositions({ winner: 'A', order: ['C', 'B'] }, ['A', 'B', 'C'])).toEqual({ A: 1, B: 2, C: 3 });
  });

  it('only positions the players it knows about', () => {
    expect(finishingPositions({ winner: 'A', order: [] }, ['A', 'B'])).toEqual({ A: 1 });
  });
});

describe('matchLimit', () => {
  it('is open-ended by default', () => {
    expect(matchLimit({})).toBeNull();
    expect(matchLimit({ matches: 0 })).toBeNull();
  });

  it('caps to a positive match count', () => {
    expect(matchLimit({ matches: 5 })).toBe(5);
    expect(matchLimit({ matches: '3' })).toBe(3);
  });
});

describe('explodingkittens module', () => {
  it('has the folder id and party-friendly seat range', () => {
    expect(explodingkittens.id).toBe('explodingkittens');
    expect(explodingkittens.minPlayers).toBe(2);
    expect(explodingkittens.maxPlayers).toBe(10);
    expect(typeof explodingkittens.emoji).toBe('string');
  });

  it('creates a fresh, empty match', () => {
    expect(explodingkittens.createRoundInput(ctxFor(['A', 'B']))).toEqual(emptyInput());
    expect(emptyInput()).toEqual({ winner: null, order: [] });
  });

  it('caps rounds by the matches config', () => {
    expect(explodingkittens.maxRounds!({ matches: 3 }, 4)).toBe(3);
    expect(explodingkittens.maxRounds!({ matches: 0 }, 4)).toBeNull();
  });

  it('validates & scores a round through the context (order tracked by default)', () => {
    const ctx = ctxFor(['A', 'B', 'C']);
    const input: EKInput = { winner: 'A', order: ['C', 'B'] };
    expect(explodingkittens.validateRound(input, ctx)).toBeNull();
    expect(explodingkittens.scoreRound(input, ctx)).toEqual({ A: 1, B: 0, C: 0 });
  });

  it('honors the track-order-off config', () => {
    const ctx = ctxFor(['A', 'B', 'C'], { trackOrder: false });
    expect(explodingkittens.validateRound({ winner: 'B', order: [] }, ctx)).toBeNull();
  });

  it('picks the leaderboard winner from totals', () => {
    expect(explodingkittens.pickWinners!({ A: 3, B: 1 }, {})).toEqual(['A']);
  });

  it('describes a match with survivor and first-out', () => {
    const players = [player('Ana'), player('Bo'), player('Cy')];
    const round = mkRound('g', 0, { winner: 'Ana', order: ['Cy', 'Bo'] }, ['Ana', 'Bo', 'Cy']);
    const desc = explodingkittens.describeRound!(round, players);
    expect(desc).toContain('Ana');
    expect(desc).toContain('👑');
    expect(desc).toMatch(/Cy out first/);
  });
});

describe('explodingKittensStats', () => {
  const games: Game[] = [
    { id: 'g', type: 'explodingkittens', config: {}, playerIds: ['A', 'B', 'C'], status: 'finished', createdAt: 0, roundCount: 2 } as Game,
  ];
  const rounds: Round[] = [
    mkRound('g', 0, { winner: 'A', order: ['C', 'B'] }, ['A', 'B', 'C']),
    mkRound('g', 1, { winner: 'B', order: ['A', 'C'] }, ['A', 'B', 'C']),
  ];
  const out = explodingKittensStats({ games, rounds, players: [], canonical: (id: ID) => id });

  it('counts first-to-explode per player', () => {
    expect(out.perPlayer?.['C']?.find((m) => m.key === 'ek_first')?.value).toBe('1');
    expect(out.perPlayer?.['A']?.find((m) => m.key === 'ek_first')?.value).toBe('1');
  });

  it('counts runner-up finishes', () => {
    expect(out.perPlayer?.['B']?.find((m) => m.key === 'ek_runnerup')?.value).toBe('1');
    expect(out.perPlayer?.['C']?.find((m) => m.key === 'ek_runnerup')?.value).toBe('1');
  });

  it('averages finishing position', () => {
    // A finished 1st then 3rd -> avg 2; B finished 2nd then 1st -> avg 1.5
    expect(out.perPlayer?.['A']?.find((m) => m.key === 'ek_finish')?.value).toBe('2');
    expect(out.perPlayer?.['B']?.find((m) => m.key === 'ek_finish')?.value).toBe('1.5');
  });

  it('totals kittens exploded globally', () => {
    expect(out.global?.find((m) => m.key === 'ek_boom')?.value).toBe('4');
  });

  it('maps merged players to their canonical id', () => {
    const merged = explodingKittensStats({
      games,
      rounds: [mkRound('g', 0, { winner: 'A', order: ['C2', 'B'] }, ['A', 'B', 'C2'])],
      players: [],
      canonical: (id: ID) => (id === 'C2' ? 'C' : id),
    });
    expect(merged.perPlayer?.['C']?.find((m) => m.key === 'ek_first')?.value).toBe('1');
  });

  it('contributes nothing when elimination order is not tracked', () => {
    const noOrder = explodingKittensStats({
      games,
      rounds: [mkRound('g', 0, { winner: 'A', order: [] }, ['A', 'B', 'C'])],
      players: [],
      canonical: (id: ID) => id,
    });
    expect(noOrder.perPlayer).toEqual({});
    expect(noOrder.global).toEqual([]);
  });
});

describe('defuseTotal — sums the deaths cheated in a match', () => {
  it('is zero when defuses are untracked', () => {
    expect(defuseTotal({ winner: 'A', order: ['B'] })).toBe(0);
  });

  it('sums per-player defuses, flooring and clamping stray values', () => {
    expect(defuseTotal({ winner: 'A', order: ['B'], defuses: { A: 2, B: 1 } })).toBe(3);
    expect(defuseTotal({ winner: 'A', order: [], defuses: { A: 1.9, B: -3 } })).toBe(1);
  });
});

describe('defuses never change scoring — the survivor still banks exactly +1', () => {
  it('ignores defuses when scoring the match', () => {
    expect(scoreMatch({ winner: 'A', order: ['C', 'B'], defuses: { B: 3, A: 1 } }, ['A', 'B', 'C'])).toEqual({
      A: 1,
      B: 0,
      C: 0,
    });
  });
});

describe('validateMatch — defuse guards', () => {
  it('accepts a match with valid per-player defuses', () => {
    expect(validateMatch({ winner: 'A', order: ['C', 'B'], defuses: { B: 2, A: 1 } }, ['A', 'B', 'C'], true)).toBeNull();
  });

  it('rejects a defuse logged for an unknown player', () => {
    expect(validateMatch({ winner: 'A', order: [], defuses: { Z: 1 } }, ['A', 'B'], false)).toMatch(/isn’t in this game/i);
  });

  it('rejects a negative defuse count', () => {
    expect(validateMatch({ winner: 'A', order: [], defuses: { B: -1 } }, ['A', 'B'], false)).toMatch(/can’t be negative/i);
  });
});

describe('explodingKittensStats — defuses & win streaks', () => {
  const games: Game[] = [
    { id: 'g', type: 'explodingkittens', config: {}, playerIds: ['A', 'B', 'C'], status: 'finished', createdAt: 0, roundCount: 3 } as Game,
  ];

  it('totals deaths cheated per player and globally', () => {
    const rounds: Round[] = [
      mkRound('g', 0, { winner: 'A', order: ['C', 'B'], defuses: { A: 2, B: 1 } }, ['A', 'B', 'C']),
      mkRound('g', 1, { winner: 'B', order: ['A', 'C'], defuses: { A: 1 } }, ['A', 'B', 'C']),
    ];
    const out = explodingKittensStats({ games, rounds, players: [], canonical: (id: ID) => id });
    expect(out.perPlayer?.['A']?.find((m) => m.key === 'ek_defuse')?.value).toBe('3');
    expect(out.perPlayer?.['B']?.find((m) => m.key === 'ek_defuse')?.value).toBe('1');
    expect(out.global?.find((m) => m.key === 'ek_defused')?.value).toBe('4');
  });

  it('reports the longest run of back-to-back match wins', () => {
    const rounds: Round[] = [
      mkRound('g', 0, { winner: 'A', order: ['C', 'B'] }, ['A', 'B', 'C']),
      mkRound('g', 1, { winner: 'A', order: ['B', 'C'] }, ['A', 'B', 'C']),
      mkRound('g', 2, { winner: 'B', order: ['C', 'A'] }, ['A', 'B', 'C']),
    ];
    const out = explodingKittensStats({ games, rounds, players: [], canonical: (id: ID) => id });
    expect(out.perPlayer?.['A']?.find((m) => m.key === 'ek_streak')?.value).toBe('2');
    // A single win isn't a streak, so B (one win) gets no streak metric.
    expect(out.perPlayer?.['B']?.find((m) => m.key === 'ek_streak')).toBeUndefined();
  });

  it('resets a streak when another kitten wins, even in reversed round order', () => {
    // Fed out of order to prove the stat sorts by round index, not array order.
    const rounds: Round[] = [
      mkRound('g', 2, { winner: 'A', order: ['B', 'C'] }, ['A', 'B', 'C']),
      mkRound('g', 0, { winner: 'A', order: ['C', 'B'] }, ['A', 'B', 'C']),
      mkRound('g', 1, { winner: 'B', order: ['A', 'C'] }, ['A', 'B', 'C']),
    ];
    const out = explodingKittensStats({ games, rounds, players: [], canonical: (id: ID) => id });
    // A wins rounds 0 and 2 but B wins round 1 between them → best streak is 1, no metric.
    expect(out.perPlayer?.['A']?.find((m) => m.key === 'ek_streak')).toBeUndefined();
  });
});
