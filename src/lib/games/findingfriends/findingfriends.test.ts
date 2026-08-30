import { describe, expect, it } from 'vitest';
import type { ID, RoundContext, Round, Game } from '../../types';
import { findingFriends } from './index';
import { findingFriendsStats } from './stats';
import {
  DEFAULT_OPTIONS,
  WINNING_LEVEL_INDEX,
  deckCountFromConfig,
  describeDeal,
  levelJump,
  levelLabel,
  optionsFromConfig,
  scoreFindingFriends,
  sideHasWon,
  sideLevelIndex,
  totalPoints,
  validateFindingFriends,
  type FindingFriendsInput,
} from './logic';

const players = [
  { id: 'a', name: 'Ann', color: '#111', createdAt: 0 },
  { id: 'b', name: 'Bo', color: '#222', createdAt: 0 },
  { id: 'c', name: 'Cy', color: '#333', createdAt: 0 },
  { id: 'd', name: 'Di', color: '#444', createdAt: 0 },
  { id: 'e', name: 'Eve', color: '#555', createdAt: 0 },
  { id: 'f', name: 'Fin', color: '#666', createdAt: 0 },
];

function mk(partial: Partial<FindingFriendsInput> = {}): FindingFriendsInput {
  return {
    declarers: ['a', 'b'],
    challengers: ['c', 'd', 'e', 'f'],
    pointsCaptured: 0,
    ...partial,
  };
}

function ctx(config: Record<string, unknown> = {}, rounds: Round[] = []): RoundContext {
  return { players, config, rounds } as unknown as RoundContext;
}

describe('totalPoints', () => {
  it('is 100 per deck (four 5s@5 + four 10s@10 + four Ks@10)', () => {
    expect(totalPoints(2)).toBe(200);
    expect(totalPoints(3)).toBe(300);
    expect(totalPoints(0)).toBe(0);
  });
});

describe('levelJump', () => {
  it('shuts out declarers +3 on zero points', () => {
    expect(levelJump(0, 2)).toEqual({ winner: 'declarers', levels: 3 });
  });

  it('gives declarers +2 under 20% of the pool', () => {
    expect(levelJump(35, 2)).toEqual({ winner: 'declarers', levels: 2 });
  });

  it('gives declarers +1 from 20% up to 40%', () => {
    expect(levelJump(40, 2)).toEqual({ winner: 'declarers', levels: 1 });
    expect(levelJump(75, 2)).toEqual({ winner: 'declarers', levels: 1 });
  });

  it('is a hold from 40% up to 60%', () => {
    expect(levelJump(80, 2)).toEqual({ winner: null, levels: 0 });
    expect(levelJump(115, 2)).toEqual({ winner: null, levels: 0 });
  });

  it('gives challengers +1 from 60% up to 80%', () => {
    expect(levelJump(120, 2)).toEqual({ winner: 'challengers', levels: 1 });
    expect(levelJump(155, 2)).toEqual({ winner: 'challengers', levels: 1 });
  });

  it('gives challengers +2 from 80% up to 100%', () => {
    expect(levelJump(160, 2)).toEqual({ winner: 'challengers', levels: 2 });
    expect(levelJump(195, 2)).toEqual({ winner: 'challengers', levels: 2 });
  });

  it('gives challengers +3 on a full sweep (100%+)', () => {
    expect(levelJump(200, 2)).toEqual({ winner: 'challengers', levels: 3 });
    expect(levelJump(999, 2)).toEqual({ winner: 'challengers', levels: 3 });
  });

  it('scales the thresholds with deck count', () => {
    // 150/300 = 50% -> hold for 3 decks, but 150/200 = 75% -> challengers +1 for 2 decks.
    expect(levelJump(150, 3)).toEqual({ winner: null, levels: 0 });
    expect(levelJump(150, 2)).toEqual({ winner: 'challengers', levels: 1 });
  });
});

describe('scoreFindingFriends', () => {
  it('awards the shutout to every named declarer', () => {
    expect(scoreFindingFriends(mk({ pointsCaptured: 0 }))).toEqual({
      a: 3,
      b: 3,
      c: 0,
      d: 0,
      e: 0,
      f: 0,
    });
  });

  it('awards a breakthrough to every named challenger, not the declarers', () => {
    expect(scoreFindingFriends(mk({ pointsCaptured: 200 }))).toEqual({
      a: 0,
      b: 0,
      c: 3,
      d: 3,
      e: 3,
      f: 3,
    });
  });

  it('awards nobody on a hold', () => {
    expect(scoreFindingFriends(mk({ pointsCaptured: 100 }))).toEqual({
      a: 0,
      b: 0,
      c: 0,
      d: 0,
      e: 0,
      f: 0,
    });
  });

  it('returns all-zero deltas when the deal is unrecorded', () => {
    expect(scoreFindingFriends(mk({ pointsCaptured: null }))).toEqual({
      a: 0,
      b: 0,
      c: 0,
      d: 0,
      e: 0,
      f: 0,
    });
  });

  it('honours a different deck count', () => {
    // 150/300 = 50% -> declarers +1 (20-40% band would need <120; 150 is in 40-60% hold
    // for 3 decks: 0.5 -> hold). Use a value clearly in the declarer +1 band instead.
    expect(scoreFindingFriends(mk({ pointsCaptured: 90 }), { deckCount: 3 })).toEqual({
      a: 1,
      b: 1,
      c: 0,
      d: 0,
      e: 0,
      f: 0,
    });
  });

  it('only ever moves one side per deal (zero-sum by side)', () => {
    for (const pts of [0, 35, 75, 100, 150, 195, 250]) {
      const out = scoreFindingFriends(mk({ pointsCaptured: pts }));
      const declarerSide = out.a + out.b;
      const challengerSide = out.c + out.d + out.e + out.f;
      expect(declarerSide === 0 || challengerSide === 0).toBe(true);
    }
  });
});

describe('validateFindingFriends', () => {
  it('accepts a complete deal', () => {
    expect(validateFindingFriends(mk())).toBeNull();
  });

  it('requires a declaring side', () => {
    expect(validateFindingFriends(mk({ declarers: [] }))).toMatch(/banking side/i);
  });

  it('requires a challenging side', () => {
    expect(validateFindingFriends(mk({ challengers: [] }))).toMatch(/attacking side/i);
  });

  it('rejects a player on both sides', () => {
    expect(validateFindingFriends(mk({ declarers: ['a', 'c'] }))).toMatch(/only be on one side/i);
  });

  it('requires points captured', () => {
    expect(validateFindingFriends(mk({ pointsCaptured: null }))).toMatch(/how many points/i);
  });

  it('rejects negative points', () => {
    expect(validateFindingFriends(mk({ pointsCaptured: -5 }))).toMatch(/negative/i);
  });
});

describe('sideLevelIndex / levelLabel / sideHasWon', () => {
  it('reads the max total among a side\u2019s members as its level', () => {
    expect(sideLevelIndex(['a', 'b'], { a: 3, b: 3 })).toBe(3);
    expect(sideLevelIndex(['a', 'b'], { a: 5, b: 2 })).toBe(5);
  });

  it('is robust to missing totals and clamps into range', () => {
    expect(sideLevelIndex(['a'], {})).toBe(0);
    expect(sideLevelIndex(['a'], { a: 99 })).toBe(WINNING_LEVEL_INDEX);
    expect(sideLevelIndex([], { a: 5 })).toBe(0);
  });

  it('labels level indices as card ranks', () => {
    expect(levelLabel(0)).toBe('2');
    expect(levelLabel(8)).toBe('10');
    expect(levelLabel(WINNING_LEVEL_INDEX)).toBe('A');
    expect(levelLabel(999)).toBe('A');
  });

  it('flags a side that has reached or passed Ace', () => {
    expect(sideHasWon(['a'], { a: WINNING_LEVEL_INDEX })).toBe(true);
    expect(sideHasWon(['a'], { a: WINNING_LEVEL_INDEX - 1 })).toBe(false);
  });
});

describe('describeDeal', () => {
  it('summarises a shutout naming the declarers', () => {
    const input = mk({ pointsCaptured: 0 });
    const s = describeDeal(input, players, { a: 3, b: 3, c: 0, d: 0, e: 0, f: 0 });
    expect(s).toContain('Ann & Bo');
    expect(s).toContain('+3');
  });

  it('summarises a breakthrough naming the challengers', () => {
    const input = mk({ pointsCaptured: 200 });
    const s = describeDeal(input, players, { a: 0, b: 0, c: 3, d: 3, e: 3, f: 3 });
    expect(s).toContain('Cy & Di & Eve & Fin');
    expect(s).toMatch(/breaks through/i);
  });

  it('summarises a hold', () => {
    const input = mk({ pointsCaptured: 100 });
    const s = describeDeal(input, players, { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 });
    expect(s).toMatch(/hold/i);
  });

  it('handles an unrecorded deal', () => {
    expect(describeDeal(mk({ pointsCaptured: null }), players, {})).toBe('Deal not recorded');
  });

  it('derives deltas fresh when none are supplied', () => {
    const input = mk({ pointsCaptured: 0 });
    expect(describeDeal(input, players)).toContain('+3');
  });
});

describe('config coercion', () => {
  it('deck count defaults to 2 and ignores junk', () => {
    expect(deckCountFromConfig({})).toBe(2);
    expect(deckCountFromConfig({ deckCount: '3' })).toBe(3);
    expect(deckCountFromConfig({ deckCount: 0 })).toBe(2);
    expect(deckCountFromConfig({ deckCount: -1 })).toBe(2);
  });

  it('resolves full options from config', () => {
    expect(optionsFromConfig({ deckCount: '4' })).toEqual({ deckCount: 4 });
    expect(optionsFromConfig({})).toEqual(DEFAULT_OPTIONS);
  });
});

describe('findingFriends module', () => {
  it('declares itself a 4-8 player team game', () => {
    expect(findingFriends.id).toBe('findingfriends');
    expect(findingFriends.teams).toBe(true);
    expect(findingFriends.minPlayers).toBe(4);
    expect(findingFriends.maxPlayers).toBe(8);
  });

  it('creates a fresh round input seating the first pick as the opening banker', () => {
    const input = findingFriends.createRoundInput(ctx()) as FindingFriendsInput;
    expect(input.declarers).toEqual(['a']);
    expect(input.challengers).toEqual(['b', 'c', 'd', 'e', 'f']);
    expect(input.pointsCaptured).toBeNull();
  });

  it('carries the previous deal\u2019s bank forward as the next default', () => {
    const prevRound = {
      id: 'r0',
      gameId: 'g',
      index: 0,
      input: mk({ declarers: ['c', 'd'], challengers: ['a', 'b', 'e', 'f'] }),
      deltas: {},
      createdAt: 0,
    } as unknown as Round;
    const input = findingFriends.createRoundInput(ctx({}, [prevRound])) as FindingFriendsInput;
    expect(input.declarers).toEqual(['c', 'd']);
    expect(input.challengers).toEqual(['a', 'b', 'e', 'f']);
  });

  it('drops a departed player from the carried-forward bank', () => {
    const smallerPlayers = players.filter((p) => p.id !== 'c');
    const prevRound = {
      id: 'r0',
      gameId: 'g',
      index: 0,
      input: mk({ declarers: ['c', 'd'], challengers: ['a', 'b', 'e', 'f'] }),
      deltas: {},
      createdAt: 0,
    } as unknown as Round;
    const c2 = { players: smallerPlayers, config: {}, rounds: [prevRound] } as unknown as RoundContext;
    const input = findingFriends.createRoundInput(c2) as FindingFriendsInput;
    expect(input.declarers).toEqual(['d']);
  });

  it('scores through the module honouring the configured deck count', () => {
    const input = mk({ pointsCaptured: 90 });
    expect(findingFriends.scoreRound(input, ctx({ deckCount: '3' }))).toEqual({
      a: 1,
      b: 1,
      c: 0,
      d: 0,
      e: 0,
      f: 0,
    });
  });

  it('finishes once a side reaches Ace', () => {
    expect(findingFriends.isFinished!({ a: WINNING_LEVEL_INDEX, b: 4 }, {} as never)).toBe(true);
    expect(findingFriends.isFinished!({ a: WINNING_LEVEL_INDEX - 1, b: 4 }, {} as never)).toBe(
      false,
    );
  });

  it('describes a recorded round from its stored deltas', () => {
    const round = {
      input: mk({ pointsCaptured: 0 }),
      deltas: { a: 3, b: 3, c: 0, d: 0, e: 0, f: 0 },
    } as unknown as Round;
    expect(findingFriends.describeRound!(round, players)).toContain('Ann & Bo');
  });

  it('plays a full game up to Ace, tracking level via cumulative deltas', () => {
    const deals: FindingFriendsInput[] = [
      mk({ declarers: ['a', 'b'], challengers: ['c', 'd', 'e', 'f'], pointsCaptured: 0 }), // +3 -> 3
      mk({ declarers: ['a', 'b'], challengers: ['c', 'd', 'e', 'f'], pointsCaptured: 30 }), // +2 -> 5
      mk({ declarers: ['a', 'b'], challengers: ['c', 'd', 'e', 'f'], pointsCaptured: 50 }), // +1 -> 6
      mk({ declarers: ['a', 'b'], challengers: ['c', 'd', 'e', 'f'], pointsCaptured: 0 }), // +3 -> 9
      mk({ declarers: ['a', 'b'], challengers: ['c', 'd', 'e', 'f'], pointsCaptured: 0 }), // +3 -> 12 (Ace)
    ];
    const totals: Record<ID, number> = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };
    let finished = false;
    for (const deal of deals) {
      const d = findingFriends.scoreRound(deal, ctx());
      for (const id of Object.keys(totals)) totals[id] += d[id] ?? 0;
      finished = findingFriends.isFinished!(totals, {
        config: {},
        roundCount: 1,
        playerCount: 6,
      });
      if (finished) break;
    }
    expect(totals.a).toBe(12);
    expect(totals.b).toBe(12);
    expect(finished).toBe(true);
  });
});

describe('findingFriendsStats', () => {
  const games: Game[] = [
    {
      id: 'g',
      type: 'findingfriends',
      config: {},
      playerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      status: 'finished',
      createdAt: 0,
      roundCount: 3,
    } as Game,
  ];
  const mkRound = (index: number, input: FindingFriendsInput, deltas: Record<ID, number>): Round =>
    ({ id: `r${index}`, gameId: 'g', index, input, deltas, createdAt: 0 }) as Round;
  const rounds: Round[] = [
    mkRound(0, mk({ pointsCaptured: 0 }), { a: 3, b: 3, c: 0, d: 0, e: 0, f: 0 }),
    mkRound(1, mk({ pointsCaptured: 200 }), { a: 0, b: 0, c: 3, d: 3, e: 3, f: 3 }),
    mkRound(2, mk({ pointsCaptured: 100 }), { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }),
  ];
  const out = findingFriendsStats({ games, rounds, players: [], canonical: (id: ID) => id });

  const metric = (id: ID, key: string) => out.perPlayer?.[id]?.find((m) => m.key === key);
  const g = (key: string) => out.global?.find((m) => m.key === key);

  it('tracks bank hold rate per declarer', () => {
    expect(metric('a', 'ff_hold')?.value).toBe('33%'); // held 1 of 3 banked deals
  });

  it('tracks breakthrough rate per challenger', () => {
    expect(metric('c', 'ff_break')?.value).toBe('33%'); // broke through 1 of 3 attacked deals
  });

  it('counts shutouts', () => {
    expect(metric('a', 'ff_shutout')?.value).toBe('1');
  });

  it('reports global rates over all deals', () => {
    expect(g('ff_hold_all')?.value).toBe('33%');
    expect(g('ff_break_all')?.value).toBe('33%');
  });
});
