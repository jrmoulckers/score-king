import { writable } from 'svelte/store';

/**
 * First-run welcome: a one-time, device-local flag remembering that the player has seen (and
 * dismissed) the welcome hero on Home. Device-local by design — it's about *this* browser's
 * first impression, not a portable preference — so it lives in localStorage rather than the
 * backed-up settings.
 */

const KEY = 'sk_welcome_dismissed';

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const welcomeDismissed = writable<boolean>(load());

/** Permanently dismiss the first-run welcome hero. */
export function dismissWelcome(): void {
  welcomeDismissed.set(true);
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Private-mode / storage-blocked: dismissal simply won't persist, which is harmless.
  }
}
