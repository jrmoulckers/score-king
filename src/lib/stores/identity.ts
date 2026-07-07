import { get, derived } from 'svelte/store';
import {
  settings,
  getBackupSettings,
  applyBackupSettings,
  type BackupSettings,
} from './settings';
import { players, savePlayerPrefs, refreshPlayers } from './players';

/**
 * Active/lead member on THIS device — the gamer whose portable preferences are
 * applied here. Optional: with no lead, the device just uses its own settings.
 * This is the local seat of the unified Member model (see ARCHITECTURE.md): one
 * member can lead different devices, and their look follows them.
 */
export const leadMember = derived([settings, players], ([$settings, $players]) =>
  $settings.leadMemberId
    ? $players.find((m) => m.id === $settings.leadMemberId) ?? null
    : null,
);

// While we push a member's prefs INTO settings, the settings subscriber must not
// treat the resulting change as a fresh user edit and mirror it back out.
let applying = false;
let started = false;

function prefsEqual(a: Partial<BackupSettings>, b: Partial<BackupSettings>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function applyMemberPrefs(prefs: Partial<BackupSettings>): void {
  applying = true;
  try {
    applyBackupSettings(prefs);
  } finally {
    applying = false;
  }
}

/**
 * Make `id` the lead member on this device (or clear it with `null`). Switching to
 * a member with saved prefs applies them; a member without prefs yet is seeded from
 * the device's current look, so that look becomes theirs from here on.
 */
export function setLeadMember(id: string | null): void {
  applying = true;
  try {
    settings.update((s) => ({ ...s, leadMemberId: id }));
    if (id) {
      const member = get(players).find((m) => m.id === id);
      if (member?.prefs) {
        applyBackupSettings(member.prefs);
      } else if (member) {
        void savePlayerPrefs(member, getBackupSettings());
      }
    }
  } finally {
    applying = false;
  }
}

/**
 * Wire the lead member <-> device-settings link. Call once at startup, AFTER the
 * players store has loaded: it applies the lead's saved prefs to this device, then
 * mirrors later preference edits back onto that member (auto-save ownership).
 */
export async function initIdentity(): Promise<void> {
  if (started) return;
  started = true;

  await refreshPlayers();

  const initial = get(settings);
  if (initial.leadMemberId) {
    const member = get(players).find((m) => m.id === initial.leadMemberId);
    if (member?.prefs) applyMemberPrefs(member.prefs);
  }

  settings.subscribe(($settings) => {
    if (applying || !$settings.leadMemberId) return;
    const member = get(players).find((m) => m.id === $settings.leadMemberId);
    if (!member) return;
    const current = getBackupSettings();
    if (!prefsEqual(member.prefs ?? {}, current)) {
      void savePlayerPrefs(member, current);
    }
  });
}
