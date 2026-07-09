import { describe, expect, it } from 'vitest';
import { rangePresets } from './ranges';

describe('rangePresets', () => {
  // 2024-06-15 14:00 local
  const now = new Date(2024, 5, 15, 14, 0, 0).getTime();

  it('offers all-time, year, month and tonight lenses', () => {
    expect(rangePresets(now).map((p) => p.key)).toEqual(['all', 'year', 'month', 'tonight']);
  });

  it('leaves all-time unbounded', () => {
    expect(rangePresets(now)[0].range).toBeUndefined();
  });

  it('anchors "this year" to Jan 1 local', () => {
    const year = rangePresets(now).find((p) => p.key === 'year')!;
    expect(year.range?.from).toBe(new Date(2024, 0, 1).getTime());
  });

  it('anchors "this month" to the 1st local', () => {
    const month = rangePresets(now).find((p) => p.key === 'month')!;
    expect(month.range?.from).toBe(new Date(2024, 5, 1).getTime());
  });

  it('makes "tonight" a rolling 12-hour window', () => {
    const tonight = rangePresets(now).find((p) => p.key === 'tonight')!;
    expect(tonight.range?.from).toBe(now - 12 * 60 * 60 * 1000);
  });
});
