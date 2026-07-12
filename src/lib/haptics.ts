import { get } from 'svelte/store';
import { settings } from './stores/settings';
import { prefersReducedMotion } from './motion';

/**
 * Tasteful, opt-out haptic feedback for the moments that matter at the table —
 * a saved round, an undo, a win. Kept deliberately tiny: a game-night helper
 * should feel physical when you commit a score, never buzz for decoration.
 *
 * Every buzz is gated three ways so it can never surprise or annoy:
 *   1. the in-app `haptics` setting (default on, one toggle in Accessibility),
 *   2. the reduced-motion preference (a physical buzz is motion too), and
 *   3. actual `navigator.vibrate` support (absent on desktop and iOS Safari).
 *
 * Patterns are short and distinct so a saved round and a win don't feel the same.
 */
export type HapticPattern = 'tick' | 'save' | 'win' | 'undo' | 'buzz';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tick: 8, // a single light nudge for a stepper ±
  save: 18, // a firm "it landed" for a saved round
  win: [22, 40, 22, 40, 60], // a celebratory triple-tap for a win
  undo: [10, 30, 10], // a gentle double for a reversal
  buzz: [90, 50, 90], // an insistent "time's up!" for the turn timer
};

function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Fire a haptic pattern if the user hasn't turned haptics or motion off and the
 * device supports vibration. Safe to call unconditionally from any interaction —
 * it no-ops everywhere it shouldn't run.
 */
export function haptic(pattern: HapticPattern): void {
  if (!canVibrate()) return;
  if (prefersReducedMotion()) return;
  if (get(settings).haptics === false) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // A rejected/broken vibrate must never break score entry.
  }
}

/** True when the current device can produce haptics at all — for gating UI copy. */
export function hapticsSupported(): boolean {
  return canVibrate();
}
