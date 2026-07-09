import { describe, it, expect } from 'vitest';
import { computeTotals, standings, leaders } from './scoring';
import type { Round } from './types';

const round = (index: number, deltas: Record<string, number>): Round =>
  ({ id: `r${index}`, gameId: 'g', index, input: {}, deltas }) as unknown as Round;

describe('computeTotals', () => {
  it('sums deltas per player and defaults absent players to 0', () => {
    const rounds = [round(0, { a: 3, b: 1 }), round(1, { a: 2, b: 4 })];
    expect(computeTotals(rounds, ['a', 'b', 'c'])).toEqual({ a: 5, b: 5, c: 0 });
  });
});

describe('standings', () => {
  it('ranks higher-is-better and shares a rank on ties', () => {
    const s = standings({ a: 5, b: 5, c: 2 });
    expect(s.map((x) => [x.playerId, x.rank])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ]);
  });
});

describe('leaders', () => {
  it('is empty at the opening all-tie (0-0)', () => {
    expect(leaders({ a: 0, b: 0 }, ['a', 'b']).size).toBe(0);
  });

  it('is empty on any mid-game all-tie', () => {
    expect(leaders({ a: 7, b: 7, c: 7 }, ['a', 'b', 'c']).size).toBe(0);
  });

  it('is empty for a solo game (no rival to lead)', () => {
    expect(leaders({ a: 9 }, ['a']).size).toBe(0);
  });

  it('marks the single highest scorer when higher is better', () => {
    expect([...leaders({ a: 5, b: 3 }, ['a', 'b'])]).toEqual(['a']);
  });

  it('marks the single lowest scorer when lower is better', () => {
    expect([...leaders({ a: 5, b: 3 }, ['a', 'b'], true)]).toEqual(['b']);
  });

  it('marks every player tied for the top (but not everyone)', () => {
    const l = leaders({ a: 5, b: 5, c: 2 }, ['a', 'b', 'c']);
    expect(l.has('a')).toBe(true);
    expect(l.has('b')).toBe(true);
    expect(l.has('c')).toBe(false);
  });

  it('treats missing totals as 0', () => {
    expect([...leaders({ a: 4 }, ['a', 'b'])]).toEqual(['a']);
  });
});
