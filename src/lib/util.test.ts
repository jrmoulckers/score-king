import { describe, expect, it } from 'vitest';
import { clamp, cleanName, sameName, rosterFor, MAX_NAME_LEN } from './util';
import type { Player } from './types';

// The Stepper's − / + buttons and its typed-value guard both route through
// `clamp`, so a keyboard user can never push a score past its bounds.
describe('clamp', () => {
  it('returns the value unchanged when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('pins to the minimum when below range', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it('pins to the maximum when above range', () => {
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('honors the exact bounds', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('supports negative ranges', () => {
    expect(clamp(-50, -13, 13)).toBe(-13);
    expect(clamp(50, -13, 13)).toBe(13);
  });
});

// Names are trimmed and length-capped at the storage boundary so a pasted essay of a
// name can't blow out the scoreboard columns or bloat a backup.
describe('cleanName', () => {
  it('trims surrounding whitespace', () => {
    expect(cleanName('  Alex  ')).toBe('Alex');
  });

  it('caps to MAX_NAME_LEN characters', () => {
    const long = 'x'.repeat(MAX_NAME_LEN + 25);
    expect(cleanName(long)).toHaveLength(MAX_NAME_LEN);
  });

  it('is safe on nullish input', () => {
    expect(cleanName(undefined as unknown as string)).toBe('');
  });
});

// Duplicate-name detection is case- and whitespace-insensitive, so "Alex" and " alex "
// read as the same person for the "you already have this player" warning.
describe('sameName', () => {
  it('matches ignoring case and surrounding space', () => {
    expect(sameName('Alex', ' alex ')).toBe(true);
  });

  it('distinguishes genuinely different names', () => {
    expect(sameName('Alex', 'Alexa')).toBe(false);
  });
});

// A game keeps a scorecard column for every id it started with — even one whose member
// was hard-deleted mid-game — so recorded points are never silently dropped.
describe('rosterFor', () => {
  const alex: Player = {
    id: 'a',
    name: 'Alex',
    color: '#7c5cff',
    createdAt: 0,
    claimed: true,
  };

  it('resolves known ids in the given order', () => {
    const out = rosterFor(['a'], [alex]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Alex');
  });

  it('substitutes a placeholder for a removed player, keeping the slot', () => {
    const out = rosterFor(['a', 'ghost'], [alex]);
    expect(out).toHaveLength(2);
    expect(out[1].id).toBe('ghost');
    expect(out[1].name).toBe('Removed player');
  });
});
