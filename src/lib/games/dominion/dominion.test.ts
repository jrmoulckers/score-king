import { describe, expect, it } from 'vitest';
import type { Game, Player, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import {
  DOMINION_HELP,
  VP,
  describeDominion,
  emptyInput,
  emptyRow,
  gardensPoints,
  gardensValue,
  scoreDominion,
  scoreRow,
  validateDominion,
  type DominionRow,
} from './logic';
import { dominion } from './index';

function player(id: string, name = id): Player {
  return { id, name, color: '#7c5cff', createdAt: 0 };
}
const players = [player('a', 'Ada'), player('b', 'Bo')];

function ctxWith(ps: Player[]): RoundContext {
  const game: Game = {
    id: 'g',
    type: 'dominion',
    config: {},
    playerIds: ps.map((p) => p.id),
    status: 'active',
    createdAt: 0,
    roundCount: 0,
  };
  return {
    game,
    players: ps,
    config: {},
    roundIndex: 0,
    totals: Object.fromEntries(ps.map((p) => [p.id, 0])),
    rounds: [],
  };
}

function row(overrides: Partial<DominionRow> = {}): DominionRow {
  return { ...emptyRow(), ...overrides };
}

describe('official VP values', () => {
  it('matches the rulebook: Estate 1, Duchy 3, Province 6, Curse -1', () => {
    expect(VP.estate).toBe(1);
    expect(VP.duchy).toBe(3);
    expect(VP.province).toBe(6);
    expect(VP.curse).toBe(-1);
  });
});

describe('gardensValue', () => {
  it('is 1 VP per 10 cards in the deck, rounded down', () => {
    expect(gardensValue(0)).toBe(0);
    expect(gardensValue(9)).toBe(0);
    expect(gardensValue(10)).toBe(1);
    expect(gardensValue(34)).toBe(3);
    expect(gardensValue(99)).toBe(9);
  });

  it('clamps a negative or non-finite deck size to 0', () => {
    expect(gardensValue(-20)).toBe(0);
    expect(gardensValue(Number.NaN)).toBe(0);
    expect(gardensValue(undefined)).toBe(0);
  });
});

describe('gardensPoints', () => {
  it('multiplies Gardens owned by the per-Gardens value', () => {
    expect(gardensPoints(row({ gardens: 2, deckSize: 34 }))).toBe(6); // 2 * 3
    expect(gardensPoints(row({ gardens: 3, deckSize: 10 }))).toBe(3); // 3 * 1
  });

  it('is 0 with no Gardens or an undefined row', () => {
    expect(gardensPoints(row({ deckSize: 50 }))).toBe(0);
    expect(gardensPoints(undefined)).toBe(0);
  });
});

describe('scoreRow', () => {
  it('is 0 for an empty or missing row', () => {
    expect(scoreRow(emptyRow())).toBe(0);
    expect(scoreRow(undefined)).toBe(0);
  });

  it('scores basic Victory cards at their official values', () => {
    expect(scoreRow(row({ estates: 3 }))).toBe(3);
    expect(scoreRow(row({ duchies: 2 }))).toBe(6);
    expect(scoreRow(row({ provinces: 4 }))).toBe(24);
    expect(scoreRow(row({ curses: 2 }))).toBe(-2);
  });

  it('adds Gardens using the deck-size formula', () => {
    // 34-card deck: each Gardens is worth floor(34/10) = 3.
    expect(scoreRow(row({ gardens: 2, deckSize: 34 }))).toBe(6);
  });

  it('adds free-form Other VP, positive or negative', () => {
    expect(scoreRow(row({ otherVP: 5 }))).toBe(5);
    expect(scoreRow(row({ otherVP: -2 }))).toBe(-2);
  });

  it('ignores turns taken — it is recorded, not scored', () => {
    expect(scoreRow(row({ estates: 1, turns: 27 }))).toBe(1);
  });

  it('matches a worked example combining every category', () => {
    // 4 Estates (4) + 3 Duchies (9) + 2 Provinces (12) + 1 Curse (-1) +
    // 2 Gardens on a 40-card deck (2*4=8) + 3 Other VP = 35.
    const example = row({
      estates: 4,
      duchies: 3,
      provinces: 2,
      curses: 1,
      gardens: 2,
      deckSize: 40,
      otherVP: 3,
    });
    expect(scoreRow(example)).toBe(35);
  });

  it('treats a NaN entry as 0', () => {
    const r = emptyRow();
    r.estates = Number.NaN;
    expect(scoreRow(r)).toBe(0);
  });
});

describe('scoreDominion', () => {
  it('returns each seated player total', () => {
    const input = emptyInput(players);
    input.values.a = row({ provinces: 3, estates: 2 });
    input.values.b = row({ duchies: 1, curses: 1 });
    expect(scoreDominion(input, players)).toEqual({ a: 20, b: 2 });
  });

  it('scores a player with no row as 0', () => {
    const input = emptyInput([players[0]]);
    input.values.a = row({ provinces: 1 });
    expect(scoreDominion(input, players)).toEqual({ a: 6, b: 0 });
  });

  it('is 0 for everyone with an undefined input', () => {
    expect(scoreDominion(undefined, players)).toEqual({ a: 0, b: 0 });
  });
});

describe('validateDominion', () => {
  it('accepts a fresh or fully-filled sheet', () => {
    expect(validateDominion(emptyInput(players), players)).toBeNull();
    const input = emptyInput(players);
    input.values.a = row({ provinces: 4, gardens: 1, deckSize: 30, otherVP: -2 });
    expect(validateDominion(input, players)).toBeNull();
  });

  it('rejects negative card counts, naming the player and category', () => {
    const input = emptyInput(players);
    input.values.a.provinces = -1;
    const err = validateDominion(input, players);
    expect(err).toContain('Ada');
    expect(err).toContain('Provinces');
  });

  it('rejects fractional card counts', () => {
    const input = emptyInput(players);
    input.values.b.estates = 2.5;
    expect(validateDominion(input, players)).toMatch(/whole number/);
  });

  it('allows Other VP to go negative but not fractional', () => {
    const input = emptyInput(players);
    input.values.a.otherVP = -4;
    expect(validateDominion(input, players)).toBeNull();
    input.values.a.otherVP = 1.5;
    expect(validateDominion(input, players)).toMatch(/whole number/);
  });

  it('treats blank / NaN as 0 rather than an error', () => {
    const r = emptyRow();
    r.estates = Number.NaN;
    expect(validateDominion({ values: { a: r } }, [player('a')])).toBeNull();
  });

  it('is null for an undefined input or a player with no row', () => {
    expect(validateDominion(undefined, players)).toBeNull();
    expect(validateDominion({ values: {} }, players)).toBeNull();
  });
});

describe('describeDominion', () => {
  it('summarises each player total', () => {
    const input = emptyInput(players);
    input.values.a = row({ provinces: 4, estates: 2 });
    input.values.b = row({ duchies: 1 });
    const rd = { id: 'r', gameId: 'g', index: 0, input, deltas: {}, createdAt: 0 } as Round;
    expect(describeDominion(rd, players)).toBe('Ada 26 · Bo 3');
  });

  it('returns empty string when nothing is recorded', () => {
    const rd = {
      id: 'r',
      gameId: 'g',
      index: 0,
      input: undefined,
      deltas: {},
      createdAt: 0,
    } as Round;
    expect(describeDominion(rd, players)).toBe('');
  });
});

describe('dominion module', () => {
  it('declares faithful catalog metadata', () => {
    expect(dominion.id).toBe('dominion');
    expect(dominion.name).toBe('Dominion');
    expect(dominion.emoji).toBe('🏰');
    expect(dominion.minPlayers).toBe(2);
    expect(dominion.maxPlayers).toBe(6);
  });

  it('is a single final scoresheet', () => {
    expect(dominion.maxRounds?.({}, 4)).toBe(1);
  });

  it('seeds a zeroed row per player', () => {
    const input = dominion.createRoundInput(ctxWith(players)) as ReturnType<typeof emptyInput>;
    expect(Object.keys(input.values).sort()).toEqual(['a', 'b']);
    for (const p of players) {
      expect(input.values[p.id]).toEqual(emptyRow());
    }
  });

  it('wires scoring and validation to the logic core', () => {
    const input = emptyInput(players);
    input.values.a = row({ provinces: 3, estates: 1 });
    input.values.b = row({ duchies: 2 });
    expect(dominion.scoreRound(input, ctxWith(players))).toEqual({ a: 19, b: 6 });
    expect(dominion.validateRound(input, ctxWith(players))).toBeNull();
    input.values.a.curses = -1;
    expect(dominion.validateRound(input, ctxWith(players))).toContain('Ada');
  });

  it('awards the win to the highest total, sharing ties', () => {
    expect(defaultWinners(dominion, { a: 35, b: 12 })).toEqual(['a']);
    expect(defaultWinners(dominion, { a: 30, b: 30 }).sort()).toEqual(['a', 'b']);
  });

  it('ships a scoring help reference that states the official VP values and tie-break', () => {
    expect(dominion.help).toBe(DOMINION_HELP);
    expect(dominion.help).toContain('1 VP');
    expect(dominion.help).toContain('3 VP');
    expect(dominion.help).toContain('6 VP');
    expect(dominion.help).toContain('-1 VP');
    expect(dominion.help).toContain('fewest turns');
  });
});
