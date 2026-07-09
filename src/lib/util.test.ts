import { describe, expect, it } from 'vitest';
import { clamp } from './util';

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
