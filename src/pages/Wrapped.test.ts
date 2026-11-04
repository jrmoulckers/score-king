import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, Player, Round } from '../lib/types';
import Wrapped from './Wrapped.svelte';

const stores = vi.hoisted(() => ({ rounds: [] as Round[] }));

vi.mock('../lib/storage/db', () => ({
  getAllRounds: vi.fn(async () => stores.rounds),
}));
vi.mock('../lib/stores/identity', () => ({ setLeadMember: vi.fn() }));
vi.mock('../lib/stores/players', async () => {
  const { writable } = await import('svelte/store');
  return { players: writable<Player[]>([]), activePlayers: writable<Player[]>([]) };
});
vi.mock('../lib/stores/games', async () => {
  const { writable } = await import('svelte/store');
  return { games: writable<Game[]>([]) };
});

import { games } from '../lib/stores/games';
import { players } from '../lib/stores/players';
import { settings } from '../lib/stores/settings';

let target: HTMLDivElement;
let component: ReturnType<typeof mount>;

beforeEach(async () => {
  vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 10, 3, 20).getTime());
  const now = Date.now();
  players.set(['A', 'B'].map((id) => ({ id, name: id, color: '#7c5cff', createdAt: now })));
  const rows: Game[] = [0, 1, 2].map((i) => ({
    id: `g${i}`,
    type: 'tally',
    config: {},
    playerIds: ['A', 'B'],
    winnerIds: ['A'],
    status: 'finished',
    createdAt: now - 1000,
    finishedAt: now - 1000,
    roundCount: 1,
  }));
  games.set(rows);
  stores.rounds = rows.map((g) => ({
    id: `${g.id}-r`,
    gameId: g.id,
    index: 0,
    input: {},
    deltas: { A: 20, B: 10 },
    createdAt: now - 1000,
  }));
  settings.update((value) => ({ ...value, leadMemberId: 'A' }));
  target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(Wrapped, { target });
  await vi.waitFor(() => {
    flushSync();
    expect(tabs().length).toBeGreaterThan(1);
  });
});

afterEach(async () => {
  await unmount(component);
  vi.restoreAllMocks();
  games.set([]);
  players.set([]);
  settings.update((value) => ({ ...value, leadMemberId: null }));
  document.body.replaceChildren();
});

function tabs() {
  return [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function ranges() {
  return [...target.querySelectorAll<HTMLButtonElement>('[aria-label="Wrapped range"] button')];
}

function pressed(index: number) {
  expect(ranges().map((button) => button.textContent?.trim())).toEqual([
    'This year',
    'Last 12 months',
    'Tonight',
  ]);
  expect(ranges().map((button) => button.getAttribute('aria-pressed'))).toEqual(
    ranges().map((_, i) => String(i === index)),
  );
  expect(ranges().map((button) => button.classList.contains('on'))).toEqual(
    ranges().map((_, i) => i === index),
  );
}

function key(element: HTMLElement, value: string, ctrlKey = false) {
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ctrlKey }),
  );
  flushSync();
}

function selected(index: number) {
  const buttons = tabs();
  expect(buttons.filter((button) => button.tabIndex === 0)).toEqual([buttons[index]]);
  expect(buttons.filter((button) => button.getAttribute('aria-selected') === 'true')).toEqual([
    buttons[index],
  ]);
  expect(document.activeElement).toBe(buttons[index]);
  const panel = target.querySelector('[role="tabpanel"]')!;
  expect(panel.id).toBe(buttons[index].getAttribute('aria-controls'));
  expect(panel.getAttribute('aria-labelledby')).toBe(buttons[index].id);
}

describe('Wrapped story keyboard navigation', () => {
  it('moves focus and selection together, wraps arrow boundaries, and supports Home/End', () => {
    tabs()[0].focus();
    selected(0);
    key(tabs()[0], 'ArrowRight');
    selected(1);
    key(tabs()[1], 'End');
    selected(tabs().length - 1);
    key(tabs().at(-1)!, 'ArrowRight');
    selected(0);
    key(tabs()[0], 'ArrowLeft');
    selected(tabs().length - 1);
    key(tabs().at(-1)!, 'Home');
    selected(0);
    key(tabs()[0], 'ArrowRight', true);
    selected(0);
  });

  describe('Wrapped range selection', () => {
    it('exposes exactly one pressed range and resets the story without moving range focus', () => {
      pressed(0);
      for (const index of [1, 2, 0, 0]) {
        tabs()[0].focus();
        key(tabs()[0], 'End');
        const range = ranges()[index];
        range.focus();
        range.click();
        flushSync();
        pressed(index);
        expect(document.activeElement).toBe(range);
        expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
      }
    });

    it.each(['year', 'rolling', 'tonight'] as const)(
      'exposes the initial %s preset before any interaction',
      async (initialPreset) => {
        await unmount(component);
        component = mount(Wrapped, { target, props: { initialPreset } });
        await vi.waitFor(() => {
          flushSync();
          pressed(['year', 'rolling', 'tonight'].indexOf(initialPreset));
        });
      },
    );

    it('preserves date filtering, empty-range feedback, and recovery with truthful pressed state', () => {
      const now = Date.now();
      const times = [
        now - 1000,
        new Date(2026, 9, 1, 12).getTime(),
        new Date(2025, 11, 15, 12).getTime(),
        now - 400 * 86_400_000,
      ];
      const rows: Game[] = times.map((time, i) => ({
        id: `range-${i}`,
        type: 'tally',
        config: {},
        playerIds: ['A', 'B'],
        winnerIds: ['A'],
        status: 'finished',
        createdAt: time,
        finishedAt: time,
        roundCount: 0,
      }));
      games.set(rows);
      flushSync();
      pressed(0);
      expect(target.textContent).toContain('2 games');
      ranges()[1].click();
      flushSync();
      pressed(1);
      expect(target.textContent).toContain('3 games');
      ranges()[2].click();
      flushSync();
      pressed(2);
      expect(target.textContent).toContain('1 games');
      games.set(rows.slice(1));
      flushSync();
      pressed(2);
      expect(target.textContent).toContain('No finished games tonight yet');
      expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
      ranges()[0].click();
      flushSync();
      pressed(0);
      expect(target.textContent).toContain('1 games');
      expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    });
  });

  it('does not hijack range, panel, window, or manual-navigation keys', () => {
    const range = [...target.querySelectorAll<HTMLButtonElement>('.chip')][1];
    range.focus();
    for (const value of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) key(range, value);
    key(window.document.body, 'ArrowRight');
    key(target.querySelector<HTMLElement>('[role="tabpanel"]')!, 'ArrowRight');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(range);
    const next = target.querySelector<HTMLButtonElement>('[aria-label="Next card"]')!;
    next.focus();
    key(next, 'ArrowRight');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    next.click();
    flushSync();
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(next);
    target.querySelector<HTMLButtonElement>('[aria-label="Previous card"]')!.click();
    flushSync();
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('resets progress and panel associations when range changes the story length', () => {
    const count = tabs().length;
    tabs()[0].focus();
    key(tabs()[0], 'End');
    const tonight = [...target.querySelectorAll<HTMLButtonElement>('.chip')][2];
    tonight.focus();
    tonight.click();
    flushSync();
    expect(tabs().length).toBeLessThan(count);
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tonight);
    tabs()[0].focus();
    key(tabs()[0], 'End');
    selected(tabs().length - 1);
    expect(target.querySelector('[aria-label="Next card"]')?.hasAttribute('disabled')).toBe(true);
    key(tabs().at(-1)!, 'Home');
    selected(0);
    expect(target.querySelector('[aria-label="Previous card"]')?.hasAttribute('disabled')).toBe(
      true,
    );
  });
});
