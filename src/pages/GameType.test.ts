import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigField, GameModule } from '../lib/types';
import { tally } from '../lib/games/tally';
import { hearts } from '../lib/games/hearts';
import { spikeball } from '../lib/games/spikeball';
import { buildCustomModule } from '../lib/games/custom/factory';
import { blankDef, MAX_NAME_LEN } from '../lib/games/custom/types';
import { getModule } from '../lib/games/registry';
import { createGame } from '../lib/stores/games';
import { customGameDefs } from '../lib/stores/customGames';
import { players, refreshPlayers } from '../lib/stores/players';
import { savePreset } from '../lib/stores/presets';
import { settings } from '../lib/stores/settings';
import { dismissToast, toast } from '../lib/stores/toast';
import GameType from './GameType.svelte';
import source from './GameType.svelte?raw';

vi.mock('../lib/storage/db', () => ({
  getAllPlayers: vi.fn().mockResolvedValue([]),
  getAllGames: vi.fn().mockResolvedValue([]),
  getAllGameDefs: vi.fn().mockResolvedValue([]),
}));
vi.mock('../lib/games/registry', () => ({ getModule: vi.fn() }));
vi.mock('../lib/stores/games', async () => {
  const { writable } = await import('svelte/store');
  return {
    games: writable([]),
    activeGames: writable([]),
    createGame: vi.fn().mockResolvedValue({ id: 'valid-setup' }),
  };
});
vi.mock('../lib/router', () => ({ navigate: vi.fn(), link: vi.fn() }));
vi.mock('../lib/motion', () => ({ pop: vi.fn() }));

let component: ReturnType<typeof mount> | undefined;

function button(target: HTMLElement, label: string) {
  const found = [...target.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === label,
  );
  expect(found, label).toBeDefined();
  return found!;
}

function renderModule(module: GameModule, type = module.id) {
  vi.mocked(getModule).mockReturnValue(module);
  const target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(GameType, { target, props: { type } });
  flushSync();
  return target;
}

async function render(fields = tally.configFields) {
  const target = renderModule({ ...tally, configFields: fields });
  target.querySelector<HTMLButtonElement>('.chip')!.click();
  flushSync();
  await tick();
  return target;
}

function input(target: HTMLElement, key: string, value: string) {
  const control = target.querySelector<HTMLInputElement>(`#${key}`)!;
  control.value = value;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  return control;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await refreshPlayers();
  players.set([{ id: 'setup-player', name: 'Setup Player', color: '#7c5cff', createdAt: 1 }]);
  customGameDefs.set([]);
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  customGameDefs.set([]);
  dismissToast();
  settings.update((value) => ({ ...value, gamePresets: [] }));
  document.body.replaceChildren();
});

describe('setup heading identities', () => {
  it('lets the identity shrink and wrap unbroken text without shrinking the emoji', () => {
    expect(source).toMatch(/\.setup-heading\s*\{[^}]*min-width:\s*0/);
    expect(source).toMatch(/\.setup-emoji\s*\{[^}]*flex:\s*none/);
    expect(source).toMatch(
      /\.setup-identity\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere/,
    );
  });

  it.each(['UnbrokenTabletopCounterX', 'Tabletop Counter Players'])(
    'retains the full legal name %s, emoji, tagline, actions and player selection',
    async (name) => {
      expect(name).toHaveLength(MAX_NAME_LEN);
      const def = { ...blankDef(), name, tagline: 'Keep every point', minPlayers: 1 };
      customGameDefs.set([def]);
      const target = renderModule(buildCustomModule(def));
      const heading = target.querySelector('.setup-heading')!;
      expect(heading.querySelector('h1')?.textContent).toBe(name);
      expect(heading.querySelector('.setup-emoji')?.textContent).toBe(def.emoji);
      expect(heading.querySelector('.muted')?.textContent).toBe(def.tagline);
      expect(target.querySelector('[aria-label="Custom game actions"] a')?.textContent).toBe(
        'Edit',
      );
      expect(button(target, 'Duplicate').disabled).toBe(false);
      expect(button(target, 'Delete').disabled).toBe(false);
      expect(button(target, 'Start game').disabled).toBe(true);
      target.querySelector<HTMLButtonElement>('.chip')!.click();
      flushSync();
      expect(button(target, 'Start game').disabled).toBe(false);
      button(target, 'Start game').click();
      await tick();
      expect(createGame).toHaveBeenCalledWith(def.id, ['setup-player'], {});
    },
  );

  it.each([hearts, tally])('preserves the ordinary $name identity', (module) => {
    const target = renderModule(module);
    expect(target.querySelector('.setup-heading h1')?.textContent).toBe(module.name);
    expect(target.querySelector('.setup-emoji')?.textContent).toBe(module.emoji);
    expect(target.querySelector('.setup-identity .muted')?.textContent).toBe(module.tagline);
    expect(target.querySelector('[aria-label="Custom game actions"]')).toBeNull();
  });
});

describe('new game numeric constraints', () => {
  it.each([
    ['step', '0'],
    ['target', '-1'],
    ['step', '1.5'],
  ])('rejects invalid %s = %s without creating a game or losing the draft', async (key, value) => {
    const target = await render();
    input(target, 'target', '125');
    const invalid = input(target, key, value);
    button(target, 'Start game').click();
    flushSync();
    expect(createGame).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(invalid);
    expect(get(toast)?.message).toContain(invalid.validationMessage);
    expect(invalid.value).toBe(value);
    expect(target.querySelector('.chip')?.getAttribute('aria-pressed')).toBe('true');

    input(target, key, key === 'step' ? '1' : '0');
    button(target, 'Start game').click();
    await tick();
    expect(createGame).toHaveBeenCalledWith('tally', ['setup-player'], {
      direction: 'high',
      step: 1,
      target: key === 'step' ? 125 : 0,
    });
  });
});

describe('configuration-aware player requirements', () => {
  function roster(count = 5) {
    const entries = Array.from({ length: count }, (_, i) => ({
      id: `player-${i}`,
      name: `Player ${i}`,
      color: '#7c5cff',
      createdAt: i,
    }));
    players.set(entries);
    return entries.map((p) => p.id);
  }

  function select(target: HTMLElement, indices: number[]) {
    for (const index of indices) {
      target.querySelectorAll<HTMLButtonElement>('.chip')[index].click();
      flushSync();
    }
  }

  function format(target: HTMLElement, value: string) {
    const control = target.querySelector<HTMLSelectElement>('#format')!;
    control.value = value;
    control.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
  }

  it.each([2, 3])('blocks %i-player doubles until the roster is complete', async (count) => {
    const ids = roster();
    const target = renderModule(spikeball);
    select(target, Array.from({ length: count }, (_, i) => i));
    expect(target.textContent).toContain('Players (4)');
    expect(target.textContent).toContain(`Pick ${4 - count} more player`);
    expect(button(target, 'Start game').disabled).toBe(true);
    button(target, 'Start game').click();
    expect(createGame).not.toHaveBeenCalled();
    select(target, Array.from({ length: 4 - count }, (_, i) => count + i));
    expect(button(target, 'Start game').disabled).toBe(false);
    button(target, 'Start game').click();
    await tick();
    expect(createGame).toHaveBeenCalledWith(
      'spikeball',
      ids.slice(0, 4),
      expect.objectContaining({ format: '2v2' }),
    );
  });

  it.each([3, 4])('retains %i singles players until corrected', async (count) => {
    const ids = roster();
    const target = renderModule(spikeball);
    select(target, Array.from({ length: count }, (_, i) => i));
    format(target, '1v1');
    expect(target.textContent).toContain('Players (2)');
    expect(target.textContent).toContain('No players were removed automatically.');
    expect(target.querySelectorAll('.chip[aria-pressed="true"]')).toHaveLength(count);
    expect(button(target, 'Start game').disabled).toBe(true);
    button(target, 'Start game').click();
    expect(createGame).not.toHaveBeenCalled();
    expect(target.querySelectorAll<HTMLButtonElement>('.chip')[4].disabled).toBe(true);
    select(target, Array.from({ length: count - 2 }, (_, i) => count - 1 - i));
    button(target, 'Start game').click();
    await tick();
    expect(createGame).toHaveBeenCalledWith(
      'spikeball',
      ids.slice(0, 2),
      expect.objectContaining({ format: '1v1' }),
    );
    format(target, '2v2');
    expect(button(target, 'Start game').disabled).toBe(true);
    expect(target.querySelectorAll('.chip[aria-pressed="true"]')).toHaveLength(2);
  });

  it('previews preset bounds and applies ordered rosters', async () => {
    const ids = roster();
    const full = savePreset('spikeball', 'Singles lineup', [ids[2], ids[0]], { format: '1v1' });
    const invalid = savePreset('spikeball', 'Short doubles', [ids[1], ids[3]], { format: '2v2' });
    const rules = savePreset('spikeball', 'Doubles rules', [], { format: '2v2' }, 'rules');
    const target = renderModule(spikeball);
    const presetButton = (id: string) =>
      target.querySelector<HTMLButtonElement>(`[data-preset-id="${id}"]`)!;
    expect(presetButton(full.id).textContent).not.toContain('needs at least');
    expect(presetButton(invalid.id).textContent).toContain('needs at least 4 players');
    presetButton(full.id).click();
    flushSync();
    expect(button(target, 'Start game').disabled).toBe(false);
    expect(target.querySelector('#format')).toHaveProperty('value', '1v1');
    expect(presetButton(rules.id).textContent).toContain('needs at least 4 players');
    presetButton(rules.id).click();
    flushSync();
    expect(button(target, 'Start game').disabled).toBe(true);
    expect(target.querySelectorAll('.chip[aria-pressed="true"]')).toHaveLength(2);
    expect(get(settings).gamePresets.find((p) => p.id === full.id)?.playerIds).toEqual([
      ids[2],
      ids[0],
    ]);
    presetButton(full.id).click();
    flushSync();
    button(target, 'Start game').click();
    await tick();
    expect(createGame).toHaveBeenCalledWith(
      'spikeball',
      [ids[2], ids[0]],
      expect.objectContaining({ format: '1v1' }),
    );
  });

  it.each([
    { deckCount: '1', max: 6 },
    { deckCount: '2', max: 11 },
  ])('preserves Hearts deck $deckCount limits and selected players', ({ deckCount, max }) => {
    const ids = roster(11);
    savePreset('hearts', 'Large table', ids, { deckCount });
    const target = renderModule(hearts);
    target.querySelector<HTMLButtonElement>('.pchip')!.click();
    flushSync();
    expect(target.textContent).toContain(`Players (3–${max})`);
    expect(target.querySelectorAll('.chip[aria-pressed="true"]')).toHaveLength(11);
    expect(button(target, 'Start game').disabled).toBe(max < 11);
  });
});

describe('advanced setup constraints and presets', () => {
  it('reveals advanced errors and retains optional and fractional values', async () => {
    const fields: ConfigField[] = [
      { key: 'amount', label: 'Amount', type: 'number', default: 1, min: 0.5, max: 3, step: 0.5 },
      { key: 'optional', label: 'Optional', type: 'number', default: 0, min: 0 },
      {
        key: 'advanced',
        label: 'Advanced count',
        type: 'number',
        default: 4,
        max: 3,
        advanced: true,
      },
    ];
    const target = await render(fields);
    input(target, 'amount', '0.5');
    input(target, 'optional', '');
    const advanced = target.querySelector<HTMLInputElement>('#advanced')!;
    expect(target.querySelector('details')?.open).toBe(false);
    button(target, 'Start game').click();
    flushSync();
    expect(createGame).not.toHaveBeenCalled();
    expect(target.querySelector('details')?.open).toBe(true);
    expect(document.activeElement).toBe(advanced);
    expect(get(toast)?.message).toContain('Advanced count:');
    input(target, 'advanced', '3');
    button(target, 'Start game').click();
    await tick();
    expect(createGame).toHaveBeenCalledWith('tally', ['setup-player'], {
      amount: 0.5,
      optional: null,
      advanced: 3,
    });
  });

  it('ignores conditionally absent fields but validates them when revealed', async () => {
    const target = await render([
      { key: 'enabled', label: 'Enable count', type: 'boolean', default: false },
      {
        key: 'count',
        label: 'Count',
        type: 'number',
        default: -1,
        min: 0,
        advanced: true,
        showIf: (config) => !!config.enabled,
      },
    ]);
    expect(target.querySelector('#count')).toBeNull();
    button(target, 'Start game').click();
    await tick();
    expect(createGame).toHaveBeenCalledOnce();
    vi.mocked(createGame).mockClear();
    target.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    flushSync();
    button(target, 'Start game').click();
    flushSync();
    expect(createGame).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(target.querySelector('#count'));
  });

  it('validates applied rules without changing snapshots or nesting preset forms', async () => {
    const preset = savePreset('tally', 'Invalid rules', [], { step: 0, target: 20 }, 'rules');
    const target = await render();
    target.querySelector<HTMLButtonElement>('.pchip')!.click();
    flushSync();
    button(target, 'Start game').click();
    flushSync();
    expect(createGame).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(target.querySelector('#step'));
    expect(get(settings).gamePresets.find((value) => value.id === preset.id)?.config).toEqual({
      step: 0,
      target: 20,
    });
    input(target, 'step', '5');
    button(target, 'Save new').click();
    flushSync();
    expect(target.querySelector('form form')).toBeNull();
    button(target, 'Cancel').click();
    flushSync();
    await tick();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(button(target, 'Save new'));
    });
    button(target, 'Start game').click();
    await tick();
    expect(createGame).toHaveBeenCalledWith('tally', ['setup-player'], {
      direction: 'high',
      step: 5,
      target: 20,
    });
  });
});
