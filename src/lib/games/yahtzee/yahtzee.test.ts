import { describe, expect, it } from 'vitest';
import type { ID, Player, Round, RoundContext } from '../../types';
import { computeTotals } from '../../scoring';
import { yahtzee } from './index';
import {
  CATEGORIES,
  LAST_INDEX,
  SIXES_INDEX,
  UPPER_BONUS,
  YAHTZEE_BONUS,
  YAHTZEE_INDEX,
  allowsBonusYahtzees,
  categoryForRound,
  clampScore,
  describeRound,
  emptyInput,
  maxRounds,
  roundCellTone,
  scoreRound,
  validCategoryScore,
  validateYahtzee,
  type YahtzeeInput,
} from './logic';

const NAMES = ['Alice', 'Bob', 'Carol'];

function mkPlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: NAMES[i] ?? `P${i + 1}`,
    color: '#7c5cff',
    createdAt: 0,
  }));
}

function ctx(
  players: Player[],
  totals: Record<ID, number>,
  roundIndex: number,
  rounds: Round[] = [],
): RoundContext {
  return { game: {} as never, players, config: {}, roundIndex, totals, rounds };
}

/** Play a full 13-round game from a sequence of per-round score maps. */
function play(
  players: Player[],
  roundScores: Record<ID, number>[],
  bonusYahtzees?: Record<ID, number>,
): { rounds: Round[]; totals: Record<ID, number> } {
  const ids = players.map((p) => p.id);
  const rounds: Round[] = [];
  let totals = computeTotals(rounds, ids);
  roundScores.forEach((scores, i) => {
    const input: YahtzeeInput = { scores, bonusYahtzees: i === LAST_INDEX ? bonusYahtzees : undefined };
    const c = ctx(players, totals, i, rounds);
    const deltas = scoreRound(input, c);
    rounds.push({ id: `r${i}`, gameId: 'g1', index: i, input, deltas, createdAt: 0 });
    totals = computeTotals(rounds, ids);
  });
  return { rounds, totals };
}

describe('yahtzee / categories', () => {
  it('has exactly 13 categories in scorecard order', () => {
    expect(CATEGORIES).toHaveLength(13);
    expect(CATEGORIES[0].id).toBe('ones');
    expect(CATEGORIES[5].id).toBe('sixes');
    expect(CATEGORIES[11].id).toBe('yahtzee');
    expect(CATEGORIES[12].id).toBe('chance');
    expect(SIXES_INDEX).toBe(5);
    expect(YAHTZEE_INDEX).toBe(11);
    expect(LAST_INDEX).toBe(12);
  });

  it('maps round index to category and back out of range', () => {
    expect(categoryForRound(0)?.id).toBe('ones');
    expect(categoryForRound(12)?.id).toBe('chance');
    expect(categoryForRound(13)).toBeNull();
  });

  it('only allows the extra-Yahtzee bonus on the final round', () => {
    expect(allowsBonusYahtzees(11)).toBe(false);
    expect(allowsBonusYahtzees(12)).toBe(true);
  });

  it('reports a fixed 13-round game', () => {
    expect(maxRounds()).toBe(13);
    expect(yahtzee.maxRounds!({}, 4)).toBe(13);
  });
});

describe('yahtzee / clampScore', () => {
  it('clamps an upper-section score to a multiple of its face, within range', () => {
    const twos = CATEGORIES[1];
    expect(clampScore(twos, 6)).toBe(6);
    expect(clampScore(twos, 7)).toBe(6); // rounds down to the nearest multiple of 2
    expect(clampScore(twos, -3)).toBe(0);
    expect(clampScore(twos, 999)).toBe(10); // clamped to max (5 × 2)
  });

  it('collapses a fixed-score category to 0 or the fixed value', () => {
    const fullHouse = CATEGORIES.find((c) => c.id === 'fullHouse')!;
    expect(clampScore(fullHouse, 25)).toBe(25);
    expect(clampScore(fullHouse, 10)).toBe(0);
    expect(clampScore(fullHouse, 0)).toBe(0);
  });

  it('clamps a free-entry category (Chance) into range', () => {
    const chance = CATEGORIES.find((c) => c.id === 'chance')!;
    expect(clampScore(chance, 18)).toBe(18);
    expect(clampScore(chance, -5)).toBe(0);
    expect(clampScore(chance, 999)).toBe(30);
  });
});

describe('yahtzee / validCategoryScore', () => {
  it('rejects a non-multiple upper-section entry', () => {
    const fives = CATEGORIES[4];
    expect(validCategoryScore(fives, 12)).toMatch(/multiple of 5/);
    expect(validCategoryScore(fives, 10)).toBeNull();
  });

  it('rejects an off-value fixed-score entry', () => {
    const yahtzeeCategory = CATEGORIES.find((c) => c.id === 'yahtzee')!;
    expect(validCategoryScore(yahtzeeCategory, 30)).toMatch(/all-or-nothing/);
    expect(validCategoryScore(yahtzeeCategory, 50)).toBeNull();
    expect(validCategoryScore(yahtzeeCategory, 0)).toBeNull();
  });

  it('rejects a negative or over-max score', () => {
    const chance = CATEGORIES.find((c) => c.id === 'chance')!;
    expect(validCategoryScore(chance, -1)).toMatch(/0 or more/);
    expect(validCategoryScore(chance, 40)).toMatch(/exceed 30/);
  });
});

describe('yahtzee / validateYahtzee', () => {
  const players = mkPlayers(2);

  it('flags the first invalid player with their name', () => {
    const input: YahtzeeInput = { scores: { p1: 7, p2: 10 } };
    expect(validateYahtzee(input, ctx(players, { p1: 0, p2: 0 }, 1))).toMatch(/Alice:.*multiple/);
  });

  it('passes a fully valid round', () => {
    const input: YahtzeeInput = { scores: { p1: 6, p2: 10 } };
    expect(validateYahtzee(input, ctx(players, { p1: 0, p2: 0 }, 1))).toBeNull();
  });

  it('rejects negative extra-Yahtzee claims on the final round', () => {
    const input: YahtzeeInput = { scores: { p1: 20, p2: 15 }, bonusYahtzees: { p1: -1, p2: 0 } };
    expect(validateYahtzee(input, ctx(players, { p1: 0, p2: 0 }, LAST_INDEX))).toMatch(
      /can't be negative/,
    );
  });
});

describe('yahtzee / scoreRound — upper bonus', () => {
  const players = mkPlayers(2);

  it('awards +35 the moment Sixes pushes the upper total to 63+', () => {
    // p1 already has 33 from Ones..Fives (3+6+9+12+... let's just use a round number),
    // scoring 30 on Sixes brings them to 63 → bonus fires.
    const input: YahtzeeInput = { scores: { p1: 30, p2: 30 } };
    const totals = { p1: 33, p2: 32 };
    const deltas = scoreRound(input, ctx(players, totals, SIXES_INDEX));
    expect(deltas.p1).toBe(30 + UPPER_BONUS); // 33 + 30 = 63 → bonus
    expect(deltas.p2).toBe(30); // 32 + 30 = 62 → no bonus
  });

  it('does not award the bonus outside the Sixes round', () => {
    const input: YahtzeeInput = { scores: { p1: 12, p2: 0 } };
    const totals = { p1: 60, p2: 0 };
    const deltas = scoreRound(input, ctx(players, totals, 3)); // Fours round
    expect(deltas.p1).toBe(12);
  });
});

describe('yahtzee / scoreRound — extra Yahtzee bonus', () => {
  const players = mkPlayers(2);

  it('adds +100 per extra Yahtzee only on the final (Chance) round', () => {
    const input: YahtzeeInput = { scores: { p1: 20, p2: 15 }, bonusYahtzees: { p1: 2, p2: 0 } };
    const deltas = scoreRound(input, ctx(players, { p1: 0, p2: 0 }, LAST_INDEX));
    expect(deltas.p1).toBe(20 + 2 * YAHTZEE_BONUS);
    expect(deltas.p2).toBe(15);
  });

  it('ignores a bonus claim on a non-final round', () => {
    const input: YahtzeeInput = { scores: { p1: 50 }, bonusYahtzees: { p1: 3 } };
    const deltas = scoreRound(input, ctx([players[0]], { p1: 0 }, YAHTZEE_INDEX));
    expect(deltas.p1).toBe(50);
  });
});

describe('yahtzee / describeRound', () => {
  const players = mkPlayers(2);

  it('summarises a category round', () => {
    const round: Round = {
      id: 'r1',
      gameId: 'g1',
      index: 8,
      input: { scores: { p1: 25, p2: 0 } },
      deltas: { p1: 25, p2: 0 },
      createdAt: 0,
    };
    expect(describeRound(round, players)).toBe('🏠 Full House: Alice 25 · Bob 0');
  });

  it('flags an extra-Yahtzee bonus in the summary', () => {
    const round: Round = {
      id: 'r2',
      gameId: 'g1',
      index: LAST_INDEX,
      input: { scores: { p1: 20 }, bonusYahtzees: { p1: 1 } },
      deltas: { p1: 120 },
      createdAt: 0,
    };
    expect(describeRound(round, [players[0]])).toBe(`🍀 Chance: Alice 20 +${YAHTZEE_BONUS}🎉`);
  });
});

describe('yahtzee / roundCellTone', () => {
  const round = (index: number, score: number): Round => ({
    id: 'r',
    gameId: 'g1',
    index,
    input: { scores: { p1: score } } as YahtzeeInput,
    deltas: { p1: score },
    createdAt: 0,
  });

  it('flags a scratch (0) as bad', () => {
    expect(roundCellTone(round(0, 0), 'p1')).toEqual({ tone: 'bad', label: 'Scratched' });
  });

  it('flags a top score as good', () => {
    expect(roundCellTone(round(0, 5), 'p1')).toEqual({ tone: 'good', label: 'Top score!' });
  });

  it('is neutral for a middling score', () => {
    expect(roundCellTone(round(0, 3), 'p1')).toBeNull();
  });
});

describe('yahtzee / module wiring', () => {
  it('exposes the expected identity and bounds', () => {
    expect(yahtzee.id).toBe('yahtzee');
    expect(yahtzee.minPlayers).toBe(1);
    expect(yahtzee.maxPlayers).toBeGreaterThanOrEqual(10);
    expect(typeof yahtzee.help).toBe('string');
  });

  it('creates a blank round input for every player', () => {
    const players = mkPlayers(2);
    const input = emptyInput(players.map((p) => p.id)) as YahtzeeInput;
    expect(input.scores).toEqual({ p1: 0, p2: 0 });
    expect(input.bonusYahtzees).toEqual({ p1: 0, p2: 0 });
    expect(yahtzee.createRoundInput(ctx(players, { p1: 0, p2: 0 }, 0))).toEqual(input);
  });
});

describe('yahtzee / full game simulation', () => {
  it('crowns the highest total across all 13 rounds, including bonuses', () => {
    const players = mkPlayers(2);
    // p1: aces for the upper bonus path, strong lower section, one extra Yahtzee.
    const roundScores: Record<ID, number>[] = [
      { p1: 3, p2: 1 }, // ones
      { p1: 6, p2: 2 }, // twos
      { p1: 9, p2: 3 }, // threes
      { p1: 12, p2: 4 }, // fours
      { p1: 15, p2: 5 }, // fives
      { p1: 18, p2: 6 }, // sixes → p1 upper = 63 → +35 bonus; p2 = 21 → no bonus
      { p1: 20, p2: 0 }, // 3 of a kind
      { p1: 24, p2: 0 }, // 4 of a kind
      { p1: 25, p2: 0 }, // full house
      { p1: 30, p2: 0 }, // small straight
      { p1: 40, p2: 0 }, // large straight
      { p1: 50, p2: 0 }, // yahtzee
      { p1: 24, p2: 30 }, // chance
    ];
    const { totals } = play(players, roundScores, { p1: 1, p2: 0 });
    // p1 upper: 3+6+9+12+15+18 = 63 (+35 bonus) = 98
    // p1 lower: 20+24+25+30+40+50+24 = 213; plus extra Yahtzee 100 = 313
    // p1 total: 98 + 313 = 411
    expect(totals.p1).toBe(411);
    // p2: upper 1+2+3+4+5+6 = 21 (no bonus) + chance 30 = 51
    expect(totals.p2).toBe(51);
    expect(totals.p1).toBeGreaterThan(totals.p2);
  });
});
