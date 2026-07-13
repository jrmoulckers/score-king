import { describe, expect, it } from 'vitest';
import type { Player, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import {
  BASE_CATEGORIES,
  FULL_FLOCK,
  HABITAT_TIERS,
  LEFTOVER_CATEGORY,
  NECTAR_CATEGORY,
  describeWingspanRound,
  emptyRow,
  fieldLabel,
  flockFill,
  habitatTier,
  isNectarOn,
  scoreRow,
  scoreWingspanRound,
  scoringCategories,
  tracksFood,
  validateWingspanRound,
  type WingspanInput,
  type WingspanRow,
} from './logic';
import { wingspan } from './index';

const P = (id: string, name = id): Player => ({ id, name, color: '#7c5cff', createdAt: 0 });

function row(partial: Partial<WingspanRow>): WingspanRow {
  return { ...emptyRow(), ...partial };
}

function ctxFor(players: Player[], config: Record<string, unknown> = {}): RoundContext {
  return { players, config } as unknown as RoundContext;
}

describe('wingspan row scoring', () => {
  it('starts every column at zero', () => {
    const r = emptyRow();
    expect(Object.values(r).every((v) => v === 0)).toBe(true);
    expect(Object.keys(r)).toHaveLength(8);
  });

  it('sums the base six categories into a total', () => {
    // 40 + 8 + 6 + 12 + 5 + 9 = 80
    expect(scoreRow(row({ birds: 40, bonus: 8, goals: 6, eggs: 12, food: 5, tucked: 9 }))).toBe(80);
  });

  it('adds Nectar to the total when present', () => {
    expect(scoreRow(row({ birds: 40, nectar: 11 }))).toBe(51);
  });

  it('never counts unused food (the tiebreaker) toward the score', () => {
    expect(scoreRow(row({ birds: 20, leftover: 9 }))).toBe(20);
    expect(scoreRow(row({ leftover: 50 }))).toBe(0);
  });

  it('treats a missing row as zero', () => {
    expect(scoreRow(undefined)).toBe(0);
  });

  it('coerces non-finite values to zero rather than NaN', () => {
    expect(scoreRow(row({ birds: Number('nope'), eggs: 3 }))).toBe(3);
  });
});

describe('scoreWingspanRound', () => {
  it('totals every player, keyed by id', () => {
    const players = [P('a'), P('b')];
    const input: WingspanInput = {
      rows: {
        a: row({ birds: 30, eggs: 10, tucked: 4 }), // 44
        b: row({ birds: 25, bonus: 7, goals: 3 }), // 35
      },
    };
    expect(scoreWingspanRound(input, players)).toEqual({ a: 44, b: 35 });
  });

  it('scores a player with no entered row as zero', () => {
    expect(scoreWingspanRound({ rows: {} }, [P('a')])).toEqual({ a: 0 });
  });
});

describe('category configuration', () => {
  it('shows exactly the base six by default', () => {
    const cats = scoringCategories({});
    expect(cats).toHaveLength(6);
    expect(cats.map((c) => c.key)).toEqual(['birds', 'bonus', 'goals', 'eggs', 'food', 'tucked']);
  });

  it('appends Nectar as a seventh column when Oceania is on', () => {
    const cats = scoringCategories({ nectar: true });
    expect(cats).toHaveLength(7);
    expect(cats[cats.length - 1].key).toBe('nectar');
  });

  it('base categories are unique and never the reserved tiebreaker', () => {
    const keys = BASE_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(LEFTOVER_CATEGORY.key);
    expect(NECTAR_CATEGORY.key).toBe('nectar');
    expect(LEFTOVER_CATEGORY.key).toBe('leftover');
  });

  it('reads the config toggles with the right defaults', () => {
    expect(isNectarOn(undefined)).toBe(false);
    expect(isNectarOn({ nectar: true })).toBe(true);
    expect(tracksFood(undefined)).toBe(true); // tracked unless explicitly disabled
    expect(tracksFood({ trackFood: false })).toBe(false);
  });

  it('splits entry between fast point fields and +1 token steppers', () => {
    const byKey = Object.fromEntries(scoringCategories({ nectar: true }).map((c) => [c.key, c.entry]));
    // Big totals get a typeable field...
    expect(byKey.birds).toBe('points');
    expect(byKey.bonus).toBe('points');
    expect(byKey.goals).toBe('points');
    expect(byKey.nectar).toBe('points');
    // ...the 1-point tallies keep the stepper nudge.
    expect(byKey.eggs).toBe('count');
    expect(byKey.food).toBe('count');
    expect(byKey.tucked).toBe('count');
    // The tiebreaker is a token tally too.
    expect(LEFTOVER_CATEGORY.entry).toBe('count');
  });
});

describe('habitatTier', () => {
  it('lists the four habitats forest → oceania', () => {
    expect(HABITAT_TIERS.map((t) => t.key)).toEqual(['forest', 'grassland', 'wetland', 'oceania']);
  });

  it('climbs through the tiers as the flock grows', () => {
    expect(habitatTier(0).key).toBe('forest');
    expect(habitatTier(39).key).toBe('forest');
    expect(habitatTier(40).key).toBe('grassland');
    expect(habitatTier(69).key).toBe('grassland');
    expect(habitatTier(70).key).toBe('wetland');
    expect(habitatTier(99).key).toBe('wetland');
    expect(habitatTier(100).key).toBe('oceania');
    expect(habitatTier(999).key).toBe('oceania');
  });

  it('clamps negatives and NaN to the first habitat', () => {
    expect(habitatTier(-10).key).toBe('forest');
    expect(habitatTier(Number.NaN).key).toBe('forest');
  });

  it('always carries an emoji + label, never colour alone', () => {
    for (const t of HABITAT_TIERS) {
      expect(t.emoji.length).toBeGreaterThan(0);
      expect(t.label.length).toBeGreaterThan(0);
    }
  });
});

describe('flockFill', () => {
  it('fills 0 → 1 across a full flock', () => {
    expect(flockFill(0)).toBe(0);
    expect(flockFill(FULL_FLOCK / 2)).toBeCloseTo(0.5);
    expect(flockFill(FULL_FLOCK)).toBe(1);
  });

  it('clamps a runaway flock and non-finite totals', () => {
    expect(flockFill(FULL_FLOCK * 3)).toBe(1);
    expect(flockFill(-50)).toBe(0);
    expect(flockFill(Number.NaN)).toBe(0);
  });
});

describe('validateWingspanRound', () => {
  const players = [P('a', 'Robin')];

  it('accepts a clean sheet', () => {
    expect(validateWingspanRound({ rows: { a: row({ birds: 42, eggs: 6 }) } }, players)).toBeNull();
  });

  it('rejects negative values with the player name', () => {
    const msg = validateWingspanRound({ rows: { a: row({ birds: -1 }) } }, players);
    expect(msg).toContain('Robin');
    expect(msg).toContain('negative');
  });

  it('rejects fractional values', () => {
    expect(validateWingspanRound({ rows: { a: row({ eggs: 2.5 }) } }, players)).toContain('whole number');
  });

  it('rejects absurdly high typos', () => {
    expect(validateWingspanRound({ rows: { a: row({ birds: 1000 }) } }, players)).toContain('too high');
  });

  it('validates the unused-food tiebreaker column too', () => {
    expect(validateWingspanRound({ rows: { a: row({ leftover: -3 }) } }, players)).toContain('negative');
  });

  it('is lenient about a player who has no row yet', () => {
    expect(validateWingspanRound({ rows: {} }, players)).toBeNull();
  });
});

describe('fieldLabel', () => {
  it('maps every row key to a friendly label', () => {
    expect(fieldLabel('birds')).toBe('Birds');
    expect(fieldLabel('nectar')).toBe('Nectar');
    expect(fieldLabel('leftover')).toBe('Unused food');
  });
});

describe('describeWingspanRound', () => {
  it('summarises each player total for the history table', () => {
    const players = [P('a', 'Ava'), P('b', 'Ben')];
    const input: WingspanInput = { rows: { a: row({ birds: 80 }), b: row({ birds: 55 }) } };
    expect(describeWingspanRound(input, players)).toBe('Ava 80 · Ben 55');
  });

  it('reads "no scores" for an empty sheet', () => {
    expect(describeWingspanRound({ rows: {} }, [])).toBe('no scores');
  });
});

describe('winner resolution (highest reigns)', () => {
  it('crowns the highest total', () => {
    expect(defaultWinners(wingspan, { a: 88, b: 91, c: 77 })).toEqual(['b']);
  });

  it('returns co-leaders on an exact tie (settle by unused food at the table)', () => {
    expect(defaultWinners(wingspan, { a: 85, b: 85, c: 70 }).sort()).toEqual(['a', 'b']);
  });
});

describe('wingspan game module', () => {
  it('exposes faithful metadata and a single final scoresheet', () => {
    expect(wingspan.id).toBe('wingspan');
    expect(wingspan.minPlayers).toBeGreaterThanOrEqual(1);
    expect(wingspan.maxPlayers).toBeGreaterThanOrEqual(wingspan.minPlayers);
    expect(wingspan.lowerIsBetter).toBeFalsy();
    expect(wingspan.maxRounds?.({}, 4)).toBe(1);
  });

  it('ships the expansion + tiebreaker toggles with the right defaults', () => {
    const byKey = Object.fromEntries((wingspan.configFields ?? []).map((f) => [f.key, f]));
    expect(byKey.nectar?.default).toBe(false);
    expect(byKey.trackFood?.default).toBe(true);
  });

  it('creates a fresh, all-zero row per player', () => {
    const players = [P('a'), P('b')];
    const input = wingspan.createRoundInput(ctxFor(players)) as WingspanInput;
    expect(Object.keys(input.rows).sort()).toEqual(['a', 'b']);
    expect(scoreRow(input.rows.a)).toBe(0);
  });

  it('wires scoreRound to the pure engine', () => {
    const players = [P('a'), P('b')];
    const input: WingspanInput = {
      rows: { a: row({ birds: 50, eggs: 10 }), b: row({ birds: 40, nectar: 5 }) },
    };
    expect(wingspan.scoreRound(input, ctxFor(players))).toEqual({ a: 60, b: 45 });
  });

  it('validates through the module surface', () => {
    const players = [P('a', 'Sky')];
    expect(wingspan.validateRound({ rows: { a: row({ birds: 3.3 }) } }, ctxFor(players))).toContain(
      'whole number',
    );
  });

  it('describes a recorded round', () => {
    const players = [P('a', 'Ava')];
    const round = { input: { rows: { a: row({ birds: 61 }) } } } as unknown as Round;
    expect(wingspan.describeRound?.(round, players)).toBe('Ava 61');
  });
});
