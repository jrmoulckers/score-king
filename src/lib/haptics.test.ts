import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { haptic, hapticsSupported } from './haptics';
import { settings } from './stores/settings';

/**
 * The haptics helper must be a good table citizen: buzz on the right moments, but
 * only when the user hasn't opted out (setting or reduced-motion) and the device
 * can actually vibrate. These tests pin that three-way gate so a future change
 * can't start buzzing phones that asked for quiet.
 */
describe('haptic', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    // Default settings: haptics on, motion 'full' so reduced-motion never gates.
    settings.update((s) => ({ ...s, haptics: true, motion: 'full' }));
  });

  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'vibrate', original);
    else delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    settings.update((s) => ({ ...s, haptics: true, motion: 'system' }));
  });

  it('vibrates for a known pattern when enabled and supported', () => {
    haptic('save');
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the haptics setting is off', () => {
    settings.update((s) => ({ ...s, haptics: false }));
    haptic('save');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('does nothing when motion is reduced', () => {
    settings.update((s) => ({ ...s, motion: 'reduce' }));
    haptic('win');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('never throws if vibrate rejects', () => {
    vibrate.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => haptic('tick')).not.toThrow();
  });

  it('reports support based on navigator.vibrate', () => {
    expect(hapticsSupported()).toBe(true);
    delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    expect(hapticsSupported()).toBe(false);
  });
});
