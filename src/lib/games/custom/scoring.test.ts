import { describe, expect, it } from 'vitest';
import type { ID, Player, Round } from '../../types';
import {
  scoreCustomRow,
  scoreCustomRound,
  customMaxRounds,
  customIsFinished,
  describeCustomRound,
} from './scoring';
import {
  blankDef,
  duplicateDef,
  moveColumn,
  validateDef,
  defWarnings,
  firstEmoji,
  newColumn,
  effectiveColumns,
  COUNTER_COLUMN_KEY,
  MAX_NAME_LEN,
  MAX_COLUMN_LABEL_LEN,
  MAX_HELP_LEN,
  type CustomGameDef,
} from './types';

function player(id: ID, name: string): Player {
  return { id, name, color: '#7c5cff', createdAt: 0 };
}

/** A counter-shaped def (single implicit column). */
function counterDef(over: Partial<CustomGameDef> = {}): CustomGameDef {
  return { ...blankDef(), name: 'Counter', inputShape: 'counter', ...over };
}

/** A columns-shaped def with a scoring + a penalty column. */
function columnsDef(over: Partial<CustomGameDef> = {}): CustomGameDef {
  const gain = { ...newColumn('Gain'), key: 'g' };
  const pen = { ...newColumn('Penalty'), key: 'p', negative: true };
  return {
    ...blankDef(),
    name: 'Columns',
    inputShape: 'columns',
    columns: [gain, pen],
    ...over,
  };
}

describe('scoreCustomRow', () => {
  it('sums positive columns and subtracts penalty columns', () => {
    const def = columnsDef();
    expect(scoreCustomRow({ g: 10, p: 3 }, def)).toBe(7);
    expect(scoreCustomRow({ g: 0, p: 5 }, def)).toBe(-5);
  });

  it('treats a missing/blank row as zero', () => {
    const def = columnsDef();
    expect(scoreCustomRow(undefined, def)).toBe(0);
    expect(scoreCustomRow({}, def)).toBe(0);
  });

  it('coerces non-numeric cell values to zero', () => {
    const def = columnsDef();
    expect(scoreCustomRow({ g: NaN as unknown as number, p: 2 }, def)).toBe(-2);
  });

  it('uses the single implicit column for a counter def', () => {
    const def = counterDef();
    expect(effectiveColumns(def)).toHaveLength(1);
    expect(scoreCustomRow({ [COUNTER_COLUMN_KEY]: 4 }, def)).toBe(4);
    expect(scoreCustomRow({ [COUNTER_COLUMN_KEY]: -6 }, def)).toBe(-6);
  });
});

describe('scoreCustomRound', () => {
  it('scores every player in order', () => {
    const def = columnsDef();
    const players = [player('a', 'Ann'), player('b', 'Bo')];
    const input = { values: { a: { g: 8, p: 1 }, b: { g: 2, p: 0 } } };
    expect(scoreCustomRound(input, players, def)).toEqual({ a: 7, b: 2 });
  });

  it('defaults a player with no row to zero', () => {
    const def = counterDef();
    const players = [player('a', 'Ann'), player('b', 'Bo')];
    const input = { values: { a: { [COUNTER_COLUMN_KEY]: 5 } } };
    expect(scoreCustomRound(input, players, def)).toEqual({ a: 5, b: 0 });
  });
});

describe('customMaxRounds', () => {
  it('returns the round limit when positive, else null', () => {
    expect(customMaxRounds(counterDef({ roundLimit: 5 }))).toBe(5);
    expect(customMaxRounds(counterDef({ roundLimit: 0 }))).toBeNull();
  });
});

describe('customIsFinished', () => {
  it('never finishes without a target', () => {
    expect(customIsFinished({ a: 999 }, counterDef({ target: 0 }))).toBe(false);
  });

  it('finishes when any total reaches the target (high wins: first to X)', () => {
    const def = counterDef({ target: 100, lowerIsBetter: false });
    expect(customIsFinished({ a: 90, b: 80 }, def)).toBe(false);
    expect(customIsFinished({ a: 100, b: 80 }, def)).toBe(true);
  });

  it('finishes on the target as a bust ceiling (low wins ends like Hearts to 100)', () => {
    const def = counterDef({ target: 100, lowerIsBetter: true });
    expect(customIsFinished({ a: 40, b: 101 }, def)).toBe(true);
  });
});

describe('describeCustomRound', () => {
  const round = (input: unknown): Round => ({
    id: 'r', gameId: 'g', index: 0, input, deltas: {}, createdAt: 0,
  });

  it('summarises a counter round with signed values, skipping zeros', () => {
    const def = counterDef();
    const players = [player('a', 'Ann'), player('b', 'Bo')];
    const r = round({ values: { a: { [COUNTER_COLUMN_KEY]: 5 }, b: { [COUNTER_COLUMN_KEY]: 0 } } });
    expect(describeCustomRound(def, r, players)).toBe('Ann +5');
  });

  it('summarises a columns round as slash-joined values', () => {
    const def = columnsDef();
    const players = [player('a', 'Ann')];
    const r = round({ values: { a: { g: 8, p: 1 } } });
    expect(describeCustomRound(def, r, players)).toBe('Ann 8/1');
  });

  it('returns "no change" when nothing was entered', () => {
    const def = counterDef();
    const players = [player('a', 'Ann')];
    expect(describeCustomRound(def, round({ values: { a: {} } }), players)).toBe('no change');
  });
});

describe('validateDef', () => {
  it('accepts a well-formed def', () => {
    expect(validateDef(counterDef({ name: 'Rummy' }))).toBeNull();
    expect(validateDef(columnsDef({ name: 'Whist' }))).toBeNull();
  });

  it('requires a name', () => {
    expect(validateDef(counterDef({ name: '   ' }))).toMatch(/name/i);
  });

  it('caps the name length', () => {
    expect(validateDef(counterDef({ name: 'x'.repeat(MAX_NAME_LEN + 1) }))).toMatch(/under/i);
  });

  it('caps the how-to-play length', () => {
    expect(validateDef(counterDef({ name: 'Rummy', help: 'y'.repeat(MAX_HELP_LEN + 1) }))).toMatch(
      /how-to-play under/i,
    );
    expect(validateDef(counterDef({ name: 'Rummy', help: 'y'.repeat(MAX_HELP_LEN) }))).toBeNull();
  });

  it('rejects min < 1 and max < min', () => {
    expect(validateDef(counterDef({ minPlayers: 0 }))).toMatch(/Minimum/i);
    expect(validateDef(counterDef({ minPlayers: 4, maxPlayers: 2 }))).toMatch(/Max players/i);
  });

  it('requires every column to have a label', () => {
    const def = columnsDef();
    def.columns[1].label = '  ';
    expect(validateDef(def)).toMatch(/label/i);
  });

  it('rejects duplicate column names (case-insensitive)', () => {
    const def = columnsDef();
    def.columns[0].label = 'Bid';
    def.columns[1].label = 'bid';
    expect(validateDef(def)).toMatch(/different name/i);
  });

  it('caps column label length', () => {
    const def = columnsDef();
    def.columns[0].label = 'y'.repeat(MAX_COLUMN_LABEL_LEN + 1);
    expect(validateDef(def)).toMatch(/column names under/i);
  });

  it('rejects an all-subtracting column set (unwinnable)', () => {
    const def = columnsDef();
    def.columns.forEach((c) => (c.negative = true));
    expect(validateDef(def)).toMatch(/add to the score/i);
  });
});

describe('defWarnings', () => {
  it('warns when both a target and a round limit are set', () => {
    expect(defWarnings(counterDef({ target: 100, roundLimit: 10 }))).toContain(
      'Whichever comes first ends the game: the target or the round limit.',
    );
  });

  it('is silent for a clean single-target def', () => {
    expect(defWarnings(counterDef({ target: 100, roundLimit: 0 }))).toHaveLength(0);
  });
});

describe('firstEmoji', () => {
  it('keeps a single emoji', () => {
    expect(firstEmoji('🎯')).toBe('🎯');
  });

  it('collapses a ZWJ sequence to one glyph', () => {
    expect(firstEmoji('🏴‍☠️')).toBe('🏴‍☠️');
  });

  it('drops trailing text after the first glyph', () => {
    expect(firstEmoji('🎲 dice')).toBe('🎲');
  });

  it('returns empty for blank input', () => {
    expect(firstEmoji('   ')).toBe('');
    expect(firstEmoji(undefined)).toBe('');
  });
});

describe('duplicateDef', () => {
  it('clones into a fresh unsaved def with a new id and copy name', () => {
    const src = columnsDef({ name: 'Skat', archived: true, archivedAt: 1, deleted: 2 });
    const dup = duplicateDef(src);
    expect(dup.id).not.toBe(src.id);
    expect(dup.id.startsWith('def_')).toBe(true);
    expect(dup.name).toBe('Skat copy');
    expect(dup.archived).toBe(false);
    expect(dup.archivedAt).toBeUndefined();
    expect(dup.deleted).toBeUndefined();
    // Columns are deep-copied, not shared.
    expect(dup.columns).not.toBe(src.columns);
    dup.columns[0].label = 'Changed';
    expect(src.columns[0].label).toBe('Gain');
  });

  it('truncates the copy name so a duplicate of a max-length name stays savable', () => {
    const src = counterDef({ name: 'x'.repeat(MAX_NAME_LEN) });
    const dup = duplicateDef(src);
    expect(dup.name.length).toBeLessThanOrEqual(MAX_NAME_LEN);
    // A truncated-but-valid name must not itself trip the length validation.
    expect(validateDef(dup)).toBeNull();
  });
});

describe('moveColumn', () => {
  const cols = () => [
    { ...newColumn('A'), key: 'a' },
    { ...newColumn('B'), key: 'b' },
    { ...newColumn('C'), key: 'c' },
  ];

  it('moves a column up and down, returning a new array', () => {
    const src = cols();
    const up = moveColumn(src, 2, -1);
    expect(up.map((c) => c.key)).toEqual(['a', 'c', 'b']);
    expect(up).not.toBe(src);
    expect(moveColumn(src, 0, 1).map((c) => c.key)).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op at the bounds or for out-of-range indices', () => {
    const src = cols();
    expect(moveColumn(src, 0, -1)).toBe(src);
    expect(moveColumn(src, 2, 1)).toBe(src);
    expect(moveColumn(src, 5, -1)).toBe(src);
  });
});
