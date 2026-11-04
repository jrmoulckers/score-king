import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, Round } from '../lib/types';
import { games, refreshGames } from '../lib/stores/games';
import { dismissToast, toast } from '../lib/stores/toast';
import History from './History.svelte';

const fixture = vi.hoisted(() => ({ games: [] as Game[], rounds: [] as Round[] }));

vi.mock('../lib/storage/db', () => ({
  getAllPlayers: vi.fn().mockResolvedValue([]),
  getAllGames: vi.fn(async () => structuredClone(fixture.games)),
  getRounds: vi.fn(async (id: string) =>
    structuredClone(fixture.rounds.filter((round) => round.gameId === id)),
  ),
  putGame: vi.fn(async (game: Game) => {
    fixture.games = [...fixture.games.filter((row) => row.id !== game.id), structuredClone(game)];
  }),
  putRound: vi.fn(async (round: Round) => {
    fixture.rounds = [...fixture.rounds.filter((row) => row.id !== round.id), structuredClone(round)];
  }),
  deleteGame: vi.fn(async (id: string) => {
    fixture.games = fixture.games.filter((game) => game.id !== id);
    fixture.rounds = fixture.rounds.filter((round) => round.gameId !== id);
  }),
}));
vi.mock('../lib/games/registry', () => ({ getModule: vi.fn() }));
vi.mock('../lib/router', () => ({ link: vi.fn() }));

let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;

async function settle() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  flushSync();
  await tick();
}

async function render(count = 8, abandoned = 1) {
  fixture.games = Array.from({ length: count }, (_, index) => ({
    id: `history-${index}`,
    type: 'tally',
    config: {},
    playerIds: ['synthetic-player'],
    status: index < abandoned ? 'abandoned' : index === abandoned ? 'active' : 'finished',
    createdAt: index + 1,
    roundCount: 1,
  }));
  fixture.rounds = fixture.games.map((game) => ({
    id: `${game.id}-round`,
    gameId: game.id,
    index: 0,
    input: { score: 20 },
    deltas: { 'synthetic-player': 20 },
    createdAt: game.createdAt,
  }));
  await refreshGames();
  component = mount(History, { target });
  flushSync();
}

function radio(label: string) {
  return [...target.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
    (element) => element.textContent?.trim() === label,
  )!;
}

async function click(element: HTMLElement) {
  element.click();
  await settle();
}

function ids() {
  return [...target.querySelectorAll<HTMLAnchorElement>('.libitem:not(.arch) a.info')].map(
    (element) => element.getAttribute('href')!.split('/').at(-1),
  );
}

function expectAll() {
  const buttons = [...target.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  expect(buttons.map((button) => button.textContent?.trim())).toEqual(['All', 'Active', 'Finished']);
  expect(buttons.map((button) => button.getAttribute('aria-checked'))).toEqual([
    'true',
    'false',
    'false',
  ]);
  expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1, -1]);
}

beforeEach(async () => {
  await refreshGames();
  fixture.games = [];
  fixture.rounds = [];
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  games.set([]);
  dismissToast();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('History shrinking status options', () => {
  it.each([
    [8, 'Archive game'],
    [8, 'Delete game'],
    [6, 'Archive game'],
    [6, 'Delete game'],
  ])(
    'normalizes the last abandoned status after %i records / %s, including Undo',
    async (count, action) => {
      await render(count);
      const before = structuredClone(fixture);
      await click(radio('Abandoned'));
      expect(ids()).toEqual(['history-0']);
      await click(target.querySelector<HTMLButtonElement>(`[aria-label="${action}"]`)!);
      expect(ids()).toEqual(
        Array.from({ length: count - 1 }, (_, index) => `history-${count - index - 1}`),
      );
      expect(target.textContent).not.toContain('No games match');
      if (count === 8) expectAll();
      else expect(target.querySelector('[role="radiogroup"]')).toBeNull();
      expect(fixture.games.filter((game) => !game.archived)).toHaveLength(count - 1);
      get(toast)!.action!.run();
      await settle();
      expect(ids()).toEqual(
        Array.from({ length: count }, (_, index) => `history-${count - index - 1}`),
      );
      expect(radio('All').getAttribute('aria-checked')).toBe('true');
      expect(radio('Abandoned').getAttribute('aria-checked')).toBe('false');
      expect(fixture.games.slice().sort((a, b) => a.id.localeCompare(b.id))).toEqual(
        before.games.map((game) =>
          action === 'Archive game' && game.id === 'history-0' ? { ...game, archived: false } : game,
        ),
      );
      expect(fixture.rounds.slice().sort((a, b) => a.id.localeCompare(b.id))).toEqual(before.rounds);
    },
  );

  it('restores from existing archive rows without resurrecting the invalid filter', async () => {
    await render();
    await click(radio('Abandoned'));
    await click(target.querySelector<HTMLButtonElement>('[aria-label="Archive game"]')!);
    await click(target.querySelector<HTMLButtonElement>('.archtoggle')!);
    expect(target.querySelectorAll('.libitem.arch')).toHaveLength(1);
    await click(target.querySelector<HTMLButtonElement>('.arch .btn')!);
    expect(ids()).toHaveLength(8);
    expect(radio('All').getAttribute('aria-checked')).toBe('true');
    expect(radio('Abandoned').getAttribute('aria-checked')).toBe('false');
    expect(target.querySelector('.libitem.arch')).toBeNull();
  });

  it.each([8, 6])(
    'recovers removed-radio focus with %i records and keeps a keyboard entry point',
    async (count) => {
      await render(count);
      await click(radio('Abandoned'));
      radio('Abandoned').focus();
      games.update((rows) =>
        rows.map((game) => (game.id === 'history-0' ? { ...game, archived: true } : game)),
      );
      await settle();
      if (count === 6) {
        expect(document.activeElement).toBe(target.querySelector('h1'));
        return;
      }
      expectAll();
      expect(document.activeElement).toBe(radio('All'));
      flushSync(() =>
        radio('All').dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
        ),
      );
      expect(document.activeElement).toBe(radio('Active'));
      expect(radio('Active').getAttribute('aria-checked')).toBe('true');
      expect(ids()).toEqual(['history-1']);
    },
  );

  it('does not steal focus from an unrelated surviving control', async () => {
    await render();
    await click(radio('Abandoned'));
    const search = target.querySelector<HTMLInputElement>('[aria-label="Search games"]')!;
    search.focus();
    games.update((rows) => rows.filter((game) => game.id !== 'history-0'));
    await settle();
    expectAll();
    expect(document.activeElement).toBe(search);
  });

  it('preserves a still-available Abandoned choice and an empty but offered Active choice', async () => {
    await render(8, 2);
    await click(radio('Abandoned'));
    await click(target.querySelector<HTMLButtonElement>('[aria-label="Archive game"]')!);
    expect(radio('Abandoned').getAttribute('aria-checked')).toBe('true');
    expect(ids()).toEqual(['history-0']);
    await click(radio('Active'));
    games.update((rows) => rows.filter((game) => game.status !== 'active'));
    await settle();
    expect(radio('Active').getAttribute('aria-checked')).toBe('true');
    expect(target.textContent).toContain('No games match');
  });

  it('preserves search, ordering and a valid Finished selection when Abandoned disappears', async () => {
    await render();
    await click(radio('Finished'));
    const search = target.querySelector<HTMLInputElement>('[aria-label="Search games"]')!;
    search.value = 'tally';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await click(target.querySelector<HTMLButtonElement>('.viewtoggle')!);
    const sort = target.querySelectorAll<HTMLSelectElement>('select')[1];
    sort.value = 'oldest';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
    games.update((rows) => rows.filter((game) => game.id !== 'history-0'));
    await settle();
    expect(radio('Finished').getAttribute('aria-checked')).toBe('true');
    expect(search.value).toBe('tally');
    expect(sort.value).toBe('oldest');
    expect(ids()).toEqual(['history-2', 'history-3', 'history-4', 'history-5', 'history-6', 'history-7']);
  });
});
