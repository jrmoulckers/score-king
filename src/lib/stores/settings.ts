import { get, writable } from 'svelte/store';

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
  // ── Portable preferences ──────────────────────────────────────────────────
  // Device-agnostic user choices. These are stored in the backup file so they
  // travel with a restore. Keep this group in sync with PORTABLE_SETTING_KEYS.
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

  // ── Device-local sync state ───────────────────────────────────────────────
  // OneDrive connection, the backup file's own location, and per-device sync
  // bookkeeping. Deliberately NOT backed up (see LOCAL_SETTING_KEYS) — restoring
  // these onto another device would create dead/conflicting state.
  oneDriveClientId: string;
  oneDriveFolderMode: OneDriveFolderMode;
  oneDriveCustomPath: string;
  /** File name of the active backup within the configured folder (the sync target). */
  oneDriveBackupFile: string;
  /** OneDrive eTag of the active backup, for optimistic-concurrency writes (device-local). */
  oneDriveBackupEtag: string;
  autoSync: boolean;
  oneDriveConnected: boolean;
  lastSync: number | null;
  lastRestore: number | null;
  /**
   * When this device last successfully confirmed the remote backup's state — either a
   * cheap eTag peek from the foreground poll or a full pull. Device-local bookkeeping (a
   * heartbeat for the "Last checked …" indicator), never backed up.
   */
  lastCheck: number | null;

  /**
   * Per-device override for the live-play relay URL (a `wss://` origin). Empty uses the
   * built-in {@link RELAY_URL} default. Device-local like the OneDrive client-ID override:
   * a relay endpoint is connection state, not a portable preference, so it isn't backed up.
   */
  relayUrl: string;

  // ── Device identity ───────────────────────────────────────────────────────
  // Which member is the active "lead" on THIS device; their portable prefs are
  // applied to the device. Device-specific (each device picks its own lead), so it
  // is NOT backed up — the members themselves (each carrying their own prefs) are.
  leadMemberId: string | null;
}

/**
 * Settings written to (and restored from) the backup file. These are portable
 * user preferences with no device- or connection-specific meaning, so carrying
 * them across devices via a restore is always safe.
 *
 * Adding a new setting? If it's a portable preference, list it here so it gets
 * backed up. If it's device/connection state, list it in LOCAL_SETTING_KEYS
 * instead. The compile-time guard below fails the build until every key of
 * {@link Settings} is categorized in exactly one of the two arrays.
 */
export const PORTABLE_SETTING_KEYS = [
  'theme',
  'oled',
  'fontScale',
  'motion',
  'highContrast',
  'colorBlind',
  'keepAwake',
  'privacyGuard',
] as const;

/**
 * Settings intentionally kept OUT of the backup: the OneDrive client-ID override, the
 * backup file's folder location, the active backup file and its eTag, the auto-backup
 * toggle, the "connected" flag, and the last-sync/last-restore stamps. Backing these up
 * risks dead state on restore (e.g. a custom folder path or active file that doesn't exist
 * on the new device, or a "connected" flag for an account this device isn't signed into).
 */
export const LOCAL_SETTING_KEYS = [
  'oneDriveClientId',
  'oneDriveFolderMode',
  'oneDriveCustomPath',
  'oneDriveBackupFile',
  'oneDriveBackupEtag',
  'autoSync',
  'oneDriveConnected',
  'lastSync',
  'lastRestore',
  'lastCheck',
  'relayUrl',
  'leadMemberId',
] as const;

export type PortableSettingKey = (typeof PORTABLE_SETTING_KEYS)[number];
type LocalSettingKey = (typeof LOCAL_SETTING_KEYS)[number];

/** The portable subset of {@link Settings} that is persisted in a backup. */
export type BackupSettings = Pick<Settings, PortableSettingKey>;

/**
 * Compile-time exhaustiveness guard. Every key of {@link Settings} must appear in
 * either PORTABLE_SETTING_KEYS or LOCAL_SETTING_KEYS. Add a setting and forget to
 * categorize it, and `UncategorizedSettingKey` becomes that key (not `never`),
 * so this alias fails to type-check — a forced reminder to decide whether the new
 * setting belongs in the backup.
 */
type AssertNever<T extends never> = T;
type UncategorizedSettingKey = Exclude<keyof Settings, PortableSettingKey | LocalSettingKey>;
type _AllSettingsCategorized = AssertNever<UncategorizedSettingKey>;

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
  oneDriveBackupFile: 'Main.json',
  oneDriveBackupEtag: '',
  autoSync: true,
  oneDriveConnected: false,
  lastSync: null,
  lastRestore: null,
  lastCheck: null,
  relayUrl: '',
  leadMemberId: null,
};

function load(): Settings {
  try {
    const merged = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    // Clean break from the old Excel format: any non-.json active file (e.g. a "Main.xlsx"
    // persisted by a previous version) is reset to the JSON default, and its stale eTag cleared.
    if (!/\.json$/i.test(merged.oneDriveBackupFile || '')) {
      merged.oneDriveBackupFile = 'Main.json';
      merged.oneDriveBackupEtag = '';
    }
    return merged;
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

/**
 * Record that we just confirmed the remote's state (a poll eTag peek or a pull), even when
 * nothing changed. Drives the "Last checked …" heartbeat so the background poll is visible.
 */
export function markChecked(ts: number) {
  settings.update((s) => ({ ...s, lastCheck: ts }));
}

export function markRestored(ts: number) {
  settings.update((s) => ({ ...s, lastRestore: ts }));
}

/** Remember the active backup's OneDrive eTag (device-local) for the next conditional write. */
export function setActiveBackupEtag(etag: string | null) {
  settings.update((s) => {
    const next = etag ?? '';
    return s.oneDriveBackupEtag === next ? s : { ...s, oneDriveBackupEtag: next };
  });
}

/** The portable subset of the current settings, ready to embed in a backup. */
export function getBackupSettings(): BackupSettings {
  const s = get(settings);
  const out = {} as Record<PortableSettingKey, unknown>;
  for (const key of PORTABLE_SETTING_KEYS) out[key] = s[key];
  return out as BackupSettings;
}

/**
 * Merge backed-up preferences from a restored snapshot into the live settings.
 * Only portable keys are ever applied, so a restore can never overwrite this
 * device's OneDrive connection, file location, or sync bookkeeping — even if an
 * old or hand-edited backup happens to contain those fields. A missing/`undefined`
 * value leaves the current preference untouched.
 */
export function applyBackupSettings(incoming: Partial<Settings> | undefined): void {
  if (!incoming) return;
  settings.update((s) => {
    const next: Settings = { ...s };
    for (const key of PORTABLE_SETTING_KEYS) {
      const value = incoming[key];
      if (value !== undefined) next[key] = value as never;
    }
    return next;
  });
}
