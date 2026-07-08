import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { ConfigField, GamePreset } from '../types';
import { settings } from './settings';
import {
  savePreset,
  updatePreset,
  renamePreset,
  removePreset,
  getPresetsForType,
  presetsForType,
  resolvePresetPlayers,
  resolvePresetConfig,
  presetMatches,
} from './presets';

const FIELDS: ConfigField[] = [
  { key: 'target', label: 'Target', type: 'number', default: 100 },
  { key: 'morgana', label: 'Morgana', type: 'boolean', default: false },
];

function reset() {
  settings.update((s) => ({ ...s, gamePresets: [] }));
}

describe('game presets store', () => {
  beforeEach(reset);

  it('saves a preset scoped to its game type and snapshots the setup', () => {
    const selected = ['p1', 'p2'];
    const config = { target: 100, morgana: true };
    const p = savePreset('avalon', 'Friday crew', selected, config);

    expect(p.type).toBe('avalon');
    expect(p.name).toBe('Friday crew');
    expect(getPresetsForType('avalon').map((x) => x.id)).toEqual([p.id]);
    expect(getPresetsForType('skullking')).toEqual([]);

    // Mutating the sources afterwards must not change the stored preset (deep copy).
    selected.push('p3');
    config.morgana = false;
    expect(p.playerIds).toEqual(['p1', 'p2']);
    expect(p.config).toEqual({ target: 100, morgana: true });
  });

  it('falls back to a placeholder name when given a blank one', () => {
    const p = savePreset('avalon', '   ', ['p1'], {});
    expect(p.name).toBe('Preset');
  });

  it('saves a rules-only preset with no players selected', () => {
    const p = savePreset('avalon', 'Morgana on', [], { morgana: true });
    expect(p.playerIds).toEqual([]);
    expect(getPresetsForType('avalon')[0].config).toEqual({ morgana: true });
  });

  it('updates a preset in place, keeping its name and id', () => {
    const p = savePreset('avalon', 'Crew', ['p1'], { target: 100, morgana: false });
    updatePreset(p.id, ['p1', 'p2'], { target: 120, morgana: true });

    const stored = getPresetsForType('avalon')[0];
    expect(stored.id).toBe(p.id);
    expect(stored.name).toBe('Crew');
    expect(stored.playerIds).toEqual(['p1', 'p2']);
    expect(stored.config).toEqual({ target: 120, morgana: true });
  });

  it('renames a preset but ignores a blank rename', () => {
    const p = savePreset('avalon', 'Old', ['p1'], {});
    renamePreset(p.id, 'New name');
    expect(getPresetsForType('avalon')[0].name).toBe('New name');
    renamePreset(p.id, '   ');
    expect(getPresetsForType('avalon')[0].name).toBe('New name');
  });

  it('removes a preset', () => {
    const p = savePreset('avalon', 'Crew', ['p1'], {});
    removePreset(p.id);
    expect(getPresetsForType('avalon')).toEqual([]);
  });

  it('exposes a reactive per-type list, newest edit first', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      const a = savePreset('avalon', 'A', ['p1'], {});
      vi.setSystemTime(2_000);
      const b = savePreset('avalon', 'B', ['p2'], {});
      const store = presetsForType('avalon');
      expect(get(store).map((p) => p.id)).toEqual([b.id, a.id]);

      // Touching A makes it the most-recently-edited.
      vi.setSystemTime(3_000);
      updatePreset(a.id, ['p1', 'p3'], {});
      expect(get(store).map((p) => p.id)).toEqual([a.id, b.id]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('preset apply/dirty helpers', () => {
  const preset: GamePreset = {
    id: 'x',
    type: 'avalon',
    name: 'Crew',
    playerIds: ['p1', 'p2', 'gone'],
    config: { target: 120, morgana: true, retired: 'x' },
    createdAt: 0,
    updatedAt: 0,
  };

  it('drops unknown players, dedupes, and caps at max', () => {
    expect(resolvePresetPlayers(preset, ['p1', 'p2', 'p4'], 12)).toEqual(['p1', 'p2']);
    expect(resolvePresetPlayers(preset, ['p1', 'p2'], 1)).toEqual(['p1']);
  });

  it('overlays saved config on current defaults, dropping retired keys and defaulting new ones', () => {
    const cfg = resolvePresetConfig(preset, FIELDS);
    expect(cfg).toEqual({ target: 120, morgana: true });
    expect('retired' in cfg).toBe(false);
  });

  it('new config fields added since the preset was saved fall back to their default', () => {
    const withNewField: ConfigField[] = [
      ...FIELDS,
      { key: 'extra', label: 'Extra', type: 'number', default: 7 },
    ];
    expect(resolvePresetConfig(preset, withNewField)).toEqual({
      target: 120,
      morgana: true,
      extra: 7,
    });
  });

  it('detects a clean match versus a dirty form', () => {
    const valid = ['p1', 'p2'];
    const players = resolvePresetPlayers(preset, valid, 12);
    const config = resolvePresetConfig(preset, FIELDS);

    expect(presetMatches(preset, players, config, valid, 12, FIELDS)).toBe(true);
    expect(presetMatches(preset, ['p1'], config, valid, 12, FIELDS)).toBe(false);
    expect(
      presetMatches(preset, players, { ...config, morgana: false }, valid, 12, FIELDS),
    ).toBe(false);
  });
});
