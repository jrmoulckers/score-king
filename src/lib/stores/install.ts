import { writable } from 'svelte/store';

/**
 * PWA install: capture the browser's deferred `beforeinstallprompt` so the app can offer
 * "Install" on its own terms (in the first-run welcome), and detect iOS/standalone so we can
 * fall back to an "Add to Home Screen" hint where Chrome's prompt doesn't exist.
 *
 * Installing is core to the product promise — a local-first PWA that lives on the home screen
 * and works offline — yet the browser only surfaces it in a menu most people never open. This
 * keeps a single captured event at module scope so the affordance survives navigation and the
 * event that fired before any component mounted.
 */

type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

/** True once the browser has offered a native install prompt we can replay on demand. */
export const installAvailable = writable(false);
/** True once the app has been installed this session (hides the affordance). */
export const installed = writable(false);

/** Attach the global listeners. Called once from boot so no early event is missed. */
export function initInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop Chrome's mini-infobar; we surface install ourselves in the welcome hero.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    installAvailable.set(true);
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installAvailable.set(false);
    installed.set(true);
  });
}

/** Replay the captured install prompt. Returns the user's choice, or 'unavailable'. */
export async function promptInstall(): Promise<InstallOutcome> {
  if (!deferred) return 'unavailable';
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  installAvailable.set(false);
  return outcome;
}

/** iOS Safari never fires `beforeinstallprompt`; detect it so we can show a manual hint. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as desktop Safari but exposes touch on a Mac-like UA.
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
  return iOSDevice || iPadOS;
}

/** True when already running as an installed PWA (so no install affordance is needed). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
}
