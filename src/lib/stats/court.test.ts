import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round } from '../types';
import { computeStats } from './engine';
import { buildCourt, reigningKings, rivalrySpotlight, parityIndex, wallOfShame } from './court';

const DAY = 86_400_000;
const BASE = 1_700_000_000_000;

const player = (id: string): Player => ({ id, name: id, color: '#7c5cff', createdAt: 0 });

function mkGame(p: Partial<Game> & { id: string; type: string; playerIds: ID[]; winnerIds: ID[] }): Game {
  return {
    config: {},
    status: 'finished',
    createdAt: p.finishedAt ?? BASE,
    finishedAt: p.finishedAt ?? BASE,
    roundCount: 1,
    ...p,
  } as Game;
}

function mkRound(gameId: string, deltas: Record<ID, number>): Round {
  return { id: `${gameId}-r0`, gameId, index: 0, input: {}, deltas, createdAt: BASE };
}

/**
 * A, B, C play five games. Skull King (higher wins): A, A, B. Hearts (lower wins): B, B.
 * → B leads overall (3 wins) and is on a 3-game heater; A owns Skull King, B owns Hearts;
 *   C never wins. A vs B is the close rivalry (2–3); C is everyone's victim.
 */
function courtFixture() {
  const players = [player('A'), player('B'), player('C')];
  const games = [
    mkGame({ id: 'g1', type: 'skullking', playerIds: ['A', 'B', 'C'], winnerIds: ['A'], finishedAt: BASE }),
    mkGame({ id: 'g2', type: 'skullking', playerIds: ['A', 'B', 'C'], winnerIds: ['A'], finishedAt: BASE + DAY }),
    mkGame({ id: 'g3', type: 'skullking', playerIds: ['A', 'B', 'C'], winnerIds: ['B'], finishedAt: BASE + 2 * DAY }),
    mkGame({ id: 'g4', type: 'hearts', playerIds: ['A', 'B', 'C'], winnerIds: ['B'], finishedAt: BASE + 3 * DAY }),
    mkGame({ id: 'g5', type: 'hearts', playerIds: ['A', 'B', 'C'], winnerIds: ['B'], finishedAt: BASE + 4 * DAY }),
  ];
  const rounds = [
    mkRound('g1', { A: 30, B: 20, C: 10 }),
    mkRound('g2', { A: 30, B: 20, C: 10 }),
    mkRound('g3', { B: 30, A: 20, C: 10 }),
    mkRound('g4', { B: 5, A: 10, C: 15 }), // hearts: lower is better
    mkRound('g5', { B: 5, A: 10, C: 15 }),
  ];
  return computeStats({ players, games, rounds });
}

describe('court — reigning kings & the belt', () => {
  const res = courtFixture();
  const throne = reigningKings(res);

  it('crowns the overall leader', () => {
    expect(throne.overallId).toBe('B');
    expect(throne.overallWins).toBe(3);
  });

  it('awards the Iron Throne to the longest active streak', () => {
    expect(throne.ironThroneId).toBe('B'); // won the last three
    expect(throne.ironThroneStreak).toBe(3);
  });

  it('names a King per game, most-contested first', () => {
    expect(throne.kings.map((k) => k.gameType)).toEqual(['skullking', 'hearts']);
    const sk = throne.kings.find((k) => k.gameType === 'skullking');
    const hearts = throne.kings.find((k) => k.gameType === 'hearts');
    expect(sk?.holderId).toBe('A');
    expect(sk?.wins).toBe(2);
    expect(hearts?.holderId).toBe('B');
  });

  it('withholds a crown when nobody clears the games floor', () => {
    const strict = reigningKings(res, { minGamesForKing: 99 });
    expect(strict.kings).toEqual([]);
  });
});

describe('court — rivalry spotlight', () => {
  const res = courtFixture();

  it('picks the closest well-played pair as hottest', () => {
    const { hottest } = rivalrySpotlight(res);
    expect(hottest).toBeDefined();
    expect([hottest!.aId, hottest!.bId]).toEqual(['A', 'B']);
    expect(hottest!.games).toBe(5);
    expect(hottest!.aWins).toBe(2);
    expect(hottest!.bWins).toBe(3);
    expect(hottest!.closeness).toBeCloseTo(0.8, 5);
  });

  it('surfaces a one-sided pairing as the mismatch', () => {
    const { mismatch } = rivalrySpotlight(res);
    expect(mismatch).toBeDefined();
    expect(mismatch!.closeness).toBe(0); // C never beats anyone
    expect(mismatch!.games).toBe(5);
  });

  it('needs enough co-games to call a rivalry', () => {
    expect(rivalrySpotlight(res, { minGamesForRivalry: 99 })).toEqual({});
  });
});

describe('court — parity & shame', () => {
  const res = courtFixture();

  it('measures competitiveness as normalized win entropy', () => {
    // wins 2 / 3 / 0 across three players -> H/ln(3)
    expect(parityIndex(res)).toBeCloseTo(0.6126, 3);
  });

  it('reports the cold spell and the still-winless', () => {
    const shame = wallOfShame(res);
    expect(shame.coldestId).toBe('C');
    expect(shame.coldestWinRate).toBe(0);
    expect(shame.winlessIds).toEqual(['C']);
  });
});

describe('court — buildCourt end to end', () => {
  it('assembles the whole view-model in one pass', () => {
    const court = buildCourt(courtFixture());
    expect(court.throne.overallId).toBe('B');
    expect(court.hottestRivalry?.closeness).toBeCloseTo(0.8, 5);
    expect(court.biggestMismatch?.closeness).toBe(0);
    expect(court.parity).toBeGreaterThan(0);
    expect(court.shame.winlessIds).toEqual(['C']);
  });

  it('stays calm with no data', () => {
    const empty = computeStats({ players: [], games: [], rounds: [] });
    const court = buildCourt(empty);
    expect(court.throne.overallId).toBeUndefined();
    expect(court.throne.kings).toEqual([]);
    expect(court.hottestRivalry).toBeUndefined();
    expect(court.parity).toBe(1);
    expect(court.shame.winlessIds).toEqual([]);
  });
});
