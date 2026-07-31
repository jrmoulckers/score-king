import { describe, expect, it } from 'vitest';
import type { ID, Player, RoundContext } from '../../types';
import {
  investedByPlayer,
  readConfig,
  reconcileCashout,
  scoreEvent,
  scoreHand,
  settle,
  sidePots,
  splitPot,
  toMoney,
  validateEvent,
  type CashoutEvent,
  type HandEvent,
  type HoldemEvent,
} from './logic';

const player = (id: string, name = id): Player => ({ id, name, color: '#7c5cff', createdAt: 0 });

/** Build a RoundContext with prior rounds + totals for cashout/scoring tests. */
function ctxWith(players: Player[], events: HoldemEvent[], totals: Record<ID, number> = {}): RoundContext {
  const rounds = events.map((input, index) => ({
    id: `r${index}`,
    gameId: 'g',
    index,
    input,
    deltas: {},
    createdAt: index,
  }));
  return {
    game: { id: 'g' } as RoundContext['game'],
    players,
    config: {},
    roundIndex: events.length,
    totals,
    rounds,
  };
}

const sum = (r: Record<ID, number>) => Object.values(r).reduce((a, v) => a + v, 0);

describe('readConfig', () => {
  it('applies defaults and clamps', () => {
    const cfg = readConfig({});
    expect(cfg.unit).toBe('dollars');
    expect(cfg.defaultBuyin).toBe(20);
    expect(cfg.chipsPerUnit).toBeGreaterThanOrEqual(1);
  });

  it('reads a chips-with-value tournament config', () => {
    const cfg = readConfig({
      unit: 'chipsWithValue',
      chipsPerUnit: 50,
      mode: 'tournament',
      depth: 'betting',
      smallBlind: 25,
      bigBlind: 50,
    });
    expect(cfg.unit).toBe('chipsWithValue');
    expect(cfg.chipsPerUnit).toBe(50);
    expect(cfg.mode).toBe('tournament');
    expect(cfg.depth).toBe('betting');
  });

  it('converts chips to money only when chipsWithValue', () => {
    expect(toMoney(500, readConfig({ unit: 'chips' }))).toBe(500);
    expect(toMoney(500, readConfig({ unit: 'chipsWithValue', chipsPerUnit: 100 }))).toBe(5);
  });
});

describe('splitPot', () => {
  it('splits evenly', () => {
    expect(splitPot(90, ['a', 'b', 'c'])).toEqual({ a: 30, b: 30, c: 30 });
  });

  it('gives odd chips to the earliest winners', () => {
    expect(splitPot(100, ['a', 'b', 'c'])).toEqual({ a: 34, b: 33, c: 33 });
  });

  it('handles a single winner and empty winners', () => {
    expect(splitPot(120, ['a'])).toEqual({ a: 120 });
    expect(splitPot(120, [])).toEqual({});
  });
});

describe('sidePots', () => {
  it('makes one pot when everyone contributes equally', () => {
    const pots = sidePots({ a: 100, b: 100, c: 100 }, [], ['a', 'b', 'c']);
    expect(pots).toEqual([{ amount: 300, eligible: ['a', 'b', 'c'] }]);
  });

  it('creates a side pot for a short all-in', () => {
    // a is all-in for 50; b and c put in 200 each.
    const pots = sidePots({ a: 50, b: 200, c: 200 }, [], ['a', 'b', 'c']);
    expect(pots).toEqual([
      { amount: 150, eligible: ['a', 'b', 'c'] }, // main: 50 each
      { amount: 300, eligible: ['b', 'c'] }, // side: 150 each from b,c
    ]);
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(450);
  });

  it('keeps folded chips in the pot but drops folded eligibility', () => {
    // c folded after committing 200; a all-in 50, b calls 200.
    const pots = sidePots({ a: 50, b: 200, c: 200 }, ['c'], ['a', 'b', 'c']);
    expect(pots).toEqual([
      { amount: 150, eligible: ['a', 'b'] },
      { amount: 300, eligible: ['b'] },
    ]);
  });

  it('layers three distinct all-in sizes', () => {
    const pots = sidePots({ a: 20, b: 60, c: 100 }, [], ['a', 'b', 'c']);
    expect(pots).toEqual([
      { amount: 60, eligible: ['a', 'b', 'c'] }, // 20 each
      { amount: 80, eligible: ['b', 'c'] }, // 40 each
      { amount: 40, eligible: ['c'] }, // 40 from c
    ]);
  });
});

describe('scoreHand', () => {
  it('is zero-sum: winner gains what losers put in', () => {
    const event: HandEvent = {
      kind: 'hand',
      level: 2,
      committed: { a: 50, b: 50, c: 50 },
      pots: [{ amount: 150, winnerIds: ['a'] }],
    };
    const delta = scoreHand(event);
    expect(delta).toEqual({ a: 100, b: -50, c: -50 });
    expect(sum(delta)).toBe(0);
  });

  it('awards a split pot with the odd chip', () => {
    const event: HandEvent = {
      kind: 'hand',
      level: 2,
      committed: { a: 33, b: 33, c: 35 },
      pots: [{ amount: 101, winnerIds: ['a', 'b'] }],
    };
    const delta = scoreHand(event);
    expect(sum(delta)).toBe(0);
    expect(delta.a).toBe(51 - 33); // 51 = ceil half of 101
    expect(delta.b).toBe(50 - 33);
    expect(delta.c).toBe(-35);
  });

  it('settles a multi-pot all-in showdown zero-sum', () => {
    const committed = { a: 50, b: 200, c: 200 };
    const pots = sidePots(committed, [], ['a', 'b', 'c']);
    const event: HandEvent = {
      kind: 'hand',
      level: 3,
      committed,
      pots: [
        { amount: pots[0].amount, winnerIds: ['a'] }, // short stack wins main
        { amount: pots[1].amount, winnerIds: ['b'] }, // b wins the side
      ],
    };
    const delta = scoreHand(event);
    expect(sum(delta)).toBe(0);
    expect(delta.a).toBe(150 - 50); // +100
    expect(delta.b).toBe(300 - 200); // +100
    expect(delta.c).toBe(-200);
  });
});

describe('scoreEvent', () => {
  it('buy-ins are net-neutral', () => {
    const players = [player('a'), player('b')];
    const event: HoldemEvent = { kind: 'buyin', playerId: 'a', amount: 20 };
    expect(scoreEvent(event, ctxWith(players, []))).toEqual({});
  });

  it('cashout lands running totals exactly on net (ledger-only night)', () => {
    const players = [player('a'), player('b')];
    const events: HoldemEvent[] = [
      { kind: 'buyin', playerId: 'a', amount: 20 },
      { kind: 'buyin', playerId: 'b', amount: 20 },
    ];
    // No hands tracked, so totals are still 0 going into cashout.
    const cashout: CashoutEvent = { kind: 'cashout', counts: { a: 35, b: 5 } };
    const delta = scoreEvent(cashout, ctxWith(players, events, { a: 0, b: 0 }));
    expect(delta).toEqual({ a: 15, b: -15 }); // a up 15, b down 15
    expect(sum(delta)).toBe(0);
  });

  it('cashout reconciles on top of tracked hands', () => {
    const players = [player('a'), player('b')];
    const events: HoldemEvent[] = [
      { kind: 'buyin', playerId: 'a', amount: 20 },
      { kind: 'buyin', playerId: 'b', amount: 20 },
    ];
    // A hand already pushed a's total to +10, b to −10.
    const cashout: CashoutEvent = { kind: 'cashout', counts: { a: 35, b: 5 } };
    const delta = scoreEvent(cashout, ctxWith(players, events, { a: 10, b: -10 }));
    // Final net is a:+15, b:−15; deltas top up from the tracked totals.
    expect(delta).toEqual({ a: 5, b: -5 });
  });
});

describe('investedByPlayer', () => {
  it('sums buy-ins and rebuys, ignoring hands and cashouts', () => {
    const rounds = [
      { input: { kind: 'buyin', playerId: 'a', amount: 20 } },
      { input: { kind: 'buyin', playerId: 'a', amount: 20 } },
      { input: { kind: 'buyin', playerId: 'b', amount: 40 } },
      { input: { kind: 'cashout', counts: { a: 0 } } },
    ];
    expect(investedByPlayer(rounds)).toEqual({ a: 40, b: 40 });
  });
});

describe('settle', () => {
  it('produces a minimal set of transfers that clears every net', () => {
    const net: Record<string, number> = { a: 45, b: -20, c: -25 };
    const transfers = settle(net);
    // Each debtor pays a, at most n-1 transfers.
    expect(transfers.length).toBeLessThanOrEqual(2);
    const paidToA = transfers.filter((t) => t.to === 'a').reduce((s, t) => s + t.amount, 0);
    expect(paidToA).toBe(45);
    for (const id of Object.keys(net)) {
      const out = transfers.filter((t) => t.from === id).reduce((s, t) => s + t.amount, 0);
      const inc = transfers.filter((t) => t.to === id).reduce((s, t) => s + t.amount, 0);
      expect(inc - out).toBeCloseTo(net[id], 5);
    }
  });

  it('handles multiple creditors and debtors', () => {
    const net: Record<string, number> = { a: 30, b: 20, c: -15, d: -35 };
    const transfers = settle(net);
    expect(transfers.length).toBeLessThanOrEqual(3);
    for (const id of Object.keys(net)) {
      const out = transfers.filter((t) => t.from === id).reduce((s, t) => s + t.amount, 0);
      const inc = transfers.filter((t) => t.to === id).reduce((s, t) => s + t.amount, 0);
      expect(inc - out).toBeCloseTo(net[id], 5);
    }
  });

  it('drops rounding dust and returns nothing when even', () => {
    expect(settle({ a: 0, b: 0 })).toEqual([]);
    expect(settle({ a: 0.001, b: -0.001 })).toEqual([]);
  });
});

describe('validateEvent', () => {
  const players = [player('a'), player('b'), player('c')];
  const ctx = ctxWith(players, []);

  it('rejects a zero buy-in and an unknown player', () => {
    expect(validateEvent({ kind: 'buyin', playerId: 'a', amount: 0 }, ctx)).toMatch(/more than 0/);
    expect(validateEvent({ kind: 'buyin', playerId: 'z', amount: 20 }, ctx)).toMatch(/buying in/);
  });

  it('accepts a valid buy-in', () => {
    expect(validateEvent({ kind: 'buyin', playerId: 'a', amount: 20 }, ctx)).toBeNull();
  });

  it('requires the pot to equal chips in', () => {
    const bad: HandEvent = {
      kind: 'hand',
      level: 2,
      committed: { a: 50, b: 50 },
      pots: [{ amount: 80, winnerIds: ['a'] }],
    };
    expect(validateEvent(bad, ctx)).toMatch(/equal the chips/);
  });

  it('requires a winner and non-empty pot', () => {
    expect(
      validateEvent({ kind: 'hand', level: 2, committed: { a: 10 }, pots: [] }, ctx),
    ).toMatch(/who wins/);
    expect(
      validateEvent({ kind: 'hand', level: 2, committed: {}, pots: [{ amount: 0, winnerIds: ['a'] }] }, ctx),
    ).toMatch(/No chips/);
  });

  it('accepts a balanced hand', () => {
    const ok: HandEvent = {
      kind: 'hand',
      level: 2,
      committed: { a: 50, b: 50 },
      pots: [{ amount: 100, winnerIds: ['a'] }],
    };
    expect(validateEvent(ok, ctx)).toBeNull();
  });

  it('validates cashout counts', () => {
    expect(validateEvent({ kind: 'cashout', counts: {} }, ctx)).toMatch(/final chip counts/);
    expect(validateEvent({ kind: 'cashout', counts: { a: -5 } }, ctx)).toMatch(/negative/);
    expect(validateEvent({ kind: 'cashout', counts: { a: 10, b: 30 } }, ctx)).toBeNull();
  });
});

describe('reconcileCashout', () => {
  it('is zero when chips match buy-ins and signed otherwise', () => {
    const players = [player('a'), player('b')];
    const events: HoldemEvent[] = [
      { kind: 'buyin', playerId: 'a', amount: 20 },
      { kind: 'buyin', playerId: 'b', amount: 20 },
    ];
    const ctx = ctxWith(players, events);
    expect(reconcileCashout({ kind: 'cashout', counts: { a: 25, b: 15 } }, ctx)).toBe(0);
    expect(reconcileCashout({ kind: 'cashout', counts: { a: 25, b: 10 } }, ctx)).toBe(-5);
  });
});
