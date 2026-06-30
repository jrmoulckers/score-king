import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round } from '../types';
import { computeStats, type ComputeOptions } from './engine';
import { compareStats } from './compare';
import { buildAliasMap, canonicalizer } from './identity';
import { skullkingStats } from '../games/skullking/stats';
import { heartsStats } from '../games/hearts/stats';

const DAY = 86_400_000;
const BASE = 1_700_000_000_000;

const player = (id: string, name = id): Player => ({ id, name, color: '#7c5cff', createdAt: 0 });

function mkGame(p: Partial<Game> & { id: string; playerIds: ID[] }): Game {
  return {
    type: 'tally',
    config: {},
    status: 'finished',
    createdAt: p.finishedAt ?? BASE,
    finishedAt: p.finishedAt ?? BASE,
    roundCount: 0,
    ...p,
  } as Game;
}

function mkRound(gameId: string, index: number, deltas: Record<ID, number>, input: unknown = {}): Round {
  return { id: `${gameId}-r${index}`, gameId, index, input, deltas, createdAt: BASE };
}

/** Three games: A wins wire-to-wire (g1), B wins from behind (g2), A wins a lower-is-better game (g3). */
function trio() {
  const players = [player('A'), player('B'), player('C')];
  const g1 = mkGame({ id: 'g1', playerIds: ['A', 'B', 'C'], winnerIds: ['A'], roundCount: 3, finishedAt: BASE });
  const g2 = mkGame({ id: 'g2', playerIds: ['A', 'B', 'C'], winnerIds: ['B'], roundCount: 3, finishedAt: BASE + 2 * DAY });
  const g3 = mkGame({ id: 'g3', type: 'hearts', playerIds: ['A', 'B', 'C'], winnerIds: ['A'], roundCount: 1, finishedAt: BASE + 4 * DAY });
  const games = [g1, g2, g3];
  const rounds = [
    mkRound('g1', 0, { A: 10, B: 5, C: 5 }),
    mkRound('g1', 1, { A: 10, B: 10, C: 5 }),
    mkRound('g1', 2, { A: 10, B: 5, C: 0 }),
    mkRound('g2', 0, { A: 10, B: 0, C: 5 }),
    mkRound('g2', 1, { A: 0, B: 15, C: 5 }),
    mkRound('g2', 2, { A: 0, B: 10, C: 5 }),
    mkRound('g3', 0, { A: 5, B: 20, C: 15 }),
  ];
  return { players, games, rounds };
}

describe('computeStats — counting & rates', () => {
  const { players, games, rounds } = trio();
  const res = computeStats({ players, games, rounds });

  it('counts played / wins / win rate per member', () => {
    const a = res.perPlayer['A'];
    expect(a.played).toBe(3);
    expect(a.wins).toBe(2);
    expect(a.winRate).toBeCloseTo(2 / 3, 5);
    expect(res.perPlayer['B'].wins).toBe(1);
    expect(res.perPlayer['C'].wins).toBe(0);
  });

  it('splits wins by game type', () => {
    expect(res.perPlayer['A'].byGameType['tally']).toMatchObject({ played: 2, wins: 1 });
    expect(res.perPlayer['A'].byGameType['hearts']).toMatchObject({ played: 1, wins: 1 });
  });

  it('totals points across all rounds (canonical)', () => {
    expect(res.perPlayer['A'].points).toBe(45); // 30 + 10 + 5
    expect(res.perPlayer['B'].points).toBe(65); // 20 + 25 + 20
  });

  it('builds a leaderboard ordered by wins', () => {
    expect(res.leaderboard.map((r) => r.playerId)).toEqual(['A', 'B', 'C']);
    expect(res.totals).toMatchObject({ finishedGames: 3, gameNights: 3 });
  });
});

describe('computeStats — finishing position & podium', () => {
  const { players, games, rounds } = trio();
  const res = computeStats({ players, games, rounds });

  it('averages finishing position (1 = first)', () => {
    // A finished 1st, 3rd, 1st
    expect(res.perPlayer['A'].avgFinish).toBeCloseTo(5 / 3, 5);
    expect(res.perPlayer['A'].bestFinish).toBe(1);
  });

  it('excludes last place from podium at a small table', () => {
    // top-2 of 3 players: A is 1st,3rd,1st -> 2 podiums (the 3rd doesn't count)
    expect(res.perPlayer['A'].podiums).toBe(2);
  });
});

describe('computeStats — streaks', () => {
  const { players, games, rounds } = trio();
  const res = computeStats({ players, games, rounds });

  it('tracks current and longest win streak chronologically', () => {
    // A: win, loss, win -> current 1, longest 1
    expect(res.perPlayer['A'].currentStreak).toBe(1);
    expect(res.perPlayer['A'].longestStreak).toBe(1);
    // C never wins
    expect(res.perPlayer['C'].currentStreak).toBe(0);
    expect(res.perPlayer['C'].longestStreak).toBe(0);
  });
});

describe('computeStats — comeback vs wire-to-wire', () => {
  const { players, games, rounds } = trio();
  const res = computeStats({ players, games, rounds });

  it('classifies A’s wins as wire-to-wire', () => {
    expect(res.perPlayer['A'].wireToWireWins).toBe(2);
    expect(res.perPlayer['A'].comebackWins).toBe(0);
  });

  it('classifies B’s win as a comeback', () => {
    expect(res.perPlayer['B'].comebackWins).toBe(1);
    expect(res.perPlayer['B'].wireToWireWins).toBe(0);
  });
});

describe('computeStats — head to head', () => {
  const { players, games, rounds } = trio();
  const res = computeStats({ players, games, rounds });

  it('records co-finished results and never self-pairs', () => {
    expect(res.perPlayer['A'].headToHead['B']).toMatchObject({ games: 3, wins: 2, losses: 1, ties: 0 });
    expect(res.perPlayer['A'].headToHead['C']).toMatchObject({ games: 3, wins: 2, losses: 1 });
    expect(res.perPlayer['A'].headToHead['A']).toBeUndefined();
  });
});

describe('computeStats — lower-is-better direction inference', () => {
  it('infers from winnerIds vs totals (no game module needed)', () => {
    const players = [player('A'), player('B')];
    const games = [mkGame({ id: 'h', type: 'hearts', playerIds: ['A', 'B'], winnerIds: ['A'], roundCount: 1 })];
    const rounds = [mkRound('h', 0, { A: 5, B: 20 })]; // A has fewer points and wins -> lower is better
    const res = computeStats({ players, games, rounds });
    expect(res.perPlayer['A'].wins).toBe(1);
    expect(res.perPlayer['A'].bestFinish).toBe(1);
    expect(res.perPlayer['B'].bestFinish).toBe(2);
  });
});

describe('computeStats — records', () => {
  const { players, games, rounds } = trio();
  const res = computeStats({ players, games, rounds });
  const rec = (k: string) => res.records.find((r) => r.key === k);

  it('captures headline records with holders', () => {
    expect(rec('topRound')).toMatchObject({ value: '20', holderId: 'B', gameId: 'g3' });
    expect(rec('highTotal')).toMatchObject({ value: '30', holderId: 'A', gameId: 'g1' }); // A's 30 in g1
    expect(rec('longest')).toMatchObject({ value: '3 rounds' });
    expect(rec('blowout')).toMatchObject({ value: 'by 10' });
    expect(rec('closest')).toMatchObject({ value: 'by 10' });
  });
});

describe('computeStats — filters', () => {
  const { players, games, rounds } = trio();

  it('filters by date range', () => {
    const res = computeStats({ players, games, rounds }, { range: { from: BASE + DAY } });
    expect(res.totals.finishedGames).toBe(2); // g2, g3
    expect(res.perPlayer['A'].played).toBe(2);
  });

  it('filters by game type', () => {
    const res = computeStats({ players, games, rounds }, { gameType: 'hearts' });
    expect(res.totals.finishedGames).toBe(1);
    expect(res.perPlayer['A'].byGameType['tally']).toBeUndefined();
  });

  it('excludes non-finished games', () => {
    const active = mkGame({ id: 'open', playerIds: ['A', 'B'], status: 'active', roundCount: 0 });
    const res = computeStats({ players, games: [...games, active], rounds });
    expect(res.totals.games).toBe(4);
    expect(res.totals.finishedGames).toBe(3);
  });
});

describe('computeStats — merge-aware identity (forward compatible)', () => {
  it('folds a merged member into the survivor and drops self-pairs', () => {
    const players = [
      player('X'),
      player('Y'),
      { id: 'Y2', name: 'Y (old)', color: '#7c5cff', createdAt: 0, mergedInto: 'Y' } as unknown as Player,
    ];
    const games = [mkGame({ id: 'gm', playerIds: ['X', 'Y', 'Y2'], winnerIds: ['Y2'], roundCount: 1 })];
    const rounds = [mkRound('gm', 0, { X: 5, Y: 3, Y2: 7 })];
    const res = computeStats({ players, games, rounds });

    expect(res.perPlayer['Y2']).toBeUndefined();
    expect(res.perPlayer['Y']).toMatchObject({ wins: 1, played: 1, points: 10 }); // 3 + 7 merged
    expect(res.perPlayer['Y'].headToHead['Y']).toBeUndefined();
    expect(res.perPlayer['Y'].headToHead['X']).toMatchObject({ games: 1, wins: 1 });
    expect(res.players.map((p) => p.id).sort()).toEqual(['X', 'Y']);
  });
});

describe('computeStats — injected game-specific hook', () => {
  it('routes per-type stats through the injected resolver', () => {
    const players = [player('A'), player('B')];
    const games = [mkGame({ id: 'g', playerIds: ['A', 'B'], winnerIds: ['A'], roundCount: 1 })];
    const rounds = [mkRound('g', 0, { A: 5, B: 1 })];
    const opts: ComputeOptions = {
      gameStats: (type) =>
        type === 'tally' ? () => ({ global: [{ key: 'k', label: 'L', value: '42' }] }) : undefined,
    };
    const res = computeStats({ players, games, rounds }, {}, opts);
    expect(res.gameSpecific['tally'].global?.[0]).toMatchObject({ value: '42' });
  });
});

describe('computeStats — abandoned games', () => {
  const players = [player('A'), player('B')];
  const finished = mkGame({ id: 'f', playerIds: ['A', 'B'], winnerIds: ['A'], roundCount: 1, finishedAt: BASE });
  const dead = mkGame({ id: 'x', playerIds: ['A', 'B'], status: 'abandoned', roundCount: 1, finishedAt: BASE + DAY });
  const data = {
    players,
    games: [finished, dead],
    rounds: [mkRound('f', 0, { A: 5, B: 1 }), mkRound('x', 0, { A: 9, B: 0 })],
  };

  it('excludes abandoned games from standings, wins and records by default', () => {
    const res = computeStats(data);
    expect(res.totals.finishedGames).toBe(1);
    expect(res.totals.abandonedGames).toBe(1);
    expect(res.totals.games).toBe(1); // abandoned left out of the volume count by default
    expect(res.perPlayer['A'].played).toBe(1);
    expect(res.perPlayer['A'].wins).toBe(1);
    expect(res.records.find((r) => r.key === 'topRound')?.value).toBe('5'); // the abandoned 9 never counts
  });

  it('counts abandoned games in volume when includeAbandoned is set, but never as finished', () => {
    const res = computeStats(data, { includeAbandoned: true });
    expect(res.totals.games).toBe(2);
    expect(res.totals.finishedGames).toBe(1);
    expect(res.totals.abandonedGames).toBe(1);
    expect(res.perPlayer['A'].played).toBe(1); // still excluded from standings
    expect(res.records.find((r) => r.key === 'topRound')?.value).toBe('5');
  });
});

describe('buildAliasMap', () => {
  it('resolves merge chains transitively', () => {
    const canonical = canonicalizer(
      buildAliasMap([
        { id: 'a', mergedInto: 'b' },
        { id: 'b', mergedInto: 'c' },
        { id: 'c' },
      ]),
    );
    expect(canonical('a')).toBe('c');
    expect(canonical('b')).toBe('c');
    expect(canonical('c')).toBe('c');
    expect(canonical('unknown')).toBe('unknown');
  });

  it('does not hang on a cycle', () => {
    const canonical = canonicalizer(
      buildAliasMap([
        { id: 'a', mergedInto: 'b' },
        { id: 'b', mergedInto: 'a' },
      ]),
    );
    expect(['a', 'b']).toContain(canonical('a'));
  });
});

describe('compareStats', () => {
  it('diffs a member between two windows', () => {
    const players = [player('A'), player('B')];
    const prior = computeStats({
      players,
      games: [mkGame({ id: 'p1', playerIds: ['A', 'B'], winnerIds: ['A'], roundCount: 1 })],
      rounds: [mkRound('p1', 0, { A: 5, B: 1 })],
    });
    const current = computeStats({
      players,
      games: [
        mkGame({ id: 'c1', playerIds: ['A', 'B'], winnerIds: ['A'], roundCount: 1 }),
        mkGame({ id: 'c2', playerIds: ['A', 'B'], winnerIds: ['A'], roundCount: 1 }),
      ],
      rounds: [mkRound('c1', 0, { A: 5, B: 1 }), mkRound('c2', 0, { A: 5, B: 1 })],
    });
    const delta = compareStats(current, prior, 'A');
    const wins = delta.metrics.find((m) => m.key === 'wins')!;
    expect(wins).toMatchObject({ current: 2, prior: 1, delta: 1, better: true });
  });
});

describe('skullkingStats', () => {
  it('computes bid accuracy, zero-bid success and bonus', () => {
    const games = [mkGame({ id: 'sk', type: 'skullking', playerIds: ['A', 'B'], roundCount: 1 })];
    const rounds = [
      mkRound('sk', 0, {}, { rows: { A: { bid: 2, actual: 2, bonus: 10 }, B: { bid: 0, actual: 1, bonus: 0 } } }),
    ];
    const out = skullkingStats({ games, rounds, players: [], canonical: (id) => id });
    expect(out.perPlayer?.['A'].find((m) => m.key === 'sk_acc')?.value).toBe('100%');
    expect(out.perPlayer?.['A'].find((m) => m.key === 'sk_bonus')?.value).toBe('10');
    expect(out.global?.[0]).toMatchObject({ key: 'sk_acc_all', value: '50%' });
  });
});

describe('heartsStats', () => {
  it('counts moons, ♠Q and clean rounds', () => {
    const games = [mkGame({ id: 'h', type: 'hearts', playerIds: ['A', 'B', 'C'], roundCount: 1 })];
    const rounds = [mkRound('h', 0, {}, { hearts: { A: 13, B: 0, C: 0 }, queen: 'A', jack: null })];
    const out = heartsStats({ games, rounds, players: [], canonical: (id) => id });
    expect(out.perPlayer?.['A'].find((m) => m.key === 'h_moon')?.value).toBe('1');
    expect(out.perPlayer?.['A'].find((m) => m.key === 'h_queen')?.value).toBe('1');
    expect(out.global?.[0]).toMatchObject({ key: 'h_moon_all', value: '1' });
  });
});
