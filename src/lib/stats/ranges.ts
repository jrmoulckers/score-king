import type { DateRange } from './types';

export interface RangePreset {
  key: string;
  label: string;
  /** Undefined for "all-time" (no bound). */
  range?: DateRange;
}

/**
 * The time lenses offered on stats surfaces (Court/Stats). Pure — takes `now` so
 * the bucketing is deterministic and unit-testable. "This year" and "This month"
 * are calendar-anchored (local time); "Tonight" is the last 12 hours, tuned to a
 * single game-night session rather than a calendar day so a session that rolls
 * past midnight still reads as one night.
 */
export function rangePresets(now: number = Date.now()): RangePreset[] {
  const d = new Date(now);
  const startOfYear = new Date(d.getFullYear(), 0, 1).getTime();
  const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const tonight = now - 12 * 60 * 60 * 1000;
  return [
    { key: 'all', label: 'All-time' },
    { key: 'year', label: 'This year', range: { from: startOfYear } },
    { key: 'month', label: 'This month', range: { from: startOfMonth } },
    { key: 'tonight', label: 'Tonight', range: { from: tonight } },
  ];
}
