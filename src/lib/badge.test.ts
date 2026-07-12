import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAppBadgeSupported, setBadge, clearBadge, inProgressCount } from './badge';
import type { Game } from './types';

/**
 * The badge helper must reflect real on-device state (unfinished games) on the app
 * icon, but only where the Badging API exists and without ever throwing. These tests
 * pin the support gate, the set/clear routing, and the in-progress counting rules.
 */

function game(status: Game['status'], archived = false): Game {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'skullking',
    config: {},
    playerIds: [],
    status,
    archived,
    createdAt: 0,
    roundCount: 0,
  } as Game;
}

describe('inProgressCount', () => {
  it('counts only active, non-archived games', () => {
    const list = [
      game('active'),
      game('active'),
      game('finished'),
      game('abandoned'),
      game('active', true), // archived active — excluded
    ];
    expect(inProgressCount(list)).toBe(2);
  });

  it('is zero for an empty list', () => {
    expect(inProgressCount([])).toBe(0);
  });
});

describe('setBadge / clearBadge', () => {
  const originalSet = Object.getOwnPropertyDescriptor(navigator, 'setAppBadge');
  const originalClear = Object.getOwnPropertyDescriptor(navigator, 'clearAppBadge');
  let setAppBadge: ReturnType<typeof vi.fn>;
  let clearAppBadge: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setAppBadge = vi.fn(() => Promise.resolve());
    clearAppBadge = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'setAppBadge', { value: setAppBadge, configurable: true });
    Object.defineProperty(navigator, 'clearAppBadge', { value: clearAppBadge, configurable: true });
  });

  afterEach(() => {
    if (originalSet) Object.defineProperty(navigator, 'setAppBadge', originalSet);
    else delete (navigator as unknown as { setAppBadge?: unknown }).setAppBadge;
    if (originalClear) Object.defineProperty(navigator, 'clearAppBadge', originalClear);
    else delete (navigator as unknown as { clearAppBadge?: unknown }).clearAppBadge;
  });

  it('reports support based on navigator.setAppBadge', () => {
    expect(isAppBadgeSupported()).toBe(true);
    delete (navigator as unknown as { setAppBadge?: unknown }).setAppBadge;
    expect(isAppBadgeSupported()).toBe(false);
  });

  it('sets the badge for a positive count', () => {
    setBadge(3);
    expect(setAppBadge).toHaveBeenCalledWith(3);
    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  it('clears the badge when the count is zero', () => {
    setBadge(0);
    expect(clearAppBadge).toHaveBeenCalledTimes(1);
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it('clearBadge clears the badge', () => {
    clearBadge();
    expect(clearAppBadge).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the Badging API is unsupported', () => {
    delete (navigator as unknown as { setAppBadge?: unknown }).setAppBadge;
    expect(() => setBadge(5)).not.toThrow();
  });

  it('never throws if setAppBadge rejects synchronously', () => {
    setAppBadge.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setBadge(2)).not.toThrow();
  });
});
