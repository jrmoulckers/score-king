import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigField } from '../lib/types';
import { tally } from '../lib/games/tally';
import { getModule } from '../lib/games/registry';
import { createGame } from '../lib/stores/games';
import { players, refreshPlayers } from '../lib/stores/players';
import { savePreset } from '../lib/stores/presets';
import { settings } from '../lib/stores/settings';
import { dismissToast, toast } from '../lib/stores/toast';
import GameType from './GameType.svelte';

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

async function render(fields = tally.configFields) {
  vi.mocked(getModule).mockReturnValue({ ...tally, configFields: fields });
  const target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(GameType, { target, props: { type: 'tally' } });
  flushSync();
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
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  dismissToast();
  settings.update((value) => ({ ...value, gamePresets: [] }));
  document.body.replaceChildren();
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
