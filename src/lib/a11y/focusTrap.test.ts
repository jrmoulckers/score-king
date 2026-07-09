import { describe, expect, it } from 'vitest';
import { nextTrapTarget } from './focusTrap';

// Lightweight stand-ins — nextTrapTarget only uses reference identity and order.
function els(n: number): HTMLElement[] {
  return Array.from({ length: n }, () => ({ focus() {} }) as unknown as HTMLElement);
}

describe('nextTrapTarget', () => {
  it('returns null when there is nothing focusable', () => {
    expect(nextTrapTarget([], null, false)).toBeNull();
  });

  it('wraps from the last element back to the first on Tab', () => {
    const f = els(3);
    expect(nextTrapTarget(f, f[2], false)).toBe(f[0]);
  });

  it('wraps from the first element to the last on Shift+Tab', () => {
    const f = els(3);
    expect(nextTrapTarget(f, f[0], true)).toBe(f[2]);
  });

  it('lets the browser handle a normal move in the middle', () => {
    const f = els(3);
    expect(nextTrapTarget(f, f[1], false)).toBeNull();
    expect(nextTrapTarget(f, f[1], true)).toBeNull();
  });

  it('pulls focus back inside when it has escaped the trap', () => {
    const f = els(3);
    const stray = { focus() {} } as unknown as HTMLElement;
    expect(nextTrapTarget(f, stray, false)).toBe(f[0]);
    expect(nextTrapTarget(f, stray, true)).toBe(f[2]);
    expect(nextTrapTarget(f, null, false)).toBe(f[0]);
  });

  it('cycles a single focusable back onto itself', () => {
    const f = els(1);
    expect(nextTrapTarget(f, f[0], false)).toBe(f[0]);
    expect(nextTrapTarget(f, f[0], true)).toBe(f[0]);
  });
});
