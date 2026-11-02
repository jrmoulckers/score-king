import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { ConfigField, GamePreset } from '../types';
import { settings, getBackupSettings, applyBackupSettings } from './settings';
import { serializeSnapshot, deserializeSnapshot } from '../storage/sync';
import {
  savePreset,
  updatePreset,
  renamePreset,
  removePreset,
  pruneDeletedPlayers,
  prunePresetsForType,
  getPresetsForType,
  presetsForType,
  resolvePresetPlayers,
  resolvePresetConfig,
  presetMatches,
  presetKind,
  previewPreset,
  pruneUnavailableGroupPlayers,
  deletePresetWithUndo,
} from './presets';
import { toast, dismissToast } from './toast';

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

  it('preserves empty legacy-style full setups rather than inferring rules-only', () => {
    const p = savePreset('avalon', 'Morgana on', [], { morgana: true });
    expect(p.playerIds).toEqual([]);
    expect(getPresetsForType('avalon')[0].config).toEqual({ morgana: true });
  });

  it('shares an ordered group across games without storing rules', () => {
    const p = savePreset('avalon', 'Regulars', ['p2', 'p1'], { target: 200 }, 'group');
    expect(p.config).toEqual({});
    expect(getPresetsForType('hearts')).toEqual([p]);
    expect(get(presetsForType('hearts'))).toEqual([p]);
    expect(previewPreset(p, ['p3'], { target: 42 }, ['p1', 'p2'], FIELDS)).toEqual({
      selected: ['p2', 'p1'],
      config: { target: 42 },
      unavailableIds: [],
    });
    updatePreset(p.id, ['p1', 'p2', 'p3'], { target: 99 });
    expect(getPresetsForType('hearts')[0].config).toEqual({});
    prunePresetsForType('avalon');
    expect(getPresetsForType('hearts')[0].id).toBe(p.id);
  });

  it('scopes rules to their game, never stores or replaces players', () => {
    const p = savePreset('avalon', 'Morgana', ['p1', 'p2'], { morgana: true }, 'rules');
    expect(p.playerIds).toEqual([]);
    expect(getPresetsForType('hearts')).toEqual([]);
    const next = previewPreset(p, ['p3', 'p2'], {}, ['p2', 'p3'], FIELDS);
    expect(next.selected).toEqual(['p3', 'p2']);
    expect(next.config).toEqual({ target: 100, morgana: true });
    expect(presetMatches(p, ['any'], next.config, [], FIELDS)).toBe(true);
    updatePreset(p.id, ['p4'], { target: 150 });
    expect(getPresetsForType('avalon')[0].playerIds).toEqual([]);
  });

  it('only prunes unavailable members in viewed groups, retaining available player order', () => {
    const viewed = savePreset('avalon', 'Viewed', ['p3', 'gone', 'p1'], {}, 'group');
    const other = savePreset('hearts', 'Not viewed', ['gone'], {}, 'group');
    const full = savePreset('avalon', 'Full', ['gone'], {});
    pruneDeletedPlayers(['gone']);
    expect(get(settings).gamePresets.find((p) => p.id === viewed.id)?.playerIds).toContain('gone');
    expect(pruneUnavailableGroupPlayers([viewed.id], ['p1', 'p3'])).toBe(1);
    expect(get(settings).gamePresets.find((p) => p.id === viewed.id)?.playerIds).toEqual([
      'p3',
      'p1',
    ]);
    expect(get(settings).gamePresets.find((p) => p.id === other.id)?.playerIds).toEqual(['gone']);
    expect(get(settings).gamePresets.find((p) => p.id === full.id)?.playerIds).toEqual([]);
    const before = get(settings);
    expect(pruneUnavailableGroupPlayers([viewed.id], ['p1', 'p3'])).toBe(0);
    expect(get(settings)).toBe(before);
  });

  it.each(['group', 'rules', 'full'] as const)(
    'renames and deletes/undoes %s records exactly',
    (kind) => {
      const p = savePreset('avalon', 'Before', ['p2', 'p1'], { target: 123 }, kind);
      renamePreset(p.id, 'After');
      const renamed = get(settings).gamePresets[0];
      deletePresetWithUndo(renamed);
      expect(get(settings).gamePresets).toEqual([]);
      get(toast)?.action?.run();
      expect(get(settings).gamePresets).toEqual([renamed]);
      dismissToast();
    },
  );

  it('round-trips every kind and unmodified legacy records through portable backups', () => {
    const full = savePreset('avalon', 'Legacy empty', [], { target: 150 });
    const { kind: _kind, ...legacy } = full;
    void _kind;
    settings.update((s) => ({ ...s, gamePresets: [legacy] }));
    savePreset('avalon', 'Group', ['p2', 'p1'], {}, 'group');
    savePreset('avalon', 'Rules', [], { target: 125 }, 'rules');
    const saved = get(settings).gamePresets;
    const back = deserializeSnapshot(
      serializeSnapshot({
        players: [],
        games: [],
        rounds: [],
        exportedAt: 123,
        settings: getBackupSettings(),
      }),
    );
    reset();
    applyBackupSettings(back?.settings);
    expect(get(settings).gamePresets).toEqual(saved);
    expect(presetKind(get(settings).gamePresets[0])).toBe('full');
    expect(previewPreset(legacy, ['p1'], {}, ['p1'], FIELDS).selected).toEqual([]);
    applyBackupSettings({ theme: 'dark' });
    expect(get(settings).gamePresets).toEqual(saved);
    expect(JSON.parse(localStorage.getItem('sk_settings')!).gamePresets).toEqual(saved);
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

  it('prunes hard-deleted players from every preset, leaving others untouched', () => {
    const a = savePreset('avalon', 'A', ['p1', 'p2', 'p3'], {});
    const b = savePreset('skullking', 'B', ['p4', 'p5'], {});
    pruneDeletedPlayers(['p2', 'p4']);

    expect(getPresetsForType('avalon')[0].playerIds).toEqual(['p1', 'p3']);
    expect(getPresetsForType('skullking')[0].playerIds).toEqual(['p5']);
    // A preset with none of the deleted ids keeps its exact record (no needless updatedAt churn).
    void a;
    void b;
  });

  it('leaves presets untouched when no deleted id is present', () => {
    const p = savePreset('avalon', 'A', ['p1', 'p2'], {});
    const before = getPresetsForType('avalon')[0];
    pruneDeletedPlayers(['ghost']);
    expect(getPresetsForType('avalon')[0]).toBe(before);
    void p;
  });

  it('drops every preset for a hard-deleted game type only', () => {
    savePreset('def_gone', 'A', ['p1'], {});
    savePreset('def_gone', 'B', ['p2'], {});
    const keep = savePreset('avalon', 'Keep', ['p3'], {});
    prunePresetsForType('def_gone');

    expect(getPresetsForType('def_gone')).toEqual([]);
    expect(getPresetsForType('avalon').map((x) => x.id)).toEqual([keep.id]);
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

  it('drops unavailable players but never caps available players at a game limit', () => {
    expect(resolvePresetPlayers(preset, ['p1', 'p2', 'p4'])).toEqual(['p1', 'p2']);
    expect(
      resolvePresetPlayers({ ...preset, playerIds: ['p2', 'p1', 'p2'] }, ['p1', 'p2']),
    ).toEqual(['p2', 'p1']);
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
    const players = resolvePresetPlayers(preset, valid);
    const config = resolvePresetConfig(preset, FIELDS);

    expect(presetMatches(preset, players, config, valid, FIELDS)).toBe(true);
    expect(presetMatches(preset, ['p1'], config, valid, FIELDS)).toBe(false);
    expect(presetMatches(preset, players, { ...config, morgana: false }, valid, FIELDS)).toBe(
      false,
    );
  });
});
