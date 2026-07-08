import { describe, expect, it } from 'vitest';
import type { Player, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import {
  activeCategories,
  categoryVP,
  category,
  cleanValue,
  emptyRow,
  leftoverEnabled,
  scoreRow,
  scoreWyrmspan,
  validateRow,
  WYRMSPAN_CATEGORIES,
  type WyrmspanInput,
  type WyrmspanRow,
} from './logic';
import { wyrmspan } from './index';

function row(partial: Partial<WyrmspanRow>): WyrmspanRow {
  return { ...emptyRow(), ...partial };
}

// A full, hand-computed tally used across several cases.
// 5 + 24 + 6 + 9 + 7 + 3 + 4 + 5 + floor(11/4)=2  = 65  (63 without leftover)
const FULL: WyrmspanRow = {
  guild: 5,
  dragons: 24,
  abilities: 6,
  objectives: 9,
  eggs: 7,
  cached: 3,
  tucked: 4,
  coins: 5,
  leftover: 11,
};

describe('wyrmspan categories', () => {
  it('defines the eight official end-game categories in tally order', () => {
    expect(WYRMSPAN_CATEGORIES.map((c) => c.key)).toEqual([
      'guild',
      'dragons',
      'abilities',
      'objectives',
      'eggs',
      'cached',
      'tucked',
      'coins',
      'leftover',
    ]);
  });

  it('only the leftover category is optional, and it bundles 4 items per VP', () => {
    const optional = WYRMSPAN_CATEGORIES.filter((c) => c.optional).map((c) => c.key);
    expect(optional).toEqual(['leftover']);
    expect(category('leftover').kind).toBe('bundle');
    expect(category('leftover').per).toBe(4);
  });

  it('every category has label, short, emoji and help copy', () => {
    for (const c of WYRMSPAN_CATEGORIES) {
      expect(c.label.length, c.key).toBeGreaterThan(0);
      expect(c.short.length, c.key).toBeGreaterThan(0);
      expect(c.emoji.length, c.key).toBeGreaterThan(0);
      expect(c.help.length, c.key).toBeGreaterThan(0);
    }
  });
});

describe('cleanValue', () => {
  it('keeps non-negative whole numbers', () => {
    expect(cleanValue(0)).toBe(0);
    expect(cleanValue(7)).toBe(7);
  });
  it('floors fractions and coerces strings', () => {
    expect(cleanValue(3.9)).toBe(3);
    expect(cleanValue('5')).toBe(5);
  });
  it('clamps negatives, NaN, blanks and junk to 0', () => {
    expect(cleanValue(-4)).toBe(0);
    expect(cleanValue(NaN)).toBe(0);
    expect(cleanValue('')).toBe(0);
    expect(cleanValue(undefined)).toBe(0);
    expect(cleanValue('nope')).toBe(0);
  });
});

describe('categoryVP', () => {
  it('vp categories score their entered value directly', () => {
    expect(categoryVP(category('dragons'), 24)).toBe(24);
    expect(categoryVP(category('guild'), 0)).toBe(0);
  });
  it('count categories score 1 VP per item', () => {
    expect(categoryVP(category('eggs'), 7)).toBe(7);
    expect(categoryVP(category('coins'), 5)).toBe(5);
  });
  it('the leftover bundle scores 1 VP per 4, rounded down', () => {
    const left = category('leftover');
    expect(categoryVP(left, 0)).toBe(0);
    expect(categoryVP(left, 3)).toBe(0);
    expect(categoryVP(left, 4)).toBe(1);
    expect(categoryVP(left, 7)).toBe(1);
    expect(categoryVP(left, 8)).toBe(2);
    expect(categoryVP(left, 11)).toBe(2);
  });
});

describe('activeCategories / leftoverEnabled', () => {
  it('includes all nine categories by default', () => {
    expect(activeCategories().length).toBe(9);
    expect(activeCategories({ scoreLeftover: true }).map((c) => c.key)).toContain('leftover');
  });
  it('drops the leftover category when disabled', () => {
    expect(leftoverEnabled({ scoreLeftover: false })).toBe(false);
    const keys = activeCategories({ scoreLeftover: false }).map((c) => c.key);
    expect(keys).not.toContain('leftover');
    expect(keys.length).toBe(8);
  });
  it('treats a missing toggle as enabled (faithful default)', () => {
    expect(leftoverEnabled(undefined)).toBe(true);
    expect(leftoverEnabled({})).toBe(true);
  });
});

describe('scoreRow', () => {
  it('sums the full sheet, bundling leftover items', () => {
    expect(scoreRow(FULL)).toBe(65);
  });
  it('excludes leftover VP when the toggle is off', () => {
    expect(scoreRow(FULL, { scoreLeftover: false })).toBe(63);
  });
  it('an empty sheet is worth zero', () => {
    expect(scoreRow(emptyRow())).toBe(0);
    expect(scoreRow(undefined)).toBe(0);
  });
  it('ignores negative junk in any field', () => {
    expect(scoreRow(row({ dragons: -10, eggs: 4 }))).toBe(4);
  });
  it('adds up a simple mixed sheet', () => {
    // 3 guild + 2 eggs + 2 tucked + floor(6/4)=1 = 8
    expect(scoreRow(row({ guild: 3, eggs: 2, tucked: 2, leftover: 6 }))).toBe(8);
  });
});

describe('scoreWyrmspan', () => {
  const input: WyrmspanInput = { rows: { a: FULL, b: row({ dragons: 10, eggs: 2 }) } };

  it('scores every requested player', () => {
    expect(scoreWyrmspan(input, ['a', 'b'])).toEqual({ a: 65, b: 12 });
  });
  it('treats an absent player as zero', () => {
    expect(scoreWyrmspan(input, ['a', 'z'])).toEqual({ a: 65, z: 0 });
  });
  it('respects the leftover toggle for all players', () => {
    expect(scoreWyrmspan(input, ['a', 'b'], { scoreLeftover: false })).toEqual({ a: 63, b: 12 });
  });
  it('handles empty/undefined input', () => {
    expect(scoreWyrmspan(undefined, ['a'])).toEqual({ a: 0 });
  });
});

describe('validateRow', () => {
  it('accepts zero and positive entries', () => {
    expect(validateRow(emptyRow())).toBeNull();
    expect(validateRow(FULL)).toBeNull();
    expect(validateRow(undefined)).toBeNull();
  });
  it('rejects a negative entry and names the category + player', () => {
    const err = validateRow(row({ eggs: -1 }), 'Vera');
    expect(err).toContain('Vera');
    expect(err).toContain('Eggs');
  });
});

// --- The assembled GameModule (index.ts) ---------------------------------------

function mkPlayers(...names: string[]): Player[] {
  return names.map((name, i) => ({
    id: `p${i}`,
    name,
    color: '#7c5cff',
    createdAt: 0,
  }));
}

function mkCtx(players: Player[], config: Record<string, unknown> = {}): RoundContext {
  return {
    game: {
      id: 'g1',
      type: 'wyrmspan',
      config,
      playerIds: players.map((p) => p.id),
      status: 'active',
      createdAt: 0,
      roundCount: 0,
    },
    players,
    config,
    roundIndex: 0,
    totals: Object.fromEntries(players.map((p) => [p.id, 0])),
    rounds: [],
  };
}

describe('wyrmspan module', () => {
  it('is identified by its folder and flagged highest-wins', () => {
    expect(wyrmspan.id).toBe('wyrmspan');
    expect(wyrmspan.lowerIsBetter).toBeFalsy();
    expect(wyrmspan.minPlayers).toBe(1);
    expect(wyrmspan.maxPlayers).toBe(5);
  });

  it('is a single-scoresheet game (one round)', () => {
    expect(wyrmspan.maxRounds?.({}, 3)).toBe(1);
  });

  it('exposes the leftover variant toggle, defaulting on', () => {
    const toggle = wyrmspan.configFields?.find((f) => f.key === 'scoreLeftover');
    expect(toggle?.type).toBe('boolean');
    expect(toggle?.default).toBe(true);
  });

  it('creates a fresh zeroed sheet for every player', () => {
    const players = mkPlayers('Vera', 'Milo');
    const input = wyrmspan.createRoundInput(mkCtx(players)) as WyrmspanInput;
    expect(Object.keys(input.rows)).toEqual(['p0', 'p1']);
    expect(input.rows.p0).toEqual(emptyRow());
  });

  it('validates and then scores a round for the roster', () => {
    const players = mkPlayers('Vera', 'Milo');
    const ctx = mkCtx(players);
    const input: WyrmspanInput = { rows: { p0: FULL, p1: row({ dragons: 30, coins: 3 }) } };
    expect(wyrmspan.validateRound(input, ctx)).toBeNull();
    expect(wyrmspan.scoreRound(input, ctx)).toEqual({ p0: 65, p1: 33 });
  });

  it('surfaces a validation error with the offending player name', () => {
    const players = mkPlayers('Vera', 'Milo');
    const ctx = mkCtx(players);
    const input: WyrmspanInput = { rows: { p0: emptyRow(), p1: row({ tucked: -2 }) } };
    expect(wyrmspan.validateRound(input, ctx)).toContain('Milo');
  });

  it('honors the leftover toggle through the module', () => {
    const players = mkPlayers('Vera');
    const ctx = mkCtx(players, { scoreLeftover: false });
    const input: WyrmspanInput = { rows: { p0: FULL } };
    expect(wyrmspan.scoreRound(input, ctx)).toEqual({ p0: 63 });
  });

  it('picks the highest total as the winner', () => {
    const totals = { p0: 65, p1: 33 };
    expect(defaultWinners(wyrmspan, totals)).toEqual(['p0']);
  });

  it('describes a recorded round from its computed deltas', () => {
    const players = mkPlayers('Vera', 'Milo');
    const round = {
      id: 'r1',
      gameId: 'g1',
      index: 0,
      input: { rows: { p0: FULL, p1: row({ dragons: 30 }) } },
      deltas: { p0: 65, p1: 30 },
      createdAt: 0,
    } as unknown as Round;
    expect(wyrmspan.describeRound?.(round, players)).toBe('Vera 65 · Milo 30');
  });

  it('ships help text that lists every scoring category', () => {
    for (const c of WYRMSPAN_CATEGORIES) {
      expect(wyrmspan.help ?? '').toContain(c.label);
    }
  });
});
