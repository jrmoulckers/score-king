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
  games.set([]);
  players.set([]);
  settings.update((value) => ({ ...value, leadMemberId: null }));
  document.body.replaceChildren();
});

function tabs() {
  return [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
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
