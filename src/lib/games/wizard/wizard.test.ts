import { describe, it, expect } from 'vitest';
import type { Player, Round, RoundContext } from '../../types';
import { wizard } from './index';
import {
  cardsForRound,
  describeRound,
  emptyRow,
  roundsForPlayerCount,
  scoreRound,
  scoreRow,
  validateRound,
  type WizardInput,
} from './logic';

// ── helpers ────────────────────────────────────────────────────────────────
function row(bid: number, tricks: number) {
  return { bid, tricks };
}
function hand(rows: Record<string, ReturnType<typeof row>>): WizardInput {
  return { rows };
}
function player(id: string): Player {
  return { id, name: id.toUpperCase(), color: '#7c5cff', createdAt: 0 };
}
const P3 = ['a', 'b', 'c'].map(player);
const P4 = ['a', 'b', 'c', 'd'].map(player);
const P5 = ['a', 'b', 'c', 'd', 'e'].map(player);
const P6 = ['a', 'b', 'c', 'd', 'e', 'f'].map(player);

// ── cards & rounds ───────────────────────────────────────────────────────────
describe('cardsForRound', () => {
  it('deals one more card each round, 1-based from a 0-based index', () => {
    expect(cardsForRound(0)).toBe(1);
    expect(cardsForRound(1)).toBe(2);
    expect(cardsForRound(19)).toBe(20);
  });
});

describe('roundsForPlayerCount', () => {
  it('is floor(60 / playerCount) for the supported table sizes', () => {
    expect(roundsForPlayerCount(3)).toBe(20);
    expect(roundsForPlayerCount(4)).toBe(15);
    expect(roundsForPlayerCount(5)).toBe(12);
    expect(roundsForPlayerCount(6)).toBe(10);
  });
  it('is 0 for a non-positive player count', () => {
    expect(roundsForPlayerCount(0)).toBe(0);
    expect(roundsForPlayerCount(-1)).toBe(0);
  });
});

// ── single-row scoring ───────────────────────────────────────────────────────
describe('scoreRow', () => {
  it('scores an exact hit: 20 + 10 x bid', () => {
    expect(scoreRow(row(0, 0))).toBe(20);
    expect(scoreRow(row(3, 3))).toBe(50);
    expect(scoreRow(row(7, 7))).toBe(90);
  });
  it('scores a miss: -10 per trick over/under', () => {
    expect(scoreRow(row(3, 1))).toBe(-20); // 2 short
    expect(scoreRow(row(3, 5))).toBe(-20); // 2 over
    expect(scoreRow(row(0, 1))).toBe(-10); // whiffed a zero bid
  });
  it('treats a missing row as an unbid, untaken 0/0 (a hit worth 20)', () => {
    expect(scoreRow(undefined)).toBe(20);
  });
});

describe('scoreRound', () => {
  it('scores every player independently from their own row', () => {
    const deltas = scoreRound(
      hand({ a: row(2, 2), b: row(1, 0), c: row(0, 3) }),
      P3,
    );
    expect(deltas).toEqual({ a: 40, b: -10, c: -30 });
  });
});

// ── validation ──────────────────────────────────────────────────────────────
describe('validateRound', () => {
  it('accepts a round whose tricks total the cards dealt', () => {
    const h = hand({ a: row(2, 1), b: row(0, 1), c: row(1, 1) });
    expect(validateRound(h, P3, 2)).toBeNull(); // round index 2 -> 3 cards
  });
  it('rejects tricks that do not add up to the round number', () => {
    const h = hand({ a: row(2, 1), b: row(0, 1), c: row(1, 0) });
    expect(validateRound(h, P3, 2)).toMatch(/Tricks must total 3/);
  });
  it('rejects a bid above the cards dealt', () => {
    const h = hand({ a: row(5, 0), b: row(0, 0), c: row(0, 0) });
    expect(validateRound(h, P3, 0)).toMatch(/bid must be a whole number between 0 and 1/);
  });
  it('rejects tricks above the cards dealt', () => {
    const h = hand({ a: row(0, 5), b: row(0, 0), c: row(0, 0) });
    expect(validateRound(h, P3, 0)).toMatch(/tricks must be a whole number between 0 and 1/);
  });
  it('rejects a negative bid or trick count', () => {
    const h = hand({ a: row(-1, 0), b: row(0, 0), c: row(0, 0) });
    expect(validateRound(h, P3, 0)).toMatch(/bid must be a whole number/);
  });
  it('rejects a non-integer bid or trick count', () => {
    const h = hand({ a: row(1.5, 0), b: row(0, 0), c: row(0, 0) });
    expect(validateRound(h, P3, 0)).toMatch(/bid must be a whole number/);
  });
  it('scales the round total with the round number', () => {
    const h5 = hand({ a: row(2, 2), b: row(1, 1), c: row(1, 1), d: row(1, 1), e: row(0, 0) });
    expect(validateRound(h5, P5, 4)).toBeNull(); // round index 4 -> 5 cards, tricks sum to 5
  });
});

// ── describeRound ───────────────────────────────────────────────────────────
describe('describeRound', () => {
  it('summarises bid/tricks per player', () => {
    const input = hand({ a: row(2, 2), b: row(1, 0), c: row(0, 3) });
    expect(describeRound(input, P3)).toBe('A 2/2 · B 1/0 · C 0/3');
  });
  it('skips players missing from the round', () => {
    const input = hand({ a: row(2, 2) });
    expect(describeRound(input, P3)).toBe('A 2/2');
  });
});

// ── module wiring ───────────────────────────────────────────────────────────
function ctxFor(
  players: Player[],
  config: Record<string, unknown>,
  roundIndex: number,
  rounds: Round[],
): RoundContext {
  return { game: { id: 'g' } as never, players, config, roundIndex, totals: {}, rounds };
}

describe('wizard module', () => {
  it('has the expected identity and player bounds', () => {
    expect(wizard.id).toBe('wizard');
    expect(wizard.minPlayers).toBe(3);
    expect(wizard.maxPlayers).toBe(6);
    expect(wizard.teams).toBeFalsy();
  });

  it('creates a blank row for every player', () => {
    const input = wizard.createRoundInput(ctxFor(P4, {}, 0, [])) as WizardInput;
    expect(Object.keys(input.rows)).toEqual(['a', 'b', 'c', 'd']);
    expect(input.rows.a).toEqual(emptyRow());
  });

  it('validateRound delegates to the round index for the card count', () => {
    const good = hand({ a: row(1, 1), b: row(0, 0), c: row(0, 0), d: row(0, 0) });
    expect(wizard.validateRound(good, ctxFor(P4, {}, 0, []))).toBeNull();
    const bad = hand({ a: row(1, 1), b: row(0, 1), c: row(0, 0), d: row(0, 0) });
    expect(wizard.validateRound(bad, ctxFor(P4, {}, 0, []))).toMatch(/Tricks must total 1/);
  });

  it('scoreRound matches the pure scoring function', () => {
    const input = hand({ a: row(2, 2), b: row(1, 0), c: row(0, 3), d: row(0, 0) });
    expect(wizard.scoreRound(input, ctxFor(P4, {}, 2, []))).toEqual({
      a: 40,
      b: -10,
      c: -30,
      d: 20,
    });
  });

  it('maxRounds is the deck-derived round count for the table size', () => {
    expect(wizard.maxRounds!({}, 3)).toBe(20);
    expect(wizard.maxRounds!({}, 4)).toBe(15);
    expect(wizard.maxRounds!({}, 5)).toBe(12);
    expect(wizard.maxRounds!({}, 6)).toBe(10);
  });

  it('describeRound summarises the recorded bids/tricks', () => {
    const r: Round = {
      id: 'r0',
      gameId: 'g',
      index: 0,
      input: hand({ a: row(1, 1), b: row(0, 0), c: row(0, 0) }),
      deltas: {},
      createdAt: 0,
    };
    expect(wizard.describeRound!(r, P3)).toBe('A 1/1 · B 0/0 · C 0/0');
  });

  it('has no config fields — Wizard needs none', () => {
    expect(wizard.configFields ?? []).toEqual([]);
  });
});

// ── full-length game sanity check ──────────────────────────────────────────
describe('a full 6-player game', () => {
  it('runs 10 rounds, each round n dealing n cards', () => {
    const rounds = roundsForPlayerCount(6);
    expect(rounds).toBe(10);
    for (let i = 0; i < rounds; i++) {
      expect(cardsForRound(i)).toBe(i + 1);
    }
  });

  it('rejects a round beyond the deck once tricks cannot possibly total it', () => {
    // Round 10 (index 9) deals 10 cards to 6 players — tricks must total 10.
    const h = hand({
      a: row(2, 2),
      b: row(2, 2),
      c: row(2, 2),
      d: row(2, 2),
      e: row(1, 1),
      f: row(1, 0),
    });
    expect(validateRound(h, P6, 9)).toMatch(/Tricks must total 10/);
  });
});
