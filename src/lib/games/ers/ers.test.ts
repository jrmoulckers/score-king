import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import { ers } from './index';
import {
  ERS_DEFAULTS,
  createErsInput,
  describeErs,
  handsRemaining,
  isErsFinished,
  readConfig,
  scoreErs,
  validateErs,
  type ErsInput,
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

function input(partial: Partial<ErsInput> = {}): ErsInput {
  return { winnerId: null, note: '', ...partial };
}

// ---- readConfig -------------------------------------------------------------

describe('readConfig', () => {
  it('defaults to a target of 3', () => {
    expect(readConfig(undefined)).toEqual(ERS_DEFAULTS);
    expect(readConfig({})).toEqual({ target: 3 });
  });

  it('reads and clamps a custom target', () => {
    expect(readConfig({ target: 5 })).toEqual({ target: 5 });
    expect(readConfig({ target: -4 })).toEqual({ target: 0 });
    expect(readConfig({ target: '2.9' })).toEqual({ target: 2 });
    expect(readConfig({ target: 'garbage' })).toEqual({ target: 0 });
  });
});

// ---- createErsInput / validateErs / scoreErs -------------------------------

describe('createErsInput', () => {
  it('creates an empty, undecided draft', () => {
    expect(createErsInput()).toEqual({ winnerId: null, note: '' });
  });
});

describe('validateErs', () => {
  it('requires a winner to be picked', () => {
    expect(validateErs(input(), ids)).toBe('Tap the player who collected the whole deck.');
  });

  it('rejects a winner who is not seated', () => {
    expect(validateErs(input({ winnerId: 'ghost' }), ids)).toBe(
      'The recorded winner is not in this game.',
    );
  });

  it('accepts a seated winner', () => {
    expect(validateErs(input({ winnerId: 'A' }), ids)).toBeNull();
  });
});

describe('scoreErs', () => {
  it('awards the winner a single point and everyone else zero', () => {
    expect(scoreErs(input({ winnerId: 'B' }), ids)).toEqual({ A: 0, B: 1, C: 0 });
  });

  it('awards nobody when no winner is recorded', () => {
    expect(scoreErs(input(), ids)).toEqual({ A: 0, B: 0, C: 0 });
  });
});

// ---- isErsFinished / handsRemaining -----------------------------------------

describe('isErsFinished', () => {
  it('never auto-finishes with no target', () => {
    expect(isErsFinished({ A: 99 }, { target: 0 })).toBe(false);
  });

  it('falls back to the default target (3) when config omits it entirely', () => {
    expect(isErsFinished({ A: 2 }, {})).toBe(false);
    expect(isErsFinished({ A: 3 }, {})).toBe(true);
  });

  it('finishes once anyone reaches the target hand-win count', () => {
    expect(isErsFinished({ A: 2, B: 1 }, { target: 3 })).toBe(false);
    expect(isErsFinished({ A: 3, B: 1 }, { target: 3 })).toBe(true);
    expect(isErsFinished({ A: 4, B: 1 }, { target: 3 })).toBe(true);
  });

  it('never finishes an empty board', () => {
    expect(isErsFinished({}, { target: 3 })).toBe(false);
  });
});

describe('handsRemaining', () => {
  it('counts down to the target', () => {
    expect(handsRemaining(1, 3)).toBe(2);
    expect(handsRemaining(3, 3)).toBeNull();
    expect(handsRemaining(4, 3)).toBeNull();
  });

  it('is null with no target', () => {
    expect(handsRemaining(1, 0)).toBeNull();
  });
});

// ---- describeErs -------------------------------------------------------------

describe('describeErs', () => {
  it('names the winner', () => {
    expect(describeErs(input({ winnerId: 'A' }), players)).toBe('🐀 Ada took the deck');
  });

  it('appends an optional note', () => {
    expect(describeErs(input({ winnerId: 'A', note: 'sandwich!' }), players)).toBe(
      '🐀 Ada took the deck — sandwich!',
    );
  });

  it('falls back to a generic label when undecided', () => {
    expect(describeErs(input(), players)).toBe('Hand recorded');
    expect(describeErs(undefined, players)).toBe('Hand recorded');
  });
});

// ---- module wiring ----------------------------------------------------------

describe('ers module', () => {
  it('exposes the expected identity and config fields', () => {
    expect(ers.id).toBe('ers');
    expect(ers.minPlayers).toBe(2);
    expect(ers.maxPlayers).toBe(8);
    const keys = (ers.configFields ?? []).map((f) => f.key);
    expect(keys).toEqual(['target']);
    expect(ers.help).toBeTruthy();
  });

  it('createRoundInput seeds an empty draft', () => {
    expect(ers.createRoundInput(ctx())).toEqual({ winnerId: null, note: '' });
  });

  it('validateRound and scoreRound route through the pure logic', () => {
    expect(ers.validateRound(input(), ctx())).toBe(
      'Tap the player who collected the whole deck.',
    );
    expect(ers.scoreRound(input({ winnerId: 'C' }), ctx())).toEqual({ A: 0, B: 0, C: 1 });
  });

  it('isFinished routes through the target config', () => {
    expect(
      ers.isFinished?.({ A: 3, B: 1, C: 0 }, { config: { target: 3 }, roundCount: 4, playerCount: 3 }),
    ).toBe(true);
    expect(
      ers.isFinished?.({ A: 2, B: 1, C: 0 }, { config: { target: 3 }, roundCount: 3, playerCount: 3 }),
    ).toBe(false);
  });

  it('picks the player with the most hand wins as the winner (default winner logic)', () => {
    const totals = { A: 1, B: 3, C: 2 };
    expect(defaultWinners(ers, totals, { target: 3 })).toEqual(['B']);
  });

  it('describeRound summarises the recorded hand', () => {
    const round = { input: input({ winnerId: 'B' }) } as unknown as Round;
    expect(ers.describeRound?.(round, players)).toBe('🐀 Bo took the deck');
  });
});
