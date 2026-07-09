import { describe, it, expect } from 'vitest';
import type { Game, Player, Round, RoundContext } from '../../types';
import { skullking } from './index';
import { skullkingStats } from './stats';
import {
  BONUS_VALUES,
  bountyTotal,
  effectiveBonus,
  emptyBounty,
  legName,
  madeBid,
  outcomeLabel,
  readConfig,
  scoreRow,
  validateSkullKing,
  type SKBounty,
  type SKInput,
  type SKRow,
} from './logic';

// ── helpers ────────────────────────────────────────────────────────────────
function row(bid: number, actual: number, extra: Partial<SKRow> = {}): SKRow {
  return { bid, actual, bonus: 0, ...extra };
}
function bounty(over: Partial<SKBounty> = {}): SKBounty {
  return { ...emptyBounty(), ...over };
}
function player(id: string): Player {
  return { id, name: id.toUpperCase(), color: '#7c5cff', createdAt: 0 };
}
const P2 = ['a', 'b'].map(player);
function ctxFor(players: Player[], config: Record<string, unknown>, roundIndex: number): RoundContext {
  return { game: { id: 'g' } as never, players, config, roundIndex, totals: {}, rounds: [] };
}

// ── config ───────────────────────────────────────────────────────────────
describe('readConfig', () => {
  it('applies defaults', () => {
    expect(readConfig({})).toEqual({ rounds: 10, bonusesRequireBid: true });
  });
  it('coerces and clamps rounds to 1..10', () => {
    expect(readConfig({ rounds: '5' }).rounds).toBe(5);
    expect(readConfig({ rounds: 99 }).rounds).toBe(10);
    expect(readConfig({ rounds: 3 }).rounds).toBe(3);
    expect(readConfig({ rounds: 0 }).rounds).toBe(10); // 0 is falsy → default 10
  });
  it('treats bonusesRequireBid only false as off', () => {
    expect(readConfig({ bonusesRequireBid: false }).bonusesRequireBid).toBe(false);
    expect(readConfig({ bonusesRequireBid: undefined }).bonusesRequireBid).toBe(true);
  });
});

// ── bounty maths ────────────────────────────────────────────────────────────
describe('bountyTotal', () => {
  it('is zero for an empty bounty', () => {
    expect(bountyTotal(emptyBounty())).toBe(0);
    expect(bountyTotal(undefined)).toBe(0);
  });
  it('sums each capture at its documented value', () => {
    expect(bountyTotal(bounty({ fourteens: 3 }))).toBe(30);
    expect(bountyTotal(bounty({ jollyRoger: true }))).toBe(20);
    expect(bountyTotal(bounty({ pirates: 2 }))).toBe(60);
    expect(bountyTotal(bounty({ mermaidCatchesSK: true }))).toBe(40);
    expect(bountyTotal(bounty({ skOverMermaid: true }))).toBe(50);
    expect(bountyTotal(bounty({ manual: 15 }))).toBe(15);
  });
  it('adds captures together', () => {
    const b = bounty({ fourteens: 2, jollyRoger: true, pirates: 1, skOverMermaid: true, manual: 5 });
    expect(bountyTotal(b)).toBe(20 + 20 + 30 + 50 + 5);
  });
  it('clamps negative/fractional counts', () => {
    expect(bountyTotal(bounty({ fourteens: -3, pirates: 1.9 }))).toBe(30);
  });
});

describe('effectiveBonus', () => {
  it('prefers the structured bounty when present', () => {
    expect(effectiveBonus(row(1, 1, { bonus: 999, bounty: bounty({ pirates: 1 }) }))).toBe(30);
  });
  it('falls back to the legacy numeric bonus', () => {
    expect(effectiveBonus(row(1, 1, { bonus: 40 }))).toBe(40);
  });
});

// ── row scoring ─────────────────────────────────────────────────────────────
describe('scoreRow', () => {
  it('pays 20 × bid for a met positive bid', () => {
    expect(scoreRow(row(3, 3), 5, true)).toBe(60);
  });
  it('pays 10 × round for a met zero bid', () => {
    expect(scoreRow(row(0, 0), 7, true)).toBe(70);
  });
  it('charges 10 × round for a missed zero bid', () => {
    expect(scoreRow(row(0, 2), 7, true)).toBe(-70);
  });
  it('charges 10 per trick off for a missed positive bid', () => {
    expect(scoreRow(row(3, 1), 5, true)).toBe(-20);
    expect(scoreRow(row(2, 5), 5, true)).toBe(-30);
  });
  it('adds bounty only when the bid is met and gating is on', () => {
    expect(scoreRow(row(2, 2, { bounty: bounty({ pirates: 1 }) }), 5, true)).toBe(40 + 30);
    expect(scoreRow(row(2, 1, { bounty: bounty({ pirates: 1 }) }), 5, true)).toBe(-10);
  });
  it('adds bounty even on a miss when gating is off', () => {
    expect(scoreRow(row(2, 1, { bounty: bounty({ pirates: 1 }) }), 5, false)).toBe(-10 + 30);
  });
  it('honours the legacy numeric bonus', () => {
    expect(scoreRow(row(1, 1, { bonus: 20 }), 3, true)).toBe(20 + 20);
  });
});

describe('madeBid', () => {
  it('is true only on an exact match', () => {
    expect(madeBid(row(2, 2))).toBe(true);
    expect(madeBid(row(2, 3))).toBe(false);
  });
});

// ── outcome labels ───────────────────────────────────────────────────────────
describe('outcomeLabel', () => {
  it('reads a standing zero bid as idle', () => {
    expect(outcomeLabel(row(0, 0), 4).kind).toBe('idle');
  });
  it('celebrates a met positive bid', () => {
    expect(outcomeLabel(row(3, 3), 5).kind).toBe('hit');
  });
  it('flags a busted bid as a miss', () => {
    expect(outcomeLabel(row(3, 1), 5).kind).toBe('miss');
    expect(outcomeLabel(row(0, 2), 5).kind).toBe('miss');
  });
});

describe('legName', () => {
  it('names the final round the Gauntlet', () => {
    expect(legName(10, 10)).toBe("The Skull King's Gauntlet");
  });
  it('names earlier legs', () => {
    expect(legName(1, 10)).toBe('Setting Sail');
  });
});

// ── validation ──────────────────────────────────────────────────────────────
describe('validateSkullKing', () => {
  const hand = (rows: Record<string, SKRow>): SKInput => ({ rows });
  it('accepts a legal round', () => {
    expect(validateSkullKing(hand({ a: row(2, 2), b: row(1, 1) }), ctxFor(P2, {}, 2))).toBeNull();
  });
  it('rejects a bid above the round number', () => {
    expect(validateSkullKing(hand({ a: row(4, 0), b: row(0, 0) }), ctxFor(P2, {}, 2))).toMatch(
      /bid must be between 0 and 3/,
    );
  });
  it('rejects tricks that exceed the round', () => {
    expect(validateSkullKing(hand({ a: row(0, 4), b: row(0, 0) }), ctxFor(P2, {}, 2))).toMatch(
      /tricks won must be between 0 and 3/,
    );
  });
  it('rejects a table that wins more tricks than exist', () => {
    expect(validateSkullKing(hand({ a: row(2, 2), b: row(2, 2) }), ctxFor(P2, {}, 2))).toMatch(
      /can't exceed the 3 available/,
    );
  });
});

// ── module wiring ─────────────────────────────────────────────────────────────
describe('skullking module', () => {
  it('has the expected identity and bounds', () => {
    expect(skullking.id).toBe('skullking');
    expect(skullking.minPlayers).toBe(2);
    expect(skullking.maxPlayers).toBe(8);
    expect(skullking.configFields?.map((f) => f.key)).toEqual(['rounds', 'bonusesRequireBid']);
  });
  it('caps rounds via config', () => {
    expect(skullking.maxRounds!({ rounds: 7 }, 4)).toBe(7);
    expect(skullking.maxRounds!({}, 4)).toBe(10);
  });
  it('seeds a fresh structured bounty per player', () => {
    const input = skullking.createRoundInput(ctxFor(P2, {}, 0)) as SKInput;
    expect(Object.keys(input.rows)).toEqual(['a', 'b']);
    expect(input.rows.a).toEqual({ bid: 0, actual: 0, bonus: 0, bounty: emptyBounty() });
  });
  it('scores a whole round through the module', () => {
    const input: SKInput = {
      rows: { a: row(2, 2, { bounty: bounty({ jollyRoger: true }) }), b: row(0, 1) },
    };
    const deltas = skullking.scoreRound(input, ctxFor(P2, {}, 4));
    expect(deltas).toEqual({ a: 40 + 20, b: -50 });
  });
  it('describeRound marks a banked bounty with treasure', () => {
    const r: Round = {
      id: 'r',
      gameId: 'g',
      index: 0,
      input: { rows: { a: row(1, 1, { bounty: bounty({ pirates: 1 }) }), b: row(0, 0) } },
      deltas: {},
      createdAt: 0,
    };
    expect(skullking.describeRound!(r, P2)).toBe('A 1/1 🪙 · B 0/0');
  });
});

// ── stats ─────────────────────────────────────────────────────────────────────
describe('skullkingStats', () => {
  const game: Game = {
    id: 'g',
    type: 'skullking',
    config: {},
    playerIds: ['a'],
    status: 'finished',
    createdAt: 0,
    roundCount: 2,
  };
  function asRound(index: number, input: SKInput): Round {
    return { id: `r${index}`, gameId: 'g', index, input, deltas: {}, createdAt: 0 };
  }

  it('derives accuracy, boldness, zero-bid and haul metrics', () => {
    const rounds = [
      asRound(0, { rows: { a: row(1, 1, { bounty: bounty({ pirates: 1 }) }) } }),
      asRound(1, { rows: { a: row(0, 0) } }),
    ];
    const { perPlayer } = skullkingStats({
      games: [game],
      rounds,
      players: [player('a')],
      canonical: (id) => id,
    });
    const metrics = perPlayer!.a;
    const keys = metrics.map((m) => m.key);
    expect(keys).toContain('sk_acc');
    expect(keys).toContain('sk_bold');
    expect(keys).toContain('sk_zero');
    expect(keys).toContain('sk_haul');
    expect(metrics.find((m) => m.key === 'sk_haul')!.value).toBe('30');
  });

  it('counts a legacy numeric bonus toward the haul', () => {
    const rounds = [asRound(0, { rows: { a: row(2, 2, { bonus: 40 }) } })];
    const { perPlayer } = skullkingStats({
      games: [game],
      rounds,
      players: [player('a')],
      canonical: (id) => id,
    });
    expect(perPlayer!.a.find((m) => m.key === 'sk_bonus')!.value).toBe('40');
  });
});

// keep BONUS_VALUES referenced so the contract is asserted, not just imported.
describe('BONUS_VALUES', () => {
  it('matches the reference sheet', () => {
    expect(BONUS_VALUES).toEqual({
      fourteen: 10,
      jollyRoger: 20,
      pirate: 30,
      mermaidCatchesSK: 40,
      skOverMermaid: 50,
    });
  });
});
