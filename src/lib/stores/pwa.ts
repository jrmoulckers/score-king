import { writable } from 'svelte/store';
import { registerSW } from 'virtual:pwa-register';
import { showToast } from './toast';

/**
 * Service-worker lifecycle, surfaced to the UI.
 *
 * The app builds with `registerType: 'prompt'` (see vite.config.ts) so a freshly-deployed
 * version never swaps assets out from under a game in progress. Instead the new worker waits and
 * we raise {@link needRefresh}; `UpdateBanner.svelte` offers a single, design-system "Refresh"
 * action that activates it. Coming online-capable for the first time raises a transient
 * "ready to play offline" toast so the local-first promise is visible.
 */

/** True when a new version has been downloaded and is waiting to activate. */
export const needRefresh = writable(false);

/** How often a long-lived tab re-checks for a new deployment (installed apps rarely reload). */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

/** Wire the service worker. Called once from boot. */
export function initPWA(): void {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh.set(true);
    },
    onOfflineReady() {
      showToast('Ready to play offline 🎉', 4000);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Periodically ask the browser to look for a new deployment so an app that stays open for
      // days still learns about updates without a manual reload.
      setInterval(() => {
        void registration.update();
      }, UPDATE_INTERVAL_MS);
    },
  });
}

/** Activate the waiting worker and reload onto the new version. */
export function applyUpdate(): void {
  needRefresh.set(false);
  void updateSW?.(true);
}

/** Keep the current version for now; the prompt returns on the next update check. */
export function dismissUpdate(): void {
  needRefresh.set(false);
}
