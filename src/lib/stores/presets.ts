import { derived, get, type Readable } from 'svelte/store';
import type { ConfigField, GamePreset, ID, PresetKind } from '../types';
import { defaultConfig } from '../types';
import { settings } from './settings';
import { showActionToast } from './toast';
import { uid } from '../util';

/**
 * Saved groups (cross-game), rules (per-game), and full setups, persisted as the portable
 * {@link Settings.gamePresets} setting (they ride a backup/restore like catalog favorites), and
 * only ever *pre-fill* the New game form. Saved content changes only on explicit Update,
 * except unavailable group members are pruned lazily when viewed with a loaded roster.
 *
 * The apply/dirty logic lives here as pure helpers so it's testable without a component and so
 * a preset saved before a config field or player existed still resolves sensibly today.
 */

/** All presets, newest edits first (reactive). */
export const gamePresets: Readable<GamePreset[]> = derived(settings, ($s) =>
  [...$s.gamePresets].sort((a, b) => b.updatedAt - a.updatedAt),
);

/** Older records always remain full setups, even when their saved lineup is empty. */
export function presetKind(preset: GamePreset): PresetKind {
  return preset.kind ?? 'full';
}

function availableForType(preset: GamePreset, type: string): boolean {
  return presetKind(preset) === 'group' || preset.type === type;
}

/** Cross-game groups plus this game's rules/full setups, newest edit first. */
export function presetsForType(type: string): Readable<GamePreset[]> {
  return derived(gamePresets, ($all) => $all.filter((p) => availableForType(p, type)));
}

/** Snapshot of a type's presets (non-reactive), for one-off reads. */
export function getPresetsForType(type: string): GamePreset[] {
  return get(settings)
    .gamePresets.filter((p) => availableForType(p, type))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Save a new preset. `playerIds` and scalar config fields are snapshotted
 * so later edits to the form don't mutate the stored preset. Returns the created preset.
 */
export function savePreset(
  type: string,
  name: string,
  playerIds: ID[],
  config: Record<string, unknown>,
  kind: PresetKind = 'full',
): GamePreset {
  const now = Date.now();
  const preset: GamePreset = {
    id: uid(),
    type,
    kind,
    name: name.trim() || 'Preset',
    playerIds: kind === 'rules' ? [] : [...playerIds],
    config: kind === 'group' ? {} : { ...config },
    createdAt: now,
    updatedAt: now,
  };
  settings.update((s) => ({ ...s, gamePresets: [...s.gamePresets, preset] }));
  return preset;
}

/** Overwrite a preset's saved lineup + rules with the current setup (keeps its name). */
export function updatePreset(id: ID, playerIds: ID[], config: Record<string, unknown>): void {
  settings.update((s) => ({
    ...s,
    gamePresets: s.gamePresets.map((p) =>
      p.id === id
        ? {
            ...p,
            playerIds: presetKind(p) === 'rules' ? [] : [...playerIds],
            config: presetKind(p) === 'group' ? {} : { ...config },
            updatedAt: Date.now(),
          }
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

/**
 * Strip hard-deleted player ids from legacy/full setups. Called when a member is permanently
 * removed (a tombstone, never coming back), so presets don't keep a ghost id that would
 * silently re-sync or resurrect. Archived (recoverable) members are deliberately NOT pruned —
 * those are hidden reactively so restoring the member restores them to the preset.
 * Groups are excluded: their unavailable membership is resolved lazily when viewed.
 */
export function pruneDeletedPlayers(deletedIds: Iterable<ID>): void {
  const gone = new Set(deletedIds);
  if (gone.size === 0) return;
  settings.update((s) => {
    let changed = false;
    const next = s.gamePresets.map((p) => {
      if (presetKind(p) === 'group') return p;
      if (!p.playerIds.some((id) => gone.has(id))) return p;
      changed = true;
      return {
        ...p,
        playerIds: p.playerIds.filter((id) => !gone.has(id)),
        updatedAt: Date.now(),
      };
    });
    return changed ? { ...s, gamePresets: next } : s;
  });
}

/** Prune only groups being viewed, after the caller has confirmed roster readiness. */
export function pruneUnavailableGroupPlayers(
  viewedIds: Iterable<ID>,
  validIds: Iterable<ID>,
): number {
  const viewed = new Set(viewedIds);
  const valid = new Set(validIds);
  let removed = 0;
  const s = get(settings);
  const next = s.gamePresets.map((p) => {
    if (!viewed.has(p.id) || presetKind(p) !== 'group') return p;
    const playerIds = p.playerIds.filter((id) => valid.has(id));
    if (playerIds.length === p.playerIds.length) return p;
    removed += p.playerIds.length - playerIds.length;
    return { ...p, playerIds, updatedAt: Date.now() };
  });
  if (removed) settings.set({ ...s, gamePresets: next });
  return removed;
}

/**
 * Drop every preset belonging to a game type that no longer exists — a hard-deleted custom
 * type (an *archived* type is still resolvable, so its presets are kept). Without this, its
 * presets would be orphaned forever with no surface to reach or clean them from.
 */
export function prunePresetsForType(type: string): void {
  settings.update((s) =>
    s.gamePresets.some((p) => p.type === type && presetKind(p) !== 'group')
      ? {
          ...s,
          gamePresets: s.gamePresets.filter((p) => p.type !== type || presetKind(p) === 'group'),
        }
      : s,
  );
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
 * Available saved players, in order, WITHOUT a player-limit cap. Callers disclose
 * unavailable full-setup members; groups prune them lazily after roster loading.
 * Oversized lineups stay intact so the user, not the app, chooses who leaves.
 */
export function resolvePresetPlayers(preset: GamePreset, validIds: Iterable<ID>): ID[] {
  const valid = new Set(validIds);
  return [...new Set(preset.playerIds)].filter((id) => valid.has(id));
}

export function unavailablePresetPlayers(preset: GamePreset, validIds: Iterable<ID>): ID[] {
  if (presetKind(preset) === 'rules') return [];
  const valid = new Set(validIds);
  return [...new Set(preset.playerIds)].filter((id) => !valid.has(id));
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

/** Preview the owned portion only, leaving the other half of the form unchanged. */
export function previewPreset(
  preset: GamePreset,
  selected: ID[],
  config: Record<string, unknown>,
  validIds: Iterable<ID>,
  fields: ConfigField[] | undefined,
): { selected: ID[]; config: Record<string, unknown>; unavailableIds: ID[] } {
  const kind = presetKind(preset);
  const valid = [...validIds];
  return {
    selected: kind === 'rules' ? [...selected] : resolvePresetPlayers(preset, valid),
    config: kind === 'group' ? { ...config } : resolvePresetConfig(preset, fields),
    unavailableIds: unavailablePresetPlayers(preset, valid),
  };
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
  fields: ConfigField[] | undefined,
): boolean {
  const preview = previewPreset(preset, selected, config, validIds, fields);
  if (
    preview.selected.length !== selected.length ||
    preview.selected.some((id, i) => id !== selected[i])
  ) {
    return false;
  }
  const wantCfg = preview.config;
  const keys = Object.keys(wantCfg);
  return keys.every((k) => Object.is(wantCfg[k], config[k]));
}
