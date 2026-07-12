import type { Game } from './types';
import { settings } from './stores/settings';
import { games } from './stores/games';

/**
 * App icon badging — the number of games still in progress, shown on the installed
 * app's home-screen icon so a player can glance at their phone and see "you've got 2
 * games going" without opening Score King.
 *
 * This is one of the few *native-feeling* PWA affordances that works on an installed
 * iOS 16.4+ home-screen app (where the Web Vibration API does not), as well as on
 * Android and desktop Chrome/Edge. It reflects existing on-device state only — the
 * count of unfinished games — and never talks to a server.
 *
 * Every update is gated two ways so it can't surprise anyone:
 *   1. the in-app `appBadge` setting (default on, one toggle in Gameplay), and
 *   2. actual Badging API support (absent in browser tabs and older iOS).
 */

/** True when the Badging API is available (installed PWA on a supporting platform). */
export function isAppBadgeSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as Navigator & { setAppBadge?: unknown }).setAppBadge === 'function'
  );
}

/** Set the app-icon badge to `count`, or clear it when the count is zero. Safe to call anywhere. */
export function setBadge(count: number): void {
  if (!isAppBadgeSupported()) return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) void nav.setAppBadge?.(count)?.catch(() => {});
    else void nav.clearAppBadge?.()?.catch(() => {});
  } catch {
    // A rejected/broken badge must never break the app.
  }
}

/** Remove the app-icon badge entirely. */
export function clearBadge(): void {
  setBadge(0);
}

/** Count of games still in progress — started, not yet finished/abandoned, not archived. */
export function inProgressCount(list: Game[]): number {
  return list.filter((g) => g.status === 'active' && !g.archived).length;
}

/**
 * Keep the app-icon badge in sync with the number of in-progress games and the user's
 * `appBadge` preference. Called once from boot; reacts to both stores for the app's life.
 */
export function initBadge(): void {
  if (!isAppBadgeSupported()) return;
  let enabled = true;
  let count = 0;

  const refresh = () => setBadge(enabled ? count : 0);

  settings.subscribe((s) => {
    enabled = s.appBadge !== false;
    refresh();
  });
  games.subscribe((list) => {
    count = inProgressCount(list);
    refresh();
  });
}
