import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import { scrabble } from './index';
import {
  BINGO_BONUS,
  LETTER_VALUES,
  describeRound,
  emptyFinalInput,
  emptyInput,
  emptyTurnInput,
  finalTallySwing,
  isFinalTally,
  isTurn,
  letterValue,
  rackValue,
  scoreRound,
  turnTotal,
  validateRound,
  type FinalTallyInput,
  type ScrabbleInput,
  type TurnInput,
} from './logic';

// ---- helpers ---------------------------------------------------------------

function player(id: string, name = id): Player {
  return { id, name, color: '#7c5cff', createdAt: 0 };
}

const A = player('A', 'Ada');
const B = player('B', 'Bo');
const C = player('C', 'Cy');
const players = [A, B, C];
const ids = players.map((p) => p.id);

function ctx(
  config: Record<string, unknown> = {},
  totals: Record<ID, number> = {},
  roundIndex = 0,
): RoundContext {
  return {
    game: {} as Game,
    players,
    config,
    roundIndex,
    totals,
    rounds: [] as Round[],
  };
}

function turn(playerId: ID | null, points: number, bingo = false): TurnInput {
  return { kind: 'turn', playerId, points, bingo };
}

function final(finisherId: ID | null, remaining: Record<ID, number>): FinalTallyInput {
  return { kind: 'final', finisherId, remaining };
}

// ---- letter values ----------------------------------------------------------

describe('letterValue / rackValue', () => {
  it('matches the standard English tile distribution', () => {
    expect(letterValue('A')).toBe(1);
    expect(letterValue('a')).toBe(1);
    expect(letterValue('D')).toBe(2);
    expect(letterValue('B')).toBe(3);
    expect(letterValue('F')).toBe(4);
    expect(letterValue('K')).toBe(5);
    expect(letterValue('J')).toBe(8);
    expect(letterValue('X')).toBe(8);
    expect(letterValue('Q')).toBe(10);
    expect(letterValue('Z')).toBe(10);
  });

  it('treats blanks/unknowns as 0', () => {
    expect(letterValue('_')).toBe(0);
    expect(letterValue('?')).toBe(0);
    expect(letterValue('')).toBe(0);
    expect(letterValue('AB')).toBe(0);
  });

  it('every real letter is present exactly once', () => {
    const letters = Object.keys(LETTER_VALUES);
    expect(letters).toHaveLength(26);
  });

  it('sums a whole rack, ignoring blanks/non-letters', () => {
    expect(rackValue('QUIZ')).toBe(10 + 1 + 1 + 10);
    expect(rackValue('quiz')).toBe(22);
    expect(rackValue('CAT_')).toBe(3 + 1 + 1);
    expect(rackValue('')).toBe(0);
  });
});

// ---- turn input / scoring ---------------------------------------------------

describe('emptyTurnInput / emptyInput', () => {
  it('rotates the active player by round index', () => {
    expect(emptyTurnInput(ids, 0)).toEqual({ kind: 'turn', playerId: 'A', points: 0, bingo: false });
    expect(emptyTurnInput(ids, 1).playerId).toBe('B');
    expect(emptyTurnInput(ids, 2).playerId).toBe('C');
    expect(emptyTurnInput(ids, 3).playerId).toBe('A');
  });

  it('handles an empty roster gracefully', () => {
    expect(emptyTurnInput([], 0).playerId).toBeNull();
  });

  it('emptyInput defaults to a turn', () => {
    expect(emptyInput(ids, 0)).toEqual(emptyTurnInput(ids, 0));
  });
});

describe('turnTotal', () => {
  it('is just the word value with no bingo', () => {
    expect(turnTotal(turn('A', 24))).toBe(24);
  });
  it('adds the bingo bonus when toggled on', () => {
    expect(turnTotal(turn('A', 24, true))).toBe(24 + BINGO_BONUS);
  });
  it('never goes negative on garbage points', () => {
    expect(turnTotal(turn('A', -5))).toBe(0);
    expect(turnTotal(turn('A', Number.NaN))).toBe(0);
  });
});

describe('scoreRound (turns)', () => {
  it('credits only the active player', () => {
    expect(scoreRound(turn('B', 18), ids)).toEqual({ A: 0, B: 18, C: 0 });
  });
  it('adds the bingo bonus into the same player delta', () => {
    expect(scoreRound(turn('C', 30, true), ids)).toEqual({ A: 0, B: 0, C: 30 + BINGO_BONUS });
  });
  it('scores nothing with no player chosen', () => {
    expect(scoreRound(turn(null, 40), ids)).toEqual({ A: 0, B: 0, C: 0 });
  });
});

describe('validateRound (turns)', () => {
  it('requires a player', () => {
    expect(validateRound(turn(null, 10), players)).toMatch(/who just played/);
  });
  it('rejects an unknown player id', () => {
    expect(validateRound(turn('Z', 10), players)).toMatch(/who just played/);
  });
  it('requires non-negative points', () => {
    expect(validateRound(turn('A', -1), players)).toMatch(/word value/);
  });
  it('accepts a zero-point pass', () => {
    expect(validateRound(turn('A', 0), players)).toBeNull();
  });
  it('accepts a normal scoring turn', () => {
    expect(validateRound(turn('A', 24, true), players)).toBeNull();
  });
});

// ---- final tally -------------------------------------------------------------

describe('emptyFinalInput', () => {
  it('zeroes every player', () => {
    expect(emptyFinalInput(ids)).toEqual({
      kind: 'final',
      finisherId: null,
      remaining: { A: 0, B: 0, C: 0 },
    });
  });
});

describe('finalTallySwing', () => {
  it('sums every other player\'s remaining tile value', () => {
    const input = final('A', { A: 0, B: 6, C: 4 });
    expect(finalTallySwing(input, ids)).toBe(10);
  });
  it('ignores the finisher\'s own remaining entry', () => {
    const input = final('A', { A: 99, B: 6, C: 4 });
    expect(finalTallySwing(input, ids)).toBe(10);
  });
  it('clamps negative/garbage remaining values to 0', () => {
    const input = final('A', { A: 0, B: -5, C: Number.NaN });
    expect(finalTallySwing(input, ids)).toBe(0);
  });
});

describe('scoreRound (final tally)', () => {
  it('moves each rack value from its owner to the finisher', () => {
    const input = final('A', { A: 0, B: 6, C: 4 });
    expect(scoreRound(input, ids)).toEqual({ A: 10, B: -6, C: -4 });
  });
  it('scores nothing with no finisher chosen', () => {
    const input = final(null, { A: 0, B: 6, C: 4 });
    expect(scoreRound(input, ids)).toEqual({ A: 0, B: 0, C: 0 });
  });
  it('a finisher with no remaining opponents nets zero', () => {
    const input = final('A', { A: 0, B: 0, C: 0 });
    expect(scoreRound(input, ids)).toEqual({ A: 0, B: 0, C: 0 });
  });
});

describe('validateRound (final tally)', () => {
  it('requires a finisher', () => {
    expect(validateRound(final(null, {}), players)).toMatch(/went out/);
  });
  it('rejects an unknown finisher id', () => {
    expect(validateRound(final('Z', {}), players)).toMatch(/went out/);
  });
  it('accepts a valid final tally', () => {
    expect(validateRound(final('A', { B: 6, C: 4 }), players)).toBeNull();
  });
});

// ---- type guards --------------------------------------------------------------

describe('isTurn / isFinalTally', () => {
  it('discriminate correctly', () => {
    expect(isTurn(turn('A', 1))).toBe(true);
    expect(isTurn(final('A', {}))).toBe(false);
    expect(isFinalTally(final('A', {}))).toBe(true);
    expect(isFinalTally(turn('A', 1))).toBe(false);
    expect(isTurn(null)).toBe(false);
    expect(isFinalTally(undefined)).toBe(false);
  });
});

// ---- describeRound ------------------------------------------------------------

describe('describeRound', () => {
  it('summarizes an ordinary turn', () => {
    expect(describeRound(turn('A', 24), players)).toBe('Ada scored 24');
  });
  it('calls out a bingo turn', () => {
    expect(describeRound(turn('B', 30, true), players)).toBe(
      `Bo scored ${30 + BINGO_BONUS} (🎉 BINGO! +${BINGO_BONUS})`,
    );
  });
  it('summarizes a final tally with a swing', () => {
    expect(describeRound(final('A', { B: 6, C: 4 }), players)).toBe(
      "🏁 Ada went out — +10 from opponents' racks",
    );
  });
  it('summarizes a final tally with nothing left on the racks', () => {
    expect(describeRound(final('A', { B: 0, C: 0 }), players)).toBe('🏁 Ada went out');
  });
  it('handles missing input', () => {
    expect(describeRound(undefined, players)).toBe('no turn recorded');
  });
});

// ---- module wiring -------------------------------------------------------------

describe('scrabble module', () => {
  it('exposes the expected identity', () => {
    expect(scrabble.id).toBe('scrabble');
    expect(scrabble.minPlayers).toBe(2);
    expect(scrabble.maxPlayers).toBe(4);
    expect(scrabble.help).toBeTruthy();
  });

  it('createRoundInput seeds a rotating turn', () => {
    expect(scrabble.createRoundInput(ctx({}, {}, 1))).toEqual(emptyTurnInput(ids, 1));
  });

  it('scoreRound and validateRound route through the pure logic', () => {
    const input: ScrabbleInput = turn('B', 18, true);
    expect(scrabble.scoreRound(input, ctx())).toEqual({ A: 0, B: 18 + BINGO_BONUS, C: 0 });
    expect(scrabble.validateRound(turn(null, 0), ctx())).toMatch(/who just played/);
  });

  it('picks the highest total as winner', () => {
    const totals = { A: 210, B: 340, C: 180 };
    expect(defaultWinners(scrabble, totals)).toEqual(['B']);
  });

  it('describeRound delegates to the pure helper', () => {
    const round = { input: turn('C', 42) } as unknown as Round;
    expect(scrabble.describeRound?.(round, players)).toBe('Cy scored 42');
  });

  it('roundCellTone flags the bingo player only', () => {
    const round = { input: turn('A', 24, true) } as unknown as Round;
    expect(scrabble.roundCellTone?.(round, 'A')).toEqual({
      tone: 'good',
      label: `BINGO! +${BINGO_BONUS}`,
    });
    expect(scrabble.roundCellTone?.(round, 'B')).toBeNull();
  });

  it('roundCellTone is null for a non-bingo turn and for final-tally rounds', () => {
    const plain = { input: turn('A', 24) } as unknown as Round;
    expect(scrabble.roundCellTone?.(plain, 'A')).toBeNull();
    const finalRound = { input: final('A', { B: 5 }) } as unknown as Round;
    expect(scrabble.roundCellTone?.(finalRound, 'A')).toBeNull();
  });
});
