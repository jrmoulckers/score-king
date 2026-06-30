/**
 * Screen Wake Lock manager. Keeps the display awake while desired (e.g. during an
 * active game) and transparently re-acquires the lock when the tab regains focus,
 * since the browser releases it automatically when the page is hidden.
 */

let sentinel: WakeLockSentinel | null = null;
let desired = false;

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

async function acquire() {
  if (!desired || sentinel || !isWakeLockSupported()) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Denied, unsupported, or not currently visible — fail silently.
  }
}

export function enableWakeLock() {
  desired = true;
  void acquire();
}

export function disableWakeLock() {
  desired = false;
  if (sentinel) {
    void sentinel.release().catch(() => {});
    sentinel = null;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (desired && document.visibilityState === 'visible') void acquire();
  });
}
