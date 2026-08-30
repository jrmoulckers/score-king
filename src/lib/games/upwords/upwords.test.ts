import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import { upwords } from './index';
import {
  BINGO_BONUS,
  MAX_STACK_HEIGHT,
  QU_BONUS,
  UNPLAYED_TILE_PENALTY,
  createEndgameInput,
  createTurnInput,
  emptyWordEntry,
  endgamePenalty,
  scoreUpwords,
  turnScore,
  validateUpwords,
  wordScore,
  type UpwordsInput,
  type UpwordsWordEntry,
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

function ctx(config: Record<string, unknown> = {}, totals: Record<ID, number> = {}): RoundContext {
  return {
    game: {} as Game,
    players,
    config,
    roundIndex: 0,
    totals,
    rounds: [] as Round[],
  };
}

function word(letters: number, flat: boolean, stackHeight = letters): UpwordsWordEntry {
  return { letters, flat, stackHeight };
}

function turnInput(overrides: Partial<UpwordsInput> = {}): UpwordsInput {
  return { ...createTurnInput(ids, 'A'), ...overrides };
}

// ---- wordScore ---------------------------------------------------------------

describe('wordScore', () => {
  it('scores a flat word at 2 points per letter', () => {
    expect(wordScore(word(4, true))).toBe(8); // DEAR flat = 4 * 2
  });

  it('scores a stacked word as the sum of tile heights', () => {
    // DEAR built 2/1/3/1 high = 7 (official rules example)
    expect(wordScore(word(4, false, 7))).toBe(7);
  });

  it('floors a stacked word’s height at one tile per letter', () => {
    expect(wordScore(word(4, false, 1))).toBe(4);
  });

  it('scores 0 for a sub-two-letter word (not a legal Upwords play)', () => {
    expect(wordScore(word(1, true))).toBe(0);
  });
});

// ---- turnScore / bonuses ----------------------------------------------------

describe('turnScore', () => {
  it('sums multiple words formed in the same turn', () => {
    // Official example: ON (2 letters flat) + NET (3 letters flat) = 4 + 6 = 10
    const input = turnInput({ words: [word(2, true), word(3, true)] });
    expect(turnScore(input)).toBe(10);
  });

  it('applies the Qu bonus only when every word stays flat', () => {
    const flatWithQu = turnInput({ words: [word(3, true)], quBonus: true });
    expect(turnScore(flatWithQu)).toBe(3 * 2 + QU_BONUS);

    const stackedWithQu = turnInput({ words: [word(3, false, 5)], quBonus: true });
    expect(turnScore(stackedWithQu)).toBe(5); // no Qu bonus — word is stacked
  });

  it('applies the bingo bonus regardless of word shape', () => {
    const input = turnInput({ words: [word(4, true)], bingo: true });
    expect(turnScore(input)).toBe(4 * 2 + BINGO_BONUS);
  });

  it('WOOD example: 4 letters + one tile stacked under the W = 5', () => {
    expect(turnScore(turnInput({ words: [word(4, false, 5)] }))).toBe(5);
  });
});

// ---- endgamePenalty ----------------------------------------------------------

describe('endgamePenalty', () => {
  it('subtracts 5 points per unplayed tile', () => {
    expect(endgamePenalty(3)).toBe(-15);
    expect(endgamePenalty(0)).toBe(0);
  });

  it('clamps negative/garbage input to 0 tiles', () => {
    expect(endgamePenalty(-4)).toBe(0);
    expect(endgamePenalty(Number.NaN)).toBe(0);
  });
});

// ---- scoreUpwords -------------------------------------------------------------

describe('scoreUpwords', () => {
  it('credits only the active player during a turn round', () => {
    const input = turnInput({ activePlayerId: 'B', words: [word(4, true)] });
    expect(scoreUpwords(input, ids)).toEqual({ A: 0, B: 8, C: 0 });
  });

  it('applies rack penalties to every player during an endgame round', () => {
    const input = createEndgameInput(ids);
    input.unplayedTiles = { A: 0, B: 2, C: 1 };
    expect(scoreUpwords(input, ids)).toEqual({
      A: 0,
      B: -2 * UNPLAYED_TILE_PENALTY,
      C: -1 * UNPLAYED_TILE_PENALTY,
    });
  });

  it('no-ops (all zero) when the active player is missing or has left the game', () => {
    expect(scoreUpwords(turnInput({ activePlayerId: null }), ids)).toEqual({
      A: 0,
      B: 0,
      C: 0,
    });
    expect(scoreUpwords(turnInput({ activePlayerId: 'ghost' }), ids)).toEqual({
      A: 0,
      B: 0,
      C: 0,
    });
  });
});

// ---- validateUpwords ----------------------------------------------------------

describe('validateUpwords', () => {
  it('requires an active player for a turn round', () => {
    expect(validateUpwords(turnInput({ activePlayerId: null }), ids)).toMatch(/whose turn/i);
    expect(validateUpwords(turnInput({ activePlayerId: 'ghost' }), ids)).toMatch(/no longer/i);
  });

  it('requires at least one word', () => {
    expect(validateUpwords(turnInput({ words: [] }), ids)).toMatch(/at least one word/i);
  });

  it('rejects a sub-two-letter word', () => {
    expect(validateUpwords(turnInput({ words: [word(1, true)] }), ids)).toMatch(/2 letters/i);
  });

  it('rejects a stacked word whose height is below its letter count', () => {
    expect(validateUpwords(turnInput({ words: [word(4, false, 3)] }), ids)).toMatch(
      /can.t be less than/i,
    );
  });

  it('rejects a stacked word taller than the 5-tile max', () => {
    const tooTall = word(2, false, 2 * MAX_STACK_HEIGHT + 1);
    expect(validateUpwords(turnInput({ words: [tooTall] }), ids)).toMatch(/stack higher/i);
  });

  it('accepts a valid turn round', () => {
    expect(validateUpwords(turnInput({ words: [word(4, true)] }), ids)).toBeNull();
  });

  it('rejects negative unplayed tile counts in endgame mode', () => {
    const input = createEndgameInput(ids);
    input.unplayedTiles = { A: -1, B: 0, C: 0 };
    expect(validateUpwords(input, ids)).toMatch(/negative/i);
  });

  it('accepts a valid endgame round', () => {
    expect(validateUpwords(createEndgameInput(ids), ids)).toBeNull();
  });
});

// ---- input factories ------------------------------------------------------

describe('createTurnInput / createEndgameInput / emptyWordEntry', () => {
  it('creates a flat two-letter starter word', () => {
    expect(emptyWordEntry()).toEqual({ letters: 2, flat: true, stackHeight: 2 });
  });

  it('seeds a turn round with the given active player and one starter word', () => {
    const input = createTurnInput(ids, 'B');
    expect(input.mode).toBe('turn');
    expect(input.activePlayerId).toBe('B');
    expect(input.words).toEqual([emptyWordEntry()]);
    expect(input.unplayedTiles).toEqual({ A: 0, B: 0, C: 0 });
  });

  it('seeds an endgame round with no active player and zeroed racks', () => {
    const input = createEndgameInput(ids);
    expect(input.mode).toBe('endgame');
    expect(input.activePlayerId).toBeNull();
    expect(input.words).toEqual([]);
    expect(input.unplayedTiles).toEqual({ A: 0, B: 0, C: 0 });
  });
});

// ---- module wiring ---------------------------------------------------------

describe('upwords module', () => {
  it('exposes the expected identity', () => {
    expect(upwords.id).toBe('upwords');
    expect(upwords.minPlayers).toBe(2);
    expect(upwords.maxPlayers).toBe(4);
    expect(upwords.help).toBeTruthy();
  });

  it('createRoundInput rotates the suggested active player by round index', () => {
    const c0 = ctx();
    expect(upwords.createRoundInput(c0)).toMatchObject({ activePlayerId: 'A', mode: 'turn' });
    const c1 = { ...c0, roundIndex: 1 };
    expect(upwords.createRoundInput(c1)).toMatchObject({ activePlayerId: 'B' });
  });

  it('validateRound and scoreRound route through the pure logic', () => {
    const input = turnInput({ activePlayerId: 'C', words: [word(3, true)] });
    expect(upwords.validateRound(input, ctx())).toBeNull();
    expect(upwords.scoreRound(input, ctx())).toEqual({ A: 0, B: 0, C: 6 });
  });

  it('picks the highest total as winner (default winners)', () => {
    const totals = { A: 40, B: 90, C: 12 };
    expect(defaultWinners(upwords, totals)).toEqual(['B']);
  });

  it('describeRound summarises a turn round with bonuses', () => {
    const input = turnInput({
      activePlayerId: 'A',
      words: [word(4, true)],
      bingo: true,
      quBonus: true,
    });
    const round = { input } as unknown as Round;
    expect(upwords.describeRound?.(round, players)).toBe(
      `Ada +${4 * 2 + BINGO_BONUS + QU_BONUS} (+${BINGO_BONUS} bingo, +${QU_BONUS} Qu)`,
    );
  });

  it('describeRound summarises an endgame round', () => {
    const input = createEndgameInput(ids);
    input.unplayedTiles = { A: 0, B: 2, C: 0 };
    const round = { input, deltas: { A: 0, B: -10, C: 0 } } as unknown as Round;
    expect(upwords.describeRound?.(round, players)).toBe('🏁 Rack penalties: Bo -10');
  });
});
