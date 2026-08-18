import { describe, expect, it } from 'vitest';
import type { ID, Game, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import { cribbage } from './index';
import { cribbageStats } from './stats';
import {
  HEELS_POINTS,
  IMPOSSIBLE_HAND,
  PERFECT_HAND,
  breakdownTotal,
  cardLabel,
  cardValue,
  countFifteens,
  countPairs,
  defaultDealer,
  describeDeal,
  doubleSkunkLine,
  emptyBreakdown,
  emptyEntry,
  emptyInput,
  finishView,
  flushPoints,
  isFinished,
  isHeels,
  leaders,
  nobPoints,
  pegView,
  readConfig,
  resolveMode,
  runPoints,
  scoreCards,
  scoreDeal,
  scoreRound,
  skunkFor,
  skunkLabel,
  skunkLine,
  unitFor,
  unitTotals,
  unitsFor,
  validateRound,
  type Card,
  type CribbageInput,
  type Suit,
} from './logic';

// ── fixtures ─────────────────────────────────────────────────────────────────

/** Terse card literal: "5H", "10S", "JD", "AC". */
function c(spec: string): Card {
  const suit = spec.slice(-1) as Suit;
  const face = spec.slice(0, -1);
  const rank = face === 'A' ? 1 : face === 'J' ? 11 : face === 'Q' ? 12 : face === 'K' ? 13 : +face;
  return { rank, suit };
}

const hand = (...specs: string[]): Card[] => specs.map(c);

const players = [
  { id: 'a', name: 'Ada', color: '#111', createdAt: 0 },
  { id: 'b', name: 'Bo', color: '#222', createdAt: 0 },
];

const four = [
  ...players,
  { id: 'c', name: 'Cy', color: '#333', createdAt: 0 },
  { id: 'd', name: 'Di', color: '#444', createdAt: 0 },
];

function ctx(partial: Partial<RoundContext> = {}): RoundContext {
  return {
    players,
    config: {},
    roundIndex: 0,
    totals: { a: 0, b: 0 },
    rounds: [],
    game: {} as Game,
    ...partial,
  } as RoundContext;
}

function input(partial: Partial<CribbageInput> = {}): CribbageInput {
  return {
    dealerId: 'a',
    heels: false,
    entries: { a: emptyEntry(), b: emptyEntry() },
    ...partial,
  };
}

// ── card helpers ─────────────────────────────────────────────────────────────

describe('card values', () => {
  it('counts the ace as one and every face card as ten', () => {
    expect(cardValue(c('AS'))).toBe(1);
    expect(cardValue(c('9H'))).toBe(9);
    expect(cardValue(c('10D'))).toBe(10);
    expect(cardValue(c('JC'))).toBe(10);
    expect(cardValue(c('QS'))).toBe(10);
    expect(cardValue(c('KH'))).toBe(10);
  });

  it('labels cards the way a player reads them', () => {
    expect(cardLabel(c('AS'))).toBe('A♠');
    expect(cardLabel(c('10D'))).toBe('10♦');
    expect(cardLabel(c('JH'))).toBe('J♥');
  });
});

// ── fifteens ─────────────────────────────────────────────────────────────────

describe('countFifteens', () => {
  it('finds the plain two-card fifteen', () => {
    expect(countFifteens(hand('9S', '6H', 'KC', 'QD', '8H'))).toBe(1);
  });

  it('finds three-card and four-card combinations', () => {
    // 4+5+6 = 15, and 4+5+6 is the only one here besides 2+4+9 and 2+4+3+6.
    expect(countFifteens(hand('4S', '5H', '6C', '2D', '9H'))).toBe(3);
  });

  it('counts every ten-card + five pairing separately', () => {
    // Each of J/Q/K/10 makes fifteen with the five: four fifteens = 8.
    expect(countFifteens(hand('JS', 'QH', 'KC', '10D', '5S'))).toBe(4);
  });

  it('counts eight fifteens in the perfect hand', () => {
    // Four ten-cards? No — one jack plus four fives: J+5 ×4, and 5+5+5 ×4.
    expect(countFifteens(hand('JS', '5H', '5C', '5D', '5S'))).toBe(8);
  });

  it('ignores single cards and the empty set', () => {
    expect(countFifteens(hand())).toBe(0);
    expect(countFifteens(hand('KS'))).toBe(0);
  });
});

// ── pairs ────────────────────────────────────────────────────────────────────

describe('countPairs', () => {
  it('scores a plain pair once', () => {
    expect(countPairs(hand('7S', '7H', '2C', '3D', '9S'))).toBe(1);
  });

  it('scores three of a kind as three pairs (pair royal)', () => {
    expect(countPairs(hand('8S', '8H', '8C', '3D', '9S'))).toBe(3);
  });

  it('scores four of a kind as six pairs (double pair royal)', () => {
    expect(countPairs(hand('8S', '8H', '8C', '8D', '9S'))).toBe(6);
  });

  it('does not pair unlike ten-cards', () => {
    expect(countPairs(hand('10S', 'JH', 'QC', 'KD', '2S'))).toBe(0);
  });
});

// ── runs ─────────────────────────────────────────────────────────────────────

describe('runPoints', () => {
  it('scores a run of three', () => {
    expect(runPoints(hand('4S', '5H', '6C', 'KD', '9S'))).toBe(3);
  });

  it('scores a run of four and a run of five', () => {
    expect(runPoints(hand('4S', '5H', '6C', '7D', 'KS'))).toBe(4);
    expect(runPoints(hand('4S', '5H', '6C', '7D', '8S'))).toBe(5);
  });

  it('scores a double run of three as six', () => {
    expect(runPoints(hand('4S', '4H', '5C', '6D', 'KS'))).toBe(6);
  });

  it('scores a triple run of three as nine', () => {
    expect(runPoints(hand('4S', '4H', '4C', '5D', '6S'))).toBe(9);
  });

  it('scores a double-double run of three as twelve', () => {
    expect(runPoints(hand('4S', '4H', '5C', '5D', '6S'))).toBe(12);
  });

  it('scores a double run of four as eight', () => {
    expect(runPoints(hand('4S', '4H', '5C', '6D', '7S'))).toBe(8);
  });

  it('takes only the longest run when two are present', () => {
    // A-2-3 and 6-7-8 both run; only the longest counts, and they tie at three,
    // so the first found wins — never both.
    expect(runPoints(hand('AS', '2H', '3C', '6D', '7S'))).toBe(3);
  });

  it('ignores runs shorter than three', () => {
    expect(runPoints(hand('4S', '5H', 'KC', 'QD', '2S'))).toBe(0);
  });

  it('does not wrap king round to ace', () => {
    expect(runPoints(hand('QS', 'KH', 'AC', '2D', '7S'))).toBe(0);
  });

  it('runs by rank, so J-Q-K counts even though all are worth ten', () => {
    expect(runPoints(hand('JS', 'QH', 'KC', '2D', '7S'))).toBe(3);
  });
});

// ── flush & nob ──────────────────────────────────────────────────────────────

describe('flushPoints', () => {
  it('scores four for a hand flush the starter misses', () => {
    expect(flushPoints(hand('2S', '5S', '9S', 'KS'), c('7H'), false)).toBe(4);
  });

  it('scores five when the starter matches the hand flush', () => {
    expect(flushPoints(hand('2S', '5S', '9S', 'KS'), c('7S'), false)).toBe(5);
  });

  it('gives the crib nothing for four of a suit', () => {
    expect(flushPoints(hand('2S', '5S', '9S', 'KS'), c('7H'), true)).toBe(0);
  });

  it('gives the crib five only when all five share a suit', () => {
    expect(flushPoints(hand('2S', '5S', '9S', 'KS'), c('7S'), true)).toBe(5);
  });

  it('scores nothing on a mixed hand', () => {
    expect(flushPoints(hand('2S', '5S', '9S', 'KH'), c('7S'), false)).toBe(0);
  });
});

describe('nobPoints', () => {
  it('scores one for a jack matching the starter suit', () => {
    expect(nobPoints(hand('JH', '2S', '5C', '9D'), c('7H'))).toBe(1);
  });

  it('scores nothing for a jack of the wrong suit', () => {
    expect(nobPoints(hand('JH', '2S', '5C', '9D'), c('7S'))).toBe(0);
  });

  it('scores nothing when the jack IS the starter (that is heels, not nob)', () => {
    expect(nobPoints(hand('2H', '3S', '5C', '9D'), c('JD'))).toBe(0);
    expect(isHeels(c('JD'))).toBe(true);
    expect(isHeels(c('10D'))).toBe(false);
    expect(isHeels(null)).toBe(false);
  });
});

// ── the whole hand ───────────────────────────────────────────────────────────

describe('scoreCards', () => {
  it('scores the perfect 29 hand', () => {
    // J♠ + 5♥ 5♣ 5♦, cut 5♠: eight fifteens (16), six pairs (12), nob (1).
    const b = scoreCards(hand('JS', '5H', '5C', '5D'), c('5S'));
    expect(b).toEqual({ fifteens: 8, pairs: 6, runs: 0, flush: 0, nob: 1 });
    expect(breakdownTotal(b)).toBe(PERFECT_HAND);
  });

  it('scores 28 when the jack does not match the cut', () => {
    const b = scoreCards(hand('JS', '5H', '5C', '5D'), c('5C'));
    expect(breakdownTotal(b)).toBe(28);
  });

  it('scores 24 for the double-double run with fifteens', () => {
    // 4-4-5-5-6: twelve run points, four fifteens (8), two pairs (4).
    const b = scoreCards(hand('4S', '4H', '5C', '5D'), c('6S'));
    expect(b.runs).toBe(12);
    expect(b.pairs).toBe(2);
    expect(b.fifteens).toBe(4);
    expect(breakdownTotal(b)).toBe(24);
  });

  it('scores 24 for the classic 7-7-8-8 with a cut nine', () => {
    // 7-7-8-8-9: double-double run of three (7,8,9 four ways = 12),
    // fifteens 7+8 ×4 = 8, two pairs = 4.
    const b = scoreCards(hand('7S', '7H', '8C', '8D'), c('9S'));
    expect(b.runs).toBe(12);
    expect(b.fifteens).toBe(4);
    expect(b.pairs).toBe(2);
    expect(breakdownTotal(b)).toBe(24);
  });

  it('never produces nineteen — the "impossible hand"', () => {
    // Exhaustive over a reasonable slice: no five cards can total 19.
    const deck: Card[] = [];
    for (const suit of ['S', 'H', 'D', 'C'] as Suit[]) {
      for (let rank = 1; rank <= 13; rank += 1) deck.push({ rank, suit });
    }
    let checked = 0;
    for (let i = 0; i < deck.length; i += 7) {
      for (let j = i + 1; j < deck.length; j += 5) {
        for (let k = j + 1; k < deck.length; k += 5) {
          for (let l = k + 1; l < deck.length; l += 5) {
            for (let m = l + 1; m < deck.length; m += 5) {
              const total = breakdownTotal(
                scoreCards([deck[i], deck[j], deck[k], deck[l]], deck[m]),
              );
              expect(total).not.toBe(IMPOSSIBLE_HAND);
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('scores a flush hand with a matching starter', () => {
    // 2♥ 4♥ 6♥ 9♥ + cut 8♥: flush of five, plus 6+9 and 2+4+9 fifteens.
    const b = scoreCards(hand('2H', '4H', '6H', '9H'), c('8H'));
    expect(b.flush).toBe(5);
    expect(b.fifteens).toBe(2);
    expect(breakdownTotal(b)).toBe(9);
  });

  it('scores a crib flush only on all five', () => {
    const four = hand('2H', '4H', '6H', '9H');
    expect(scoreCards(four, c('8S'), true).flush).toBe(0);
    expect(scoreCards(four, c('8H'), true).flush).toBe(5);
  });

  it('scores a bare hand with no starter', () => {
    expect(breakdownTotal(scoreCards(hand('7S', '8H', '9C', 'KD')))).toBe(5);
  });

  it('scores zero for a genuinely worthless hand', () => {
    expect(breakdownTotal(scoreCards(hand('2H', '4D', '8C', 'KS'), c('6S')))).toBe(0);
  });
});

describe('breakdownTotal', () => {
  it('doubles fifteens and pairs, and takes runs/flush/nob at face value', () => {
    expect(breakdownTotal({ fifteens: 3, pairs: 2, runs: 5, flush: 4, nob: 1 })).toBe(20);
  });

  it('is zero for an empty or missing breakdown', () => {
    expect(breakdownTotal(emptyBreakdown())).toBe(0);
    expect(breakdownTotal(undefined)).toBe(0);
  });

  it('treats negative or non-numeric components as zero', () => {
    expect(breakdownTotal({ fifteens: -3, pairs: 1, runs: NaN, flush: 4, nob: -1 })).toBe(6);
  });
});

// ── scoring units & the deal ─────────────────────────────────────────────────

describe('unitsFor / resolveMode', () => {
  it('gives every seat its own unit in solo play', () => {
    expect(unitsFor(players, 'solo').map((u) => u.memberIds)).toEqual([['a'], ['b']]);
  });

  it('pairs four seats by pick order into two partnerships', () => {
    expect(unitsFor(four, 'partners').map((u) => u.memberIds)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('falls back to solo when partnerships are asked for without four seats', () => {
    expect(resolveMode({ mode: 'partners' }, 4)).toBe('partners');
    expect(resolveMode({ mode: 'partners' }, 3)).toBe('solo');
    expect(resolveMode({ mode: 'partners' }, 2)).toBe('solo');
    expect(resolveMode({}, 4)).toBe('solo');
  });

  it('finds the unit holding a player', () => {
    const units = unitsFor(four, 'partners');
    expect(unitFor(units, 'd')?.key).toBe('team-2');
    expect(unitFor(units, 'zz')).toBeNull();
    expect(unitFor(units, null)).toBeNull();
  });
});

describe('defaultDealer', () => {
  it('rotates the deal one seat every hand', () => {
    expect(defaultDealer(players, 0)).toBe('a');
    expect(defaultDealer(players, 1)).toBe('b');
    expect(defaultDealer(players, 2)).toBe('a');
    expect(defaultDealer(four, 5)).toBe('b');
  });

  it('is null with nobody seated', () => {
    expect(defaultDealer([], 3)).toBeNull();
  });
});

describe('scoreDeal', () => {
  it('gives the crib and his heels to the dealer alone', () => {
    const i = input({
      heels: true,
      entries: {
        a: {
          pegging: 3,
          hand: { ...emptyBreakdown(), fifteens: 2 },
          crib: { ...emptyBreakdown(), runs: 3 },
        },
        b: {
          pegging: 5,
          hand: { ...emptyBreakdown(), pairs: 1 },
          crib: { ...emptyBreakdown(), runs: 8 },
        },
      },
    });
    const res = scoreDeal(i, players);
    // Dealer: 3 pegged + 4 hand + 3 crib + 2 heels.
    expect(res.a).toMatchObject({
      pegging: 3,
      hand: 4,
      crib: 3,
      heels: 2,
      isDealer: true,
      total: 12,
    });
    // Non-dealer: crib and heels are ignored even though a stale count is stored.
    expect(res.b).toMatchObject({
      pegging: 5,
      hand: 2,
      crib: 0,
      heels: 0,
      isDealer: false,
      total: 7,
    });
  });

  it('withholds heels when the cut was not a jack', () => {
    expect(scoreDeal(input({ heels: false }), players).a.heels).toBe(0);
    expect(scoreDeal(input({ heels: true }), players).a.heels).toBe(HEELS_POINTS);
  });

  it('scores nothing for anyone when the dealer is unset', () => {
    const res = scoreDeal(input({ dealerId: null, heels: true }), players);
    expect(res.a.heels).toBe(0);
    expect(res.b.heels).toBe(0);
  });
});

describe('scoreRound', () => {
  it('mirrors a partnership score onto both partners', () => {
    const cfg = { mode: 'partners' };
    const i: CribbageInput = {
      dealerId: 'c',
      heels: true,
      entries: {
        'team-1': {
          pegging: 4,
          hand: { ...emptyBreakdown(), fifteens: 1 },
          crib: emptyBreakdown(),
        },
        'team-2': {
          pegging: 1,
          hand: { ...emptyBreakdown(), runs: 5 },
          crib: { ...emptyBreakdown(), pairs: 1 },
        },
      },
    };
    const deltas = scoreRound(i, four, cfg);
    expect(deltas).toEqual({ a: 6, b: 6, c: 10, d: 10 });
  });

  it('scores three-handed play as three independent seats', () => {
    const three = four.slice(0, 3);
    const i: CribbageInput = {
      dealerId: 'b',
      heels: false,
      entries: {
        a: { pegging: 2, hand: emptyBreakdown(), crib: emptyBreakdown() },
        b: {
          pegging: 0,
          hand: { ...emptyBreakdown(), fifteens: 2 },
          crib: { ...emptyBreakdown(), nob: 1 },
        },
        c: { pegging: 1, hand: emptyBreakdown(), crib: emptyBreakdown() },
      },
    };
    expect(scoreRound(i, three, {})).toEqual({ a: 2, b: 5, c: 1 });
  });
});

describe('validateRound', () => {
  it('accepts a well-formed deal', () => {
    expect(validateRound(input(), players)).toBeNull();
  });

  it('insists on a dealer', () => {
    expect(validateRound(input({ dealerId: null }), players)).toMatch(/whose deal/i);
  });

  it('rejects a dealer who is not at the table', () => {
    expect(validateRound(input({ dealerId: 'zz' }), players)).toMatch(/isn't in this game/i);
  });

  it('rejects negative pegging and negative counts', () => {
    const bad = input({ entries: { a: { ...emptyEntry(), pegging: -1 }, b: emptyEntry() } });
    expect(validateRound(bad, players)).toMatch(/negative/i);
    const badHand = input({
      entries: { a: { ...emptyEntry(), hand: { ...emptyBreakdown(), runs: -3 } }, b: emptyEntry() },
    });
    expect(validateRound(badHand, players)).toMatch(/negative/i);
  });
});

// ── the board: target, skunks, pegging view ──────────────────────────────────

describe('readConfig', () => {
  it('defaults to the classic long game', () => {
    expect(readConfig({})).toEqual({ target: 121, mode: 'solo', skunks: true });
  });

  it('reads the short 61-hole game and partnerships', () => {
    expect(readConfig({ target: '61', mode: 'partners', skunks: false })).toEqual({
      target: 61,
      mode: 'partners',
      skunks: false,
    });
  });

  it('falls back to 121 on a garbage target', () => {
    expect(readConfig({ target: 'nope' }).target).toBe(121);
    expect(readConfig({ target: 0 }).target).toBe(121);
  });
});

describe('the 121 win threshold', () => {
  it('is not finished one hole short', () => {
    expect(isFinished({ a: 120, b: 118 }, {})).toBe(false);
  });

  it('is finished exactly on 121', () => {
    expect(isFinished({ a: 121, b: 118 }, {})).toBe(true);
  });

  it('is finished past 121', () => {
    expect(isFinished({ a: 126, b: 90 }, {})).toBe(true);
  });

  it('honours a short 61-hole game', () => {
    expect(isFinished({ a: 60, b: 40 }, { target: 61 })).toBe(false);
    expect(isFinished({ a: 61, b: 40 }, { target: 61 })).toBe(true);
  });

  it('picks the highest total as the winner', () => {
    expect(defaultWinners(cribbage, { a: 121, b: 90 }, {})).toEqual(['a']);
  });
});

describe('skunk boundaries', () => {
  it('puts the lines at 91 and 61 on a standard board', () => {
    expect(skunkLine(121)).toBe(91);
    expect(doubleSkunkLine(121)).toBe(61);
  });

  it('keeps the lines proportional on a short 61-hole game', () => {
    expect(skunkLine(61)).toBe(46);
    expect(doubleSkunkLine(61)).toBe(31);
  });

  it('is no skunk at exactly the skunk line', () => {
    expect(skunkFor(91, 121)).toBe('none');
  });

  it('is a skunk one hole below the line', () => {
    expect(skunkFor(90, 121)).toBe('skunk');
  });

  it('is still a skunk at exactly the double line', () => {
    expect(skunkFor(61, 121)).toBe('skunk');
  });

  it('is a double skunk one hole below the double line', () => {
    expect(skunkFor(60, 121)).toBe('double');
    expect(skunkFor(0, 121)).toBe('double');
  });

  it('names the moment', () => {
    expect(skunkLabel(skunkFor(60, 121)).headline).toMatch(/double skunk/i);
    expect(skunkLabel(skunkFor(90, 121)).headline).toMatch(/^skunk/i);
    expect(skunkLabel(skunkFor(100, 121)).headline).toMatch(/pegged out/i);
  });
});

describe('finishView', () => {
  it('stays null while nobody has pegged out', () => {
    expect(finishView({ a: 118, b: 60 }, 121)).toBeNull();
  });

  it('reports the skunk once the winner is home', () => {
    expect(finishView({ a: 121, b: 88 }, 121)).toEqual({
      winnerScore: 121,
      loserScore: 88,
      kind: 'skunk',
    });
  });

  it('reports a double skunk', () => {
    expect(finishView({ a: 122, b: 44 }, 121)?.kind).toBe('double');
  });

  it('needs at least two sides', () => {
    expect(finishView({ a: 130 }, 121)).toBeNull();
  });
});

describe('pegView', () => {
  it('projects this deal onto the board', () => {
    const v = pegView(88, 12, 121);
    expect(v).toMatchObject({ before: 88, projected: 100, remaining: 21, pegsOut: false });
    expect(v.inSkunkRange).toBe(false);
  });

  it('flags the deal that pegs out', () => {
    expect(pegView(115, 9, 121).pegsOut).toBe(true);
    expect(pegView(115, 9, 121).remaining).toBe(0);
  });

  it('flags a projected score still short of the skunk line', () => {
    expect(pegView(70, 6, 121).inSkunkRange).toBe(true);
  });

  it('never pegs backwards past the start', () => {
    expect(pegView(3, -10, 121).projected).toBe(0);
  });
});

describe('unitTotals / leaders', () => {
  it('reads a partnership total off either partner', () => {
    const units = unitsFor(four, 'partners');
    expect(unitTotals(units, { a: 40, b: 40, c: 55, d: 55 })).toEqual({
      'team-1': 40,
      'team-2': 55,
    });
  });

  it('names the side in front', () => {
    expect([...leaders({ x: 40, y: 55 })]).toEqual(['y']);
  });

  it('names nobody on an all-square table', () => {
    expect(leaders({ x: 40, y: 40 }).size).toBe(0);
    expect(leaders({ x: 0, y: 0 }).size).toBe(0);
    expect(leaders({ x: 10 }).size).toBe(0);
  });
});

// ── module surface ───────────────────────────────────────────────────────────

describe('the cribbage module', () => {
  it('is shaped for two to four players', () => {
    expect(cribbage.id).toBe('cribbage');
    expect(cribbage.minPlayers).toBe(2);
    expect(cribbage.maxPlayers).toBe(4);
    expect(cribbage.lowerIsBetter).toBeFalsy();
  });

  it('seeds a fresh deal with the rotating dealer and empty counts', () => {
    const i = cribbage.createRoundInput(ctx({ roundIndex: 3 })) as CribbageInput;
    expect(i.dealerId).toBe('b');
    expect(i.heels).toBe(false);
    expect(Object.keys(i.entries).sort()).toEqual(['a', 'b']);
    expect(breakdownTotal(i.entries.a.hand)).toBe(0);
  });

  it('seeds partnership entries when four play as teams', () => {
    const i = emptyInput(four, 0, { mode: 'partners' });
    expect(Object.keys(i.entries).sort()).toEqual(['team-1', 'team-2']);
  });

  it('scores a deal through the module', () => {
    const i = input({
      heels: true,
      entries: {
        a: {
          pegging: 2,
          hand: { ...emptyBreakdown(), fifteens: 4, pairs: 1 },
          crib: { ...emptyBreakdown(), fifteens: 2 },
        },
        b: { pegging: 6, hand: { ...emptyBreakdown(), runs: 5, nob: 1 }, crib: emptyBreakdown() },
      },
    });
    // Ada deals: 2 pegged + 10 hand + 4 crib + 2 heels = 18. Bo: 6 + 6 = 12.
    expect(cribbage.scoreRound(i, ctx())).toEqual({ a: 18, b: 12 });
  });

  it('validates through the module', () => {
    expect(cribbage.validateRound(input(), ctx())).toBeNull();
    expect(cribbage.validateRound(input({ dealerId: null }), ctx())).toBeTruthy();
  });

  it('is open-ended — the board, not a hand count, ends it', () => {
    expect(cribbage.maxRounds?.({}, 2) ?? null).toBeNull();
  });
});

describe('describeRound', () => {
  it('names the dealer whose crib it was, and the points', () => {
    const round = {
      input: input({ heels: true }),
      deltas: { a: 18, b: 12 },
    } as unknown as Round;
    const text = cribbage.describeRound?.(round, players) ?? '';
    expect(text).toContain("Ada's crib");
    expect(text).toContain('heels');
    expect(text).toContain('Ada +18');
    expect(text).toContain('Bo +12');
  });

  it('degrades gracefully on an unrecorded deal', () => {
    expect(describeDeal(undefined, players)).toMatch(/not recorded/i);
  });
});

describe('roundCellTone', () => {
  const round = (deltas: Record<ID, number>) => ({ deltas }) as unknown as Round;

  it('marks a monster deal', () => {
    expect(cribbage.roundCellTone?.(round({ a: 24 }), 'a')?.tone).toBe('good');
  });

  it('marks a shut-out deal', () => {
    expect(cribbage.roundCellTone?.(round({ a: 0 }), 'a')?.tone).toBe('bad');
  });

  it('leaves an ordinary deal alone', () => {
    expect(cribbage.roundCellTone?.(round({ a: 9 }), 'a')).toBeNull();
  });
});

// ── stats ────────────────────────────────────────────────────────────────────

describe('cribbageStats', () => {
  const game: Game = {
    id: 'g1',
    type: 'cribbage',
    config: { target: 121 },
    playerIds: ['a', 'b'],
    status: 'finished',
    createdAt: 0,
    roundCount: 2,
  };

  const rounds: Round[] = [
    {
      id: 'r1',
      gameId: 'g1',
      index: 0,
      createdAt: 0,
      deltas: { a: 100, b: 20 },
      input: input({
        heels: true,
        entries: {
          a: {
            pegging: 5,
            hand: { ...emptyBreakdown(), fifteens: 8, pairs: 6, nob: 1 },
            crib: { ...emptyBreakdown(), runs: 6 },
          },
          b: { pegging: 2, hand: emptyBreakdown(), crib: emptyBreakdown() },
        },
      }),
    },
    {
      id: 'r2',
      gameId: 'g1',
      index: 1,
      createdAt: 1,
      deltas: { a: 25, b: 20 },
      input: input({
        dealerId: 'b',
        entries: {
          a: { pegging: 1, hand: { ...emptyBreakdown(), fifteens: 2 }, crib: emptyBreakdown() },
          b: {
            pegging: 3,
            hand: { ...emptyBreakdown(), runs: 4 },
            crib: { ...emptyBreakdown(), fifteens: 1 },
          },
        },
      }),
    },
  ];

  const run = () =>
    cribbageStats({ games: [game], rounds, players: players as never, canonical: (id) => id });

  it('records the best hand a player counted', () => {
    const best = run().perPlayer?.a?.find((m) => m.key === 'cb_best');
    expect(best?.value).toBe('29');
  });

  it('counts hands that scored nothing', () => {
    const zero = run().perPlayer?.b?.find((m) => m.key === 'cb_zero');
    expect(zero?.value).toBe('1');
  });

  it('counts crib points taken as dealer', () => {
    expect(run().perPlayer?.a?.find((m) => m.key === 'cb_crib')?.value).toBe('6');
    expect(run().perPlayer?.b?.find((m) => m.key === 'cb_crib')?.value).toBe('2');
  });

  it('counts his heels', () => {
    expect(run().perPlayer?.a?.find((m) => m.key === 'cb_heels')?.value).toBe('1');
  });

  it('credits the skunk to the winner and marks the victim', () => {
    // Final totals: Ada 125, Bo 40 — under 61, so a double skunk.
    expect(run().perPlayer?.a?.find((m) => m.key === 'cb_skunks')?.value).toBe('1');
    expect(run().perPlayer?.b?.find((m) => m.key === 'cb_skunked')?.value).toBe('1');
    expect(run().global?.find((m) => m.key === 'cb_skunks_all')?.value).toBe('1');
  });

  it('returns empty stats with nothing to chew on', () => {
    expect(cribbageStats({ games: [], rounds: [], players: [], canonical: (id) => id })).toEqual({
      perPlayer: {},
      global: [],
    });
  });
});
