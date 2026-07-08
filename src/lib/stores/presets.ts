import { derived, get, type Readable } from 'svelte/store';
import type { ConfigField, GamePreset, ID } from '../types';
import { defaultConfig } from '../types';
import { settings } from './settings';
import { showActionToast } from './toast';
import { uid } from '../util';

/**
 * Game-by-game presets: a saved lineup + rules for a specific game type, so a group can start
 * "the usual" in one tap without being locked into it. Presets are persisted as the portable
 * {@link Settings.gamePresets} setting (they ride a backup/restore like catalog favorites), and
 * only ever *pre-fill* the New game form — applying one never commits you to it, and it changes
 * only when you explicitly Update it.
 *
 * The apply/dirty logic lives here as pure helpers so it's testable without a component and so
 * a preset saved before a config field or player existed still resolves sensibly today.
 */

/** All presets, newest edits first (reactive). */
export const gamePresets: Readable<GamePreset[]> = derived(settings, ($s) =>
  [...$s.gamePresets].sort((a, b) => b.updatedAt - a.updatedAt),
);

/** Presets for a single game type, most-recently-edited first (reactive). */
export function presetsForType(type: string): Readable<GamePreset[]> {
  return derived(gamePresets, ($all) => $all.filter((p) => p.type === type));
}

/** Snapshot of a type's presets (non-reactive), for one-off reads. */
export function getPresetsForType(type: string): GamePreset[] {
  return get(settings)
    .gamePresets.filter((p) => p.type === type)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Save a new preset for a game type. `playerIds` and `config` are snapshotted (deep-copied)
 * so later edits to the form don't mutate the stored preset. Returns the created preset.
 */
export function savePreset(
  type: string,
  name: string,
  playerIds: ID[],
  config: Record<string, unknown>,
): GamePreset {
  const now = Date.now();
  const preset: GamePreset = {
    id: uid(),
    type,
    name: name.trim() || 'Preset',
    playerIds: [...playerIds],
    config: { ...config },
    createdAt: now,
    updatedAt: now,
  };
  settings.update((s) => ({ ...s, gamePresets: [...s.gamePresets, preset] }));
  return preset;
}

/** Overwrite a preset's saved lineup + rules with the current setup (keeps its name). */
export function updatePreset(
  id: ID,
  playerIds: ID[],
  config: Record<string, unknown>,
): void {
  settings.update((s) => ({
    ...s,
    gamePresets: s.gamePresets.map((p) =>
      p.id === id
        ? { ...p, playerIds: [...playerIds], config: { ...config }, updatedAt: Date.now() }
        : p,
    ),
  }));
}

/** Rename a preset. A blank name is ignored (keeps the existing label). */
export function renamePreset(id: ID, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  settings.update((s) => ({
    ...s,
    gamePresets: s.gamePresets.map((p) =>
      p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p,
    ),
  }));
}

/** Remove a preset outright (no tombstone — presets are a convenience list, not synced entities). */
export function removePreset(id: ID): void {
  settings.update((s) => ({ ...s, gamePresets: s.gamePresets.filter((p) => p.id !== id) }));
}

/** Delete a preset with an Undo toast — the app's standard recoverable-destructive pattern. */
export function deletePresetWithUndo(preset: GamePreset): void {
  removePreset(preset.id);
  showActionToast(`“${preset.name}” deleted`, 'Undo', () => {
    // Re-insert the exact record so the undo is a true restore, not a fresh preset.
    settings.update((s) =>
      s.gamePresets.some((p) => p.id === preset.id)
        ? s
        : { ...s, gamePresets: [...s.gamePresets, preset] },
    );
  });
}

// ── Pure apply/dirty helpers ────────────────────────────────────────────────────

/**
 * The lineup a preset resolves to *right now*: its saved players in order, dropping any who
 * are no longer selectable (archived/deleted since it was saved) and capping at the game's
 * `max`. Keeps a preset useful even as the roster changes underneath it.
 */
export function resolvePresetPlayers(
  preset: GamePreset,
  validIds: Iterable<ID>,
  max: number,
): ID[] {
  const valid = new Set(validIds);
  const out: ID[] = [];
  for (const id of preset.playerIds) {
    if (valid.has(id) && !out.includes(id) && out.length < max) out.push(id);
  }
  return out;
}

/**
 * The config a preset resolves to: the game's current defaults, overlaid with the preset's
 * saved values for keys that still exist. New config fields added since the preset was saved
 * fall back to their default; retired keys are dropped.
 */
export function resolvePresetConfig(
  preset: GamePreset,
  fields: ConfigField[] | undefined,
): Record<string, unknown> {
  const cfg = defaultConfig(fields);
  for (const key of Object.keys(cfg)) {
    if (key in preset.config) cfg[key] = preset.config[key];
  }
  return cfg;
}

/**
 * Whether the current form (selected players + config) already matches what applying `preset`
 * would yield. Used to show an "Update" affordance only when there's something to save.
 */
export function presetMatches(
  preset: GamePreset,
  selected: ID[],
  config: Record<string, unknown>,
  validIds: Iterable<ID>,
  max: number,
  fields: ConfigField[] | undefined,
): boolean {
  const players = resolvePresetPlayers(preset, validIds, max);
  if (players.length !== selected.length || players.some((id, i) => id !== selected[i])) {
    return false;
  }
  const wantCfg = resolvePresetConfig(preset, fields);
  const keys = Object.keys(wantCfg);
  return keys.every((k) => Object.is(wantCfg[k], config[k]));
}
