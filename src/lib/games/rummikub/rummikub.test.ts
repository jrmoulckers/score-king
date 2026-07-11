import { describe, expect, it } from 'vitest';
import type { Player, Round } from '../../types';
import {
  DEFAULT_JOKER_VALUE,
  handPenalty,
  potTotal,
  scoreRummikub,
  validateRummikub,
  type RummikubInput,
} from './logic';
import { rummikub } from './index';

const P = ['a', 'b', 'c', 'd'];

function hand(tiles: number, jokers = 0) {
  return { tiles, jokers };
}

function input(winner: string | null, hands: Record<string, { tiles: number; jokers: number }>): RummikubInput {
  return { winner, hands };
}

const sum = (deltas: Record<string, number>) => Object.values(deltas).reduce((a, b) => a + b, 0);

describe('handPenalty', () => {
  it('counts numbered tiles at face value', () => {
    expect(handPenalty(hand(24))).toBe(24);
  });

  it('adds the joker penalty per stranded joker', () => {
    expect(handPenalty(hand(10, 1))).toBe(10 + 30);
    expect(handPenalty(hand(0, 2))).toBe(60);
  });

  it('honours a custom joker value', () => {
    expect(handPenalty(hand(5, 2), 25)).toBe(5 + 50);
    expect(handPenalty(hand(5, 2), 0)).toBe(5);
  });

  it('treats an empty/undefined hand as zero and never goes negative', () => {
    expect(handPenalty(undefined)).toBe(0);
    expect(handPenalty(hand(-9, -3))).toBe(0);
  });

  it('rounds dirty draft numbers', () => {
    expect(handPenalty(hand(12.6 as number, 1))).toBe(13 + 30);
  });

  it('defaults the joker to the official 30', () => {
    expect(DEFAULT_JOKER_VALUE).toBe(30);
    expect(handPenalty(hand(0, 1))).toBe(30);
  });
});

describe('potTotal', () => {
  it('sums every non-winner leftover — the pot the winner scoops', () => {
    expect(potTotal(input('a', { a: hand(0), b: hand(15), c: hand(8) }), ['a', 'b', 'c'])).toBe(23);
  });

  it('folds stranded jokers into the pot at the house joker value', () => {
    expect(potTotal(input('b', { a: hand(12, 1), b: hand(0), c: hand(3) }), ['a', 'b', 'c'])).toBe(45);
    expect(potTotal(input('a', { a: hand(0), b: hand(4, 1) }), ['a', 'b'], 15)).toBe(19);
  });

  it('totals every hand while no winner is marked yet (stakes building)', () => {
    expect(potTotal(input(null, { a: hand(5), b: hand(9), c: hand(0) }), ['a', 'b', 'c'])).toBe(14);
  });

  it('equals the winner’s recorded delta for any winner', () => {
    const hands = { a: hand(13, 2), b: hand(9), c: hand(40), d: hand(1, 1) };
    for (const winner of P) {
      const deltas = scoreRummikub(input(winner, hands), P, 30);
      expect(potTotal(input(winner, hands), P, 30)).toBe(deltas[winner]);
    }
  });
});

describe('scoreRummikub', () => {
  it('gives the winner the sum of opponents’ leftovers and others their negative', () => {
    const deltas = scoreRummikub(input('a', { a: hand(0), b: hand(15), c: hand(8) }), ['a', 'b', 'c']);
    expect(deltas).toEqual({ a: 23, b: -15, c: -8 });
  });

  it('folds stranded jokers into the penalty and the winner’s haul', () => {
    const deltas = scoreRummikub(input('b', { a: hand(12, 1), b: hand(0), c: hand(3) }), ['a', 'b', 'c']);
    // a: 12 + 30 = 42, c: 3  → winner b: 45
    expect(deltas).toEqual({ a: -42, b: 45, c: -3 });
  });

  it('applies a house joker value', () => {
    const deltas = scoreRummikub(input('a', { a: hand(0), b: hand(4, 1) }), ['a', 'b'], 15);
    expect(deltas).toEqual({ a: 19, b: -19 });
  });

  it('returns a delta for every player, including zero-leftover opponents', () => {
    const deltas = scoreRummikub(input('a', { a: hand(0), b: hand(0), c: hand(9) }), ['a', 'b', 'c']);
    expect(Object.keys(deltas).sort()).toEqual(['a', 'b', 'c']);
    expect(deltas).toEqual({ a: 9, b: 0, c: -9 });
  });

  it('works head-to-head (two players)', () => {
    expect(scoreRummikub(input('b', { a: hand(17), b: hand(0) }), ['a', 'b'])).toEqual({ a: -17, b: 17 });
  });

  describe('is zero-sum for every valid winner', () => {
    const scenarios: Array<Record<string, { tiles: number; jokers: number }>> = [
      { a: hand(0), b: hand(15), c: hand(8), d: hand(0) },
      { a: hand(31, 1), b: hand(0), c: hand(2, 2), d: hand(7) },
      { a: hand(0), b: hand(0), c: hand(0), d: hand(0) },
      { a: hand(13, 2), b: hand(9), c: hand(40), d: hand(1, 1) },
    ];
    for (const [i, hands] of scenarios.entries()) {
      for (const winner of P) {
        it(`scenario ${i} won by ${winner}`, () => {
          const deltas = scoreRummikub(input(winner, hands), P, 30);
          expect(sum(deltas)).toBe(0);
          // The winner's positive equals the opponents' combined penalties.
          const owed = P.filter((id) => id !== winner).reduce(
            (t, id) => t + handPenalty(hands[id], 30),
            0,
          );
          expect(deltas[winner]).toBe(owed);
        });
      }
    }
  });

  it('is a zero no-op when no winner is marked', () => {
    const deltas = scoreRummikub(input(null, { a: hand(5), b: hand(9) }), ['a', 'b']);
    expect(deltas).toEqual({ a: 0, b: 0 });
    expect(sum(deltas)).toBe(0);
  });

  it('is a zero no-op when the winner is not among the players', () => {
    const deltas = scoreRummikub(input('z', { a: hand(5), b: hand(9) }), ['a', 'b']);
    expect(deltas).toEqual({ a: 0, b: 0 });
  });
});

describe('validateRummikub', () => {
  it('requires someone to be marked as gone out', () => {
    expect(validateRummikub(input(null, { a: hand(0), b: hand(5) }), ['a', 'b'])).toMatch(/went out/i);
  });

  it('rejects a winner who left the game', () => {
    expect(validateRummikub(input('z', { a: hand(0), b: hand(5) }), ['a', 'b'])).toMatch(/no longer/i);
  });

  it('rejects negative leftovers', () => {
    expect(validateRummikub(input('a', { a: hand(0), b: hand(-1) }), ['a', 'b'])).toMatch(/negative/i);
  });

  it('accepts a well-formed round', () => {
    expect(validateRummikub(input('a', { a: hand(0), b: hand(5), c: hand(12, 1) }), ['a', 'b', 'c'])).toBeNull();
  });
});

describe('rummikub module', () => {
  const players: Player[] = [
    { id: 'a', name: 'Ada', color: '#7c5cff', createdAt: 0 },
    { id: 'b', name: 'Bo', color: '#34d399', createdAt: 0 },
    { id: 'c', name: 'Cy', color: '#f87171', createdAt: 0 },
  ];
  const ctx = (config: Record<string, unknown>) => ({
    game: {} as never,
    players,
    config,
    roundIndex: 0,
    totals: {},
    rounds: [],
  });

  it('is highest-wins with a 2–4 player range', () => {
    expect(rummikub.id).toBe('rummikub');
    expect(rummikub.lowerIsBetter).toBeFalsy();
    expect(rummikub.minPlayers).toBe(2);
    expect(rummikub.maxPlayers).toBe(4);
  });

  it('seeds a fresh round input for every player', () => {
    const fresh = rummikub.createRoundInput(ctx({})) as RummikubInput;
    expect(fresh.winner).toBeNull();
    expect(Object.keys(fresh.hands).sort()).toEqual(['a', 'b', 'c']);
    expect(fresh.hands.a).toEqual({ tiles: 0, jokers: 0 });
  });

  it('scores a round through the module with the configured joker value', () => {
    const round = input('a', { a: hand(0), b: hand(4, 1), c: hand(2) });
    expect(rummikub.scoreRound(round, ctx({ jokerValue: 50 }))).toEqual({ a: 56, b: -54, c: -2 });
  });

  it('validates through the module', () => {
    expect(rummikub.validateRound(input(null, {}), ctx({}))).toMatch(/went out/i);
  });

  it('caps rounds only when playing a fixed number of rounds', () => {
    expect(rummikub.maxRounds!({ endMode: 'rounds', rounds: 6 }, 3)).toBe(6);
    expect(rummikub.maxRounds!({ endMode: 'target', target: 100 }, 3)).toBeNull();
  });

  it('finishes on the target only in target mode', () => {
    const totals = { a: 104, b: 40, c: -10 };
    expect(rummikub.isFinished!(totals, { config: { endMode: 'target', target: 100 }, roundCount: 5, playerCount: 3 })).toBe(true);
    expect(rummikub.isFinished!(totals, { config: { endMode: 'target', target: 120 }, roundCount: 5, playerCount: 3 })).toBe(false);
    expect(rummikub.isFinished!(totals, { config: { endMode: 'rounds', rounds: 4 }, roundCount: 5, playerCount: 3 })).toBe(false);
  });

  it('describes a recorded round with the winner and their haul', () => {
    const round: Round = {
      id: 'r1',
      gameId: 'g1',
      index: 0,
      input: input('a', { a: hand(0), b: hand(15), c: hand(8) }),
      deltas: rummikub.scoreRound(input('a', { a: hand(0), b: hand(15), c: hand(8) }), ctx({})),
      createdAt: 0,
    };
    expect(rummikub.describeRound!(round, players)).toBe('🏆 Ada went out · +23');
  });
});
