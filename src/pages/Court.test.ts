import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, Player, Round } from '../lib/types';
import Court from './Court.svelte';

const fixture = vi.hoisted(() => ({ rounds: [] as Round[] }));

vi.mock('../lib/storage/db', () => ({
  getAllRounds: vi.fn(async () => fixture.rounds),
}));
vi.mock('../lib/stores/players', async () => {
  const { writable } = await import('svelte/store');
  return { players: writable<Player[]>([]) };
});
vi.mock('../lib/stores/games', async () => {
  const { writable } = await import('svelte/store');
  return { games: writable<Game[]>([]) };
});

import { games } from '../lib/stores/games';
import { players } from '../lib/stores/players';
import { settings } from '../lib/stores/settings';

let target: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
const names = [
  'Alex',
  'Alexandria Catherine Montgomery-Williams',
  'AlexandriaLongUnbrokenNameForSyntheticQA',
];

beforeEach(() => {
  const now = Date.now();
  players.set(
    ['A', 'B', 'C'].map((id) => ({
      id,
      name: id,
      color: '#7c5cff',
      createdAt: now,
    })),
  );
  const winners = [['A'], ['A'], ['B'], ['B'], ['A'], ['A', 'B']];
  const rows: Game[] = winners.map((winnerIds, index) => ({
    id: `g${index}`,
    type: index < 3 ? 'tally' : 'skullking',
    config: {},
    playerIds: ['A', 'B', 'C'],
    winnerIds,
    status: 'finished',
    createdAt: now - (6 - index) * 1000,
    finishedAt: now - (6 - index) * 1000,
    roundCount: 1,
  }));
  games.set(rows);
  fixture.rounds = rows.map((game) => ({
    id: `${game.id}-r`,
    gameId: game.id,
    index: 0,
    input: {},
    deltas: {
      A: game.winnerIds?.includes('A') ? 30 : 20,
      B: game.winnerIds?.includes('B') ? 30 : 20,
      C: 10,
    },
    createdAt: game.createdAt,
  }));
  settings.update((value) => ({ ...value, leadMemberId: 'A', roastMode: true }));
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  games.set([]);
  players.set([]);
  settings.update((value) => ({ ...value, leadMemberId: null }));
  document.body.replaceChildren();
});

function click(group: string, label: string) {
  const button = [
    ...target.querySelectorAll<HTMLButtonElement>(`[aria-label="${group}"] button`),
  ].find((candidate) => candidate.textContent?.trim().includes(label));
  expect(button).toBeDefined();
  button!.click();
  flushSync();
}

describe('Court identity and figures', () => {
  it.each(names)('retains full identity, badge and tied figures: %s', async (name) => {
    players.update((rows) => rows.map((row) => (row.id === 'A' ? { ...row, name } : row)));
    component = mount(Court, { target });
    await vi.waitFor(() => {
      flushSync();
      expect(target.querySelectorAll('.standing')).toHaveLength(3);
    });
    const leader = target.querySelector('.standing')!;
    expect(leader.querySelector('.member-name')?.textContent).toBe(name);
    expect(leader.querySelector('.you')?.textContent).toBe('You');
    expect([...leader.querySelectorAll('.fig b')].map((node) => node.textContent)).toEqual([
      '4',
      '67%',
      '1.3',
      '🔥2',
    ]);
    expect(target.querySelector('.matrix .nm')?.textContent).toBe(name);
    const region = target.querySelector<HTMLElement>('[aria-label="Head-to-head results"]')!;
    expect(region.tabIndex).toBe(0);
    expect(region.querySelector('table')).not.toBeNull();
    expect(region.textContent).toContain('3–2');

    for (const sort of ['Win %', 'Games', 'Streak', 'Avg', 'Wins']) {
      click('Sort standings', sort);
      expect(target.querySelectorAll('.standing .fig')).toHaveLength(12);
      expect(target.querySelector('.standing .member-name')?.textContent).toBe(name);
    }
    click('Filter by game', 'Tally');
    expect(target.querySelector('.standing .fig b')?.textContent).toBe('2');
    click('Filter by game', 'All games');
    expect(target.querySelector('.standing .fig b')?.textContent).toBe('4');
    click('Filter by time', 'All-time');
    expect(target.querySelector('.standing .member-name')?.textContent).toBe(name);
    expect(fixture.rounds).toHaveLength(6);
  });
});
