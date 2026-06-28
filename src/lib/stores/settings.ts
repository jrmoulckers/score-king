import { writable } from 'svelte/store';

export type Theme = 'dark' | 'light';

export type OneDriveFolderMode = 'app' | 'custom';

export interface Settings {
  theme: Theme;
  oneDriveClientId: string;
  oneDriveFolderMode: OneDriveFolderMode;
  oneDriveCustomPath: string;
  autoSync: boolean;
  lastSync: number | null;
}

const KEY = 'sk_settings';

const defaults: Settings = {
  theme: 'dark',
  oneDriveClientId: '',
  oneDriveFolderMode: 'app',
  oneDriveCustomPath: '',
  autoSync: false,
  lastSync: null,
};

function load(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return defaults;
  }
}

function applyThemeValue(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export const settings = writable<Settings>(load());

settings.subscribe((v) => {
  localStorage.setItem(KEY, JSON.stringify(v));
  applyThemeValue(v.theme);
});

/** Apply the persisted theme before the app mounts (avoids a flash). */
export function applyTheme() {
  applyThemeValue(load().theme);
}

export function toggleTheme() {
  settings.update((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }));
}

export function markSynced(ts: number) {
  settings.update((s) => ({ ...s, lastSync: ts }));
}
