import { get } from 'svelte/store';
import { animate } from 'motion/mini';
import { settings } from './stores/settings';

/**
 * The single source of truth for whether motion should be reduced.
 *
 * Honors the in-app Motion setting (Accessibility screen) first, and only
 * defers to the OS `prefers-reduced-motion` when the setting is 'system':
 *   - 'reduce' → always reduced, regardless of the OS
 *   - 'full'   → never reduced, regardless of the OS
 *   - 'system' → follow the OS preference
 *
 * Reads the store synchronously via `get` so it can gate imperative
 * (JS/WAAPI) animations, which CSS overrides cannot reach.
 */
export function prefersReducedMotion(): boolean {
  const pref = get(settings).motion;
  if (pref === 'reduce') return true;
  if (pref === 'full') return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type AnimateControls = ReturnType<typeof animate>;

/**
 * A finished, no-op stand-in for `animate`'s controls, returned when motion is
 * reduced. `.finished` is already resolved so callers that chain on it (e.g.
 * `controls.finished.finally(...)`) still run their follow-up — instantly.
 */
function skippedAnimation(): AnimateControls {
  const finished = Promise.resolve();
  const noop = () => {};
  return {
    time: 0,
    speed: 1,
    startTime: null,
    state: 'finished',
    duration: 0,
    iterationDuration: 0,
    stop: noop,
    play: noop,
    pause: noop,
    complete: noop,
    cancel: noop,
    attachTimeline: () => noop,
    finished,
    then: (onResolve: VoidFunction, onReject?: VoidFunction) =>
      finished.then(onResolve, onReject),
  } as unknown as AnimateControls;
}

/**
 * Drop-in wrapper around `motion`'s `animate` that bakes the reduced-motion
 * preference in at the library boundary. When motion is reduced the animation
 * is skipped and a finished, controls-compatible object is returned, leaving
 * the element at its resting (final) state. Routing every `animate` call
 * through here keeps current and future imperative animations automatically
 * safe, while preserving the `controls.finished` contract callers rely on.
 */
export function animateMotion(...args: Parameters<typeof animate>): AnimateControls {
  if (prefersReducedMotion()) return skippedAnimation();
  return animate(...args);
}
