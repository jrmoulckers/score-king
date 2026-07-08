import { describe, expect, it } from 'vitest';
import type { ID, RoundContext, Round } from '../../types';
import { euchre } from './index';
import {
  DEFAULT_OPTIONS,
  describeHand,
  handPoints,
  optionsFromConfig,
  pairingFromConfig,
  resolveTeams,
  scoreEuchre,
  targetFromConfig,
  validateEuchre,
  type EuchreInput,
} from './logic';

const players = [
  { id: 'a', name: 'Ann', color: '#111', createdAt: 0 },
  { id: 'b', name: 'Bo', color: '#222', createdAt: 0 },
  { id: 'c', name: 'Cy', color: '#333', createdAt: 0 },
  { id: 'd', name: 'Di', color: '#444', createdAt: 0 },
];

const ADJACENT: [ID[], ID[]] = [
  ['a', 'b'],
  ['c', 'd'],
];

function mk(partial: Partial<EuchreInput> = {}): EuchreInput {
  return {
    teams: ADJACENT,
    maker: 0,
    alone: false,
    alonePlayer: null,
    result: 'made',
    ...partial,
  };
}

function ctx(config: Record<string, unknown> = {}): RoundContext {
  return { players, config } as unknown as RoundContext;
}

function sum(deltas: Record<ID, number>): number {
  return Object.values(deltas).reduce((a, b) => a + b, 0);
}

describe('resolveTeams', () => {
  it('pairs adjacent picks (1&2 vs 3&4)', () => {
    expect(resolveTeams(players, 'adjacent')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('pairs across picks (1&3 vs 2&4)', () => {
    expect(resolveTeams(players, 'across')).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
  });
});

describe('handPoints', () => {
  it('made (3–4 tricks) scores the makers 1', () => {
    expect(handPoints('made', false)).toEqual({ maker: 1, defenders: 0 });
  });

  it('march (all 5) scores the makers 2', () => {
    expect(handPoints('march', false)).toEqual({ maker: 2, defenders: 0 });
  });

  it('lone march scores 4 with the alone bonus on (default)', () => {
    expect(handPoints('march', true)).toEqual({ maker: 4, defenders: 0 });
  });

  it('lone march scores just 2 with the alone bonus off', () => {
    expect(handPoints('march', true, { aloneBonus: false, loneEuchreBonus: false })).toEqual({
      maker: 2,
      defenders: 0,
    });
  });

  it('going alone and taking only 3–4 still scores 1', () => {
    expect(handPoints('made', true)).toEqual({ maker: 1, defenders: 0 });
  });

  it('euchred scores the defenders 2', () => {
    expect(handPoints('euchred', false)).toEqual({ maker: 0, defenders: 2 });
  });

  it('euchring a lone caller scores 4 only when that bonus is on', () => {
    expect(handPoints('euchred', true, { aloneBonus: true, loneEuchreBonus: true })).toEqual({
      maker: 0,
      defenders: 4,
    });
    // alone but bonus off → still 2
    expect(handPoints('euchred', true, DEFAULT_OPTIONS)).toEqual({ maker: 0, defenders: 2 });
    // lone-euchre bonus only applies to a lone caller, not an ordinary euchre
    expect(handPoints('euchred', false, { aloneBonus: true, loneEuchreBonus: true })).toEqual({
      maker: 0,
      defenders: 2,
    });
  });
});

describe('scoreEuchre', () => {
  it('gives both partners the team points and opponents nothing on a made hand', () => {
    expect(scoreEuchre(mk({ maker: 0, result: 'made' }))).toEqual({ a: 1, b: 1, c: 0, d: 0 });
  });

  it('scores a march to both makers', () => {
    expect(scoreEuchre(mk({ maker: 1, result: 'march' }))).toEqual({ a: 0, b: 0, c: 2, d: 2 });
  });

  it('scores a lone march 4 to both makers (default bonus)', () => {
    const out = scoreEuchre(mk({ maker: 0, result: 'march', alone: true, alonePlayer: 'a' }));
    expect(out).toEqual({ a: 4, b: 4, c: 0, d: 0 });
  });

  it('awards a euchre to the defending team, not the makers', () => {
    expect(scoreEuchre(mk({ maker: 0, result: 'euchred' }))).toEqual({ a: 0, b: 0, c: 2, d: 2 });
  });

  it('honours house-rule options', () => {
    const loneEuchre = scoreEuchre(mk({ maker: 0, result: 'euchred', alone: true, alonePlayer: 'a' }), {
      aloneBonus: true,
      loneEuchreBonus: true,
    });
    expect(loneEuchre).toEqual({ a: 0, b: 0, c: 4, d: 4 });
  });

  it('returns all-zero deltas when the hand is incomplete', () => {
    expect(scoreEuchre(mk({ maker: null }))).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(scoreEuchre(mk({ result: null }))).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('only ever moves the score by one team per hand (zero-sum by team)', () => {
    // exactly one side scores each hand; the other stays flat.
    for (const res of ['made', 'march', 'euchred'] as const) {
      const out = scoreEuchre(mk({ maker: 0, result: res }));
      const makerSide = out.a + out.b;
      const defSide = out.c + out.d;
      expect(makerSide === 0 || defSide === 0).toBe(true);
    }
  });
});

describe('validateEuchre', () => {
  it('accepts a complete hand', () => {
    expect(validateEuchre(mk({ maker: 0, result: 'made' }))).toBeNull();
  });

  it('requires a calling team', () => {
    expect(validateEuchre(mk({ maker: null }))).toMatch(/called trump/i);
  });

  it('requires a result', () => {
    expect(validateEuchre(mk({ result: null }))).toMatch(/how the hand went/i);
  });

  it('requires the lone player when going alone', () => {
    expect(validateEuchre(mk({ alone: true, alonePlayer: null }))).toMatch(/went alone/i);
  });

  it('rejects a lone player from the wrong team', () => {
    expect(validateEuchre(mk({ maker: 0, alone: true, alonePlayer: 'c' }))).toMatch(
      /must be on the team/i,
    );
  });

  it('accepts a valid lone hand', () => {
    expect(validateEuchre(mk({ maker: 0, alone: true, alonePlayer: 'a' }))).toBeNull();
  });

  it('needs four players', () => {
    expect(validateEuchre(mk({ teams: [['a'], ['c']] }))).toMatch(/four players/i);
  });
});

describe('describeHand', () => {
  it('summarises a made hand with the recorded points', () => {
    expect(describeHand(mk({ maker: 0, result: 'made' }), players, 1)).toBe('✋ Ann & Bo made it +1');
  });

  it('summarises a lone march with the lone player', () => {
    const s = describeHand(mk({ maker: 0, result: 'march', alone: true, alonePlayer: 'a' }), players, 4);
    expect(s).toBe('🧹 Ann & Bo marched — Ann alone +4');
  });

  it('summarises a euchre naming both teams', () => {
    expect(describeHand(mk({ maker: 0, result: 'euchred' }), players, 2)).toBe(
      '🚫 Ann & Bo euchred — Cy & Di +2',
    );
  });

  it('derives points from default rules when none are supplied', () => {
    expect(describeHand(mk({ maker: 1, result: 'march' }), players)).toBe('🧹 Cy & Di marched +2');
  });

  it('handles an unrecorded hand', () => {
    expect(describeHand(mk({ maker: null }), players)).toBe('Hand not recorded');
  });
});

describe('config coercion', () => {
  it('pairing defaults to adjacent', () => {
    expect(pairingFromConfig({})).toBe('adjacent');
    expect(pairingFromConfig({ pairing: 'across' })).toBe('across');
  });

  it('options default to the standard rules', () => {
    expect(optionsFromConfig({})).toEqual({ aloneBonus: true, loneEuchreBonus: false });
    expect(optionsFromConfig({ aloneBonus: false, loneEuchreBonus: true })).toEqual({
      aloneBonus: false,
      loneEuchreBonus: true,
    });
  });

  it('target defaults to 10 and ignores junk', () => {
    expect(targetFromConfig({})).toBe(10);
    expect(targetFromConfig({ target: 5 })).toBe(5);
    expect(targetFromConfig({ target: 0 })).toBe(10);
    expect(targetFromConfig({ target: -3 })).toBe(10);
  });
});

describe('euchre module', () => {
  it('declares itself a fixed-partnership 4-player game', () => {
    expect(euchre.id).toBe('euchre');
    expect(euchre.teams).toBe(true);
    expect(euchre.minPlayers).toBe(4);
    expect(euchre.maxPlayers).toBe(4);
    expect(euchre.lowerIsBetter).toBeFalsy();
  });

  it('creates a round input with teams resolved from pick order + pairing', () => {
    const input = euchre.createRoundInput(ctx({ pairing: 'across' })) as EuchreInput;
    expect(input.teams).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
    expect(input.maker).toBeNull();
    expect(input.result).toBeNull();
    expect(input.alone).toBe(false);
  });

  it('scores through the module honouring config bonuses', () => {
    const alone = mk({ maker: 0, result: 'march', alone: true, alonePlayer: 'a' });
    expect(euchre.scoreRound(alone, ctx())).toEqual({ a: 4, b: 4, c: 0, d: 0 });
    expect(euchre.scoreRound(alone, ctx({ aloneBonus: false }))).toEqual({
      a: 2,
      b: 2,
      c: 0,
      d: 0,
    });
  });

  it('finishes when a team reaches the target', () => {
    const info = (config: Record<string, unknown>) => ({ config, roundCount: 8, playerCount: 4 });
    expect(euchre.isFinished!({ a: 10, b: 10, c: 6, d: 6 }, info({}))).toBe(true);
    expect(euchre.isFinished!({ a: 9, b: 9, c: 6, d: 6 }, info({}))).toBe(false);
    expect(euchre.isFinished!({ a: 5, b: 5, c: 3, d: 3 }, info({ target: 5 }))).toBe(true);
  });

  it('describes a recorded round from its stored deltas', () => {
    const round = {
      input: mk({ maker: 0, result: 'euchred' }),
      deltas: { a: 0, b: 0, c: 2, d: 2 },
    } as unknown as Round;
    expect(euchre.describeRound!(round, players)).toBe('🚫 Ann & Bo euchred — Cy & Di +2');
  });

  it('plays a full game to 10 with both partners tracking the team score', () => {
    // Team 0 (a,b) racks up: march, made, made, euchre-defence… we just feed maker-team makes.
    const hands: EuchreInput[] = [
      mk({ maker: 0, result: 'march' }), // +2 → 2
      mk({ maker: 0, result: 'made' }), //  +1 → 3
      mk({ maker: 1, result: 'euchred' }), // team1 euchred → team0 (defenders) +2 → 5
      mk({ maker: 0, result: 'march', alone: true, alonePlayer: 'a' }), // +4 → 9
      mk({ maker: 0, result: 'made' }), //  +1 → 10
    ];
    const totals: Record<ID, number> = { a: 0, b: 0, c: 0, d: 0 };
    for (const h of hands) {
      const d = euchre.scoreRound(h, ctx());
      for (const id of Object.keys(totals)) totals[id] += d[id] ?? 0;
    }
    expect(totals.a).toBe(10);
    expect(totals.b).toBe(10); // partner mirrors the team score exactly
    expect(euchre.isFinished!(totals, { config: {}, roundCount: hands.length, playerCount: 4 })).toBe(
      true,
    );
    // every hand shifted only one team
    expect(sum(euchre.scoreRound(hands[0], ctx()))).toBe(4); // march = 2 to each of two partners
  });
});
