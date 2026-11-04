import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, Player } from '../lib/types';
import * as db from '../lib/storage/db';
import { navigate } from '../lib/router';
import { createGame, games } from '../lib/stores/games';
import { refreshPlayers } from '../lib/stores/players';
import { settings } from '../lib/stores/settings';
import { clearStorageError, storageError } from '../lib/stores/storage';
import GamePlay from './GamePlay.svelte';
import GameType from './GameType.svelte';

vi.mock('../lib/storage/db', () => ({
  getAllPlayers: vi.fn().mockResolvedValue([]),
  getAllGames: vi.fn().mockResolvedValue([]),
  getAllGameDefs: vi.fn().mockResolvedValue([]),
  getGame: vi.fn(),
  getRounds: vi.fn().mockResolvedValue([]),
  putGame: vi.fn(),
}));
vi.mock('../lib/router', () => ({ navigate: vi.fn(), link: vi.fn() }));
vi.mock('../lib/motion', () => ({ pop: vi.fn(), prefersReducedMotion: () => true }));

type Surface = 'start' | 'finished' | 'abandoned';
const roster: Player[] = ['Blake', 'Alex'].map((name) => ({
  id: name.toLowerCase(),
  name,
  color: '#7c5cff',
  createdAt: 1,
}));
const config = { direction: 'high', step: 5, target: 125 };
let stored: Game[];
let component: ReturnType<typeof mount> | undefined;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function button(target: HTMLElement, label: string) {
  const found = [...target.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === label,
  );
  expect(found, label).toBeDefined();
  return found!;
}

function input(target: HTMLElement, key: string, value: string) {
  const control = target.querySelector<HTMLInputElement>(`#${key}`)!;
  control.value = value;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

async function render(surface: Surface) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  if (surface === 'start') {
    component = mount(GameType, { target, props: { type: 'tally' } });
    flushSync();
    for (const chip of target.querySelectorAll<HTMLButtonElement>('.chip')) {
      chip.click();
      flushSync();
    }
    input(target, 'step', '5');
    input(target, 'target', '125');
  } else {
    const saved: Game = {
      id: 'existing-game',
      type: 'tally',
      status: surface,
      playerIds: roster.map((player) => player.id),
      config: { ...config },
      roundCount: 0,
      createdAt: 1,
    };
    stored.push(saved);
    vi.mocked(db.getGame).mockResolvedValue(saved);
    component = mount(GamePlay, { target, props: { id: saved.id } });
    await vi.waitFor(() => {
      flushSync();
      expect(button(target, 'Play again')).toBeDefined();
    });
  }
  return { target, action: button(target, surface === 'start' ? 'Start game' : 'Play again') };
}

beforeEach(async () => {
  vi.clearAllMocks();
  stored = [];
  vi.mocked(db.getAllPlayers).mockResolvedValue(roster);
  vi.mocked(db.getAllGames).mockImplementation(async () => [...stored]);
  vi.mocked(db.putGame).mockImplementation(async (game) => {
    stored.push(structuredClone(game));
  });
  await refreshPlayers();
  games.set([]);
  clearStorageError();
  settings.update((value) => ({ ...value, motion: 'reduce' }));
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.replaceChildren();
  games.set([]);
  clearStorageError();
  settings.update((value) => ({ ...value, motion: 'system' }));
});

describe.each<Surface>(['start', 'finished', 'abandoned'])('%s creation action', (surface) => {
  it('is single-flight through deferred persistence and preserves the submitted snapshot', async () => {
    const { target, action } = await render(surface);
    const original = structuredClone(stored);
    const persistence = deferred();
    vi.mocked(db.putGame).mockImplementation(async (game) => {
      await persistence.promise;
      stored.push(structuredClone(game));
    });
    action.click();
    // Re-enter before Svelte flushes disabled, then bypass disabled to test the handler guard.
    action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(db.putGame).toHaveBeenCalledTimes(1);
    expect(action.disabled).toBe(true);
    expect(action.getAttribute('aria-busy')).toBe('true');
    expect(action.textContent?.trim()).toBe('Starting game...');
    expect(stored).toEqual(original);
    expect(navigate).not.toHaveBeenCalled();

    if (surface === 'start') {
      input(target, 'step', '10');
      target.querySelector<HTMLButtonElement>('.chip')!.click();
      flushSync();
    }
    const submitted = vi.mocked(db.putGame).mock.calls[0][0];
    expect(submitted.playerIds).toEqual(['blake', 'alex']);
    expect(submitted.config).toEqual(config);
    persistence.resolve();
    await vi.waitFor(() => {
      flushSync();
      expect(navigate).toHaveBeenCalledExactlyOnceWith(`/play/${submitted.id}`);
      expect(action.disabled).toBe(false);
    });
    expect(stored).toEqual([...original, submitted]);
    expect(get(storageError)).toBeNull();
    expect(action.getAttribute('aria-busy')).toBe('false');
    expect(action.textContent?.trim()).toBe(surface === 'start' ? 'Start game' : 'Play again');
  });

  it('reports a rejected write, unlocks without losing setup, and allows a deliberate retry', async () => {
    const { target, action } = await render(surface);
    const original = structuredClone(stored);
    const persistence = deferred();
    vi.mocked(db.putGame).mockImplementationOnce(async () => persistence.promise);
    action.click();
    flushSync();
    expect(action.disabled).toBe(true);
    persistence.reject(new Error('synthetic persistence failure'));
    await vi.waitFor(() => {
      flushSync();
      expect(get(storageError)).not.toBeNull();
      expect(action.disabled).toBe(false);
    });
    expect(stored).toEqual(original);
    expect(navigate).not.toHaveBeenCalled();
    if (surface === 'start') {
      expect(target.querySelectorAll('.chip[aria-pressed="true"]')).toHaveLength(2);
      expect(target.querySelector('#step')).toHaveProperty('value', '5');
      expect(target.querySelector('#target')).toHaveProperty('value', '125');
    }
    clearStorageError();
    action.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(db.putGame).toHaveBeenCalledTimes(2);
    expect(stored).toHaveLength(original.length + 1);
    expect(stored.at(-1)).toMatchObject({
      playerIds: ['blake', 'alex'],
      config,
    });
  });

  it('allows ordinary single creation and a later deliberate creation', async () => {
    const { action } = await render(surface);
    const count = stored.length;
    action.click();
    await vi.waitFor(() => {
      flushSync();
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(action.disabled).toBe(false);
    });
    action.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
    expect(stored).toHaveLength(count + 2);
    expect(new Set(stored.map((game) => game.id)).size).toBe(count + 2);
  });
});

it('does not deduplicate independent createGame library requests', async () => {
  const first = await createGame('tally', ['blake', 'alex'], { ...config });
  const second = await createGame('tally', ['blake', 'alex'], { ...config });
  expect(first.id).not.toBe(second.id);
  expect(stored).toEqual([first, second]);
});
