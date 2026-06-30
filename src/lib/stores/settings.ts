import { writable } from 'svelte/store';

export type Theme = 'dark' | 'light';

export type OneDriveFolderMode = 'app' | 'custom';

/** How motion is handled: follow the OS, always reduce, or never reduce. */
export type MotionPref = 'system' | 'reduce' | 'full';

export type FontScale = 'sm' | 'md' | 'lg' | 'xl';

/** Multipliers applied to the root font size for each text-size step. */
export const FONT_SCALE_VALUES: Record<FontScale, number> = {
  sm: 0.9,
  md: 1,
  lg: 1.15,
  xl: 1.3,
};

export interface Settings {
  theme: Theme;
  /** True-black surfaces for OLED screens (dark theme only). */
  oled: boolean;
  fontScale: FontScale;
  motion: MotionPref;
  highContrast: boolean;
  /** Remap player colors to a color-blind-friendly palette. */
  colorBlind: boolean;
  /** Hold a screen wake lock while a game is being played. */
  keepAwake: boolean;
  /** Blur scores with a tap-to-reveal veil after the phone is set down. */
  privacyGuard: boolean;
  oneDriveClientId: string;
  oneDriveFolderMode: OneDriveFolderMode;
  oneDriveCustomPath: string;
  /** File name of the active backup within the configured folder (the sync target). */
  oneDriveBackupFile: string;
  autoSync: boolean;
  oneDriveConnected: boolean;
  lastSync: number | null;
  lastRestore: number | null;
}

const KEY = 'sk_settings';

const defaults: Settings = {
  theme: 'dark',
  oled: false,
  fontScale: 'md',
  motion: 'system',
  highContrast: false,
  colorBlind: false,
  keepAwake: false,
  privacyGuard: false,
  oneDriveClientId: '',
  oneDriveFolderMode: 'app',
  oneDriveCustomPath: '',
  oneDriveBackupFile: 'Main.xlsx',
  autoSync: true,
  oneDriveConnected: false,
  lastSync: null,
  lastRestore: null,
};

function load(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return defaults;
  }
}

function apply(s: Settings) {
  const el = document.documentElement;
  el.setAttribute('data-theme', s.theme);
  el.toggleAttribute('data-oled', s.oled);
  el.setAttribute('data-motion', s.motion);
  el.toggleAttribute('data-contrast', s.highContrast);
  el.style.setProperty('--font-scale', String(FONT_SCALE_VALUES[s.fontScale] ?? 1));
}

export const settings = writable<Settings>(load());

settings.subscribe((v) => {
  localStorage.setItem(KEY, JSON.stringify(v));
  apply(v);
});

/** Apply persisted settings (theme + accessibility) before the app mounts, avoiding a flash. */
export function applySettings() {
  apply(load());
}

export function toggleTheme() {
  settings.update((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }));
}

export function markSynced(ts: number) {
  settings.update((s) => ({ ...s, lastSync: ts }));
}

export function markRestored(ts: number) {
  settings.update((s) => ({ ...s, lastRestore: ts }));
}
