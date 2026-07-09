import { describe, it, expect } from 'vitest';
import type { Game, Player, Round, RoundContext } from '../../types';
import { skullking } from './index';
import {
  emptyRow,
  scoreRound,
  scoreRow,
  totalBid,
  totalTricks,
  validateRound,
  type SKInput,
  type SKRow,
} from './logic';

// ── helpers ──────────────────────────────────────────────────────────────
function row(bid: number, actual: number, bonus = 0): SKRow {
  return { bid, actual, bonus };
}
function hand(rows: Record<string, SKRow>): SKInput {
  return { rows };
}
function player(id: string): Player {
  return { id, name: id.toUpperCase(), color: '#7c5cff', createdAt: 0 };
}
function ctx(
  players: Player[],
  roundIndex: number,
  config: Record<string, unknown> = {},
): RoundContext {
  const game: Game = {
    id: 'g',
    type: 'skullking',
    config,
    playerIds: players.map((p) => p.id),
    status: 'active',
    createdAt: 0,
    roundCount: 0,
  };
  return { game, players, config, roundIndex, totals: {}, rounds: [] };
}

// ── scoreRow ─────────────────────────────────────────────────────────────
describe('skullking scoreRow', () => {
  it('made a positive bid scores 20 × bid', () => {
    expect(scoreRow(row(2, 2), 5, true)).toBe(40);
    expect(scoreRow(row(3, 3), 8, true)).toBe(60);
  });

  it('missed a positive bid loses 10 per trick off', () => {
    expect(scoreRow(row(3, 1), 5, true)).toBe(-20);
    expect(scoreRow(row(1, 3), 5, true)).toBe(-20);
  });

  it('made a zero bid scores 10 × round number', () => {
    expect(scoreRow(row(0, 0), 1, true)).toBe(10);
    expect(scoreRow(row(0, 0), 7, true)).toBe(70);
  });

  it('missed a zero bid loses 10 × round number', () => {
    expect(scoreRow(row(0, 2), 7, true)).toBe(-70);
  });

  it('adds the bonus only when the bid is made (default rule)', () => {
    expect(scoreRow(row(2, 2, 20), 5, true)).toBe(60);
    expect(scoreRow(row(2, 1, 20), 5, true)).toBe(-10); // missed → bonus dropped
  });

  it('adds the bonus even on a miss when bonuses do not require the bid', () => {
    expect(scoreRow(row(2, 1, 20), 5, false)).toBe(10); // -10 + 20
  });

  it('tolerates junk / missing fields', () => {
    expect(scoreRow(emptyRow(), 3, true)).toBe(10); // 0 bid made, round 3
    expect(scoreRow({ bid: NaN as unknown as number, actual: 0, bonus: 0 }, 3, true)).toBe(10);
  });
});

// ── scoreRound / totals ──────────────────────────────────────────────────
describe('skullking scoreRound', () => {
  it('scores every player for the round', () => {
    const players = [player('a'), player('b')];
    const input = hand({ a: row(1, 1, 10), b: row(0, 1) });
    // a: 20×1 + 10 = 30 ; b: missed zero bid on round 2 → -20
    expect(scoreRound(input, players, 2, true)).toEqual({ a: 30, b: -20 });
  });

  it('totalBid and totalTricks sum the table', () => {
    const players = [player('a'), player('b'), player('c')];
    const input = hand({ a: row(2, 1), b: row(1, 2), c: row(0, 0) });
    expect(totalBid(input, players)).toBe(3);
    expect(totalTricks(input, players)).toBe(3);
  });
});

// ── validateRound ────────────────────────────────────────────────────────
describe('skullking validateRound', () => {
  const players = [player('a'), player('b')];

  it('accepts a legal round', () => {
    expect(validateRound(hand({ a: row(1, 1), b: row(0, 0) }), players, 3)).toBeNull();
  });

  it('rejects a bid above the round number', () => {
    expect(validateRound(hand({ a: row(4, 1), b: row(0, 0) }), players, 3)).toMatch(/bid must be/);
  });

  it('rejects more tricks than the round has', () => {
    expect(validateRound(hand({ a: row(1, 5), b: row(0, 0) }), players, 3)).toMatch(/tricks won must be/);
  });

  it('rejects the table taking more tricks than are available', () => {
    expect(validateRound(hand({ a: row(2, 2), b: row(2, 2) }), players, 3)).toMatch(/can't exceed/);
  });

  it('rejects a negative bonus and non-integer bonus', () => {
    expect(validateRound(hand({ a: row(1, 1, -10), b: row(0, 0) }), players, 3)).toMatch(/bonus can't be negative/);
    expect(validateRound(hand({ a: row(1, 1, 5.5), b: row(0, 0) }), players, 3)).toMatch(/bonus must be a whole/);
  });

  it('allows fewer tricks than available (Kraken editions can void a trick)', () => {
    expect(validateRound(hand({ a: row(1, 1), b: row(0, 0) }), players, 5)).toBeNull();
  });
});

// ── module contract ──────────────────────────────────────────────────────
describe('skullking module', () => {
  it('is 10 rounds by default and honours a configured count', () => {
    expect(skullking.maxRounds?.({}, 4)).toBe(10);
    expect(skullking.maxRounds?.({ rounds: 6 }, 4)).toBe(6);
  });

  it('wires validate + score through the module with round context', () => {
    const players = [player('a'), player('b')];
    const c = ctx(players, 1); // roundIndex 1 → round 2
    expect(skullking.validateRound(hand({ a: row(1, 1), b: row(0, 1) }), c)).toBeNull();
    expect(skullking.scoreRound(hand({ a: row(1, 1, 10), b: row(0, 1) }), c)).toEqual({ a: 30, b: -20 });
  });

  it('respects the bonusesRequireBid config flag', () => {
    const players = [player('a')];
    const strict = ctx(players, 4, { bonusesRequireBid: true });
    const loose = ctx(players, 4, { bonusesRequireBid: false });
    expect(skullking.scoreRound(hand({ a: row(2, 1, 20) }), strict)).toEqual({ a: -10 });
    expect(skullking.scoreRound(hand({ a: row(2, 1, 20) }), loose)).toEqual({ a: 10 });
  });

  it('describes a round with each player bid/actual', () => {
    const players = [player('a'), player('b')];
    const round = { input: hand({ a: row(2, 3), b: row(1, 1) }) } as unknown as Round;
    expect(skullking.describeRound?.(round, players)).toBe('A 2/3 · B 1/1');
  });
});
