import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { games } from '../lib/stores/games';
import { players } from '../lib/stores/players';
import type { Game } from '../lib/types';
import History from './History.svelte';

vi.mock('../lib/storage/db', () => ({
  getAllPlayers: vi.fn().mockResolvedValue([]),
  getAllGames: vi.fn().mockResolvedValue([]),
}));
vi.mock('../lib/games/registry', () => ({ getModule: vi.fn() }));
vi.mock('../lib/router', () => ({ link: vi.fn() }));

let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  games.set([]);
  players.set([]);
  document.body.replaceChildren();
});

async function render(overrides: Partial<Game> = {}) {
  await Promise.resolve();
  players.set([
    { id: 'long', name: 'SyntheticWinner' + 'A'.repeat(25), color: '#7c5cff', createdAt: 1 },
    { id: 'short', name: 'Jo', color: '#34d399', createdAt: 1 },
  ]);
  games.set([
    {
      id: 'display-fixture',
      type: 'tally',
      config: {},
      playerIds: ['long', 'short'],
      status: 'finished',
      createdAt: 1,
      roundCount: 2,
      winnerIds: ['long'],
      winnerScore: 20,
      runnerUpScore: 10,
      ...overrides,
    },
  ]);
  component = mount(History, { target: document.body });
  flushSync();
  if (overrides.archived) {
    document.querySelector<HTMLButtonElement>('.archtoggle')!.click();
    flushSync();
  }
  return document.querySelector<HTMLElement>('.libitem')!;
}

describe('History card result presentation', () => {
  it.each([false, true])(
    'keeps the full winner, score and margin outside ellipsized metadata (archived: %s)',
    async (archived) => {
      const card = await render({ archived });
      const result = card.querySelector('.result')!;
      expect(result.textContent).toContain('SyntheticWinner' + 'A'.repeat(25));
      expect(result.querySelector('.score')?.textContent).toBe('20');
      expect(result.querySelector('.margin')?.textContent).toBe('· by 10');
      expect(result.closest('.oneline')).toBeNull();
      expect(card.querySelector('.summary[title]')?.textContent).not.toContain('20');
      expect(card.querySelector('.summary[title]')).not.toBeNull();
      expect(card.querySelector('a.info')?.getAttribute('href')).toBe('/play/display-fixture');
      expect(
        [...card.querySelectorAll('button')].map(
          (button) => button.getAttribute('aria-label') ?? button.textContent,
        ),
      ).toEqual(archived ? ['Restore', 'Delete game'] : ['Share results', 'Archive game', 'Delete game']);
    },
  );

  it('preserves stored tied identities, including repeated winner ids, without deduplication', async () => {
    const card = await render({ winnerIds: ['short', 'long', 'short'], runnerUpScore: undefined });
    expect(card.querySelector('.result')?.textContent).toContain(
      'Jo & SyntheticWinner' + 'A'.repeat(25) + ' & Jo',
    );
    expect(card.querySelector('.score')?.textContent).toBe('20');
    expect(card.querySelector('.margin')).toBeNull();
  });

  it.each([
    { winnerScore: 0, runnerUpScore: 10, score: '0', margin: '· by 10' },
    { winnerScore: -20, runnerUpScore: -30, score: '-20', margin: '· by 10' },
    { winnerScore: 20, runnerUpScore: 20, score: '20', margin: undefined },
    { winnerScore: undefined, runnerUpScore: undefined, score: undefined, margin: undefined },
  ])('retains existing summary semantics for $score / $margin', async (values) => {
    const card = await render({
      winnerScore: values.winnerScore,
      runnerUpScore: values.runnerUpScore,
    });
    expect(card.querySelector('.score')?.textContent).toBe(values.score);
    expect(card.querySelector('.margin')?.textContent).toBe(values.margin);
  });

  it.each(['active', 'abandoned'] as const)('keeps the %s summary without a winner', async (status) => {
    const card = await render({ status });
    expect(card.textContent).toContain(status === 'active' ? 'In progress' : 'Abandoned');
    expect(card.querySelector('.summary')?.textContent).toContain('2 rounds');
    expect(card.querySelector('.result')).toBeNull();
    expect(card.querySelector('[aria-label="Share results"]')).toBeNull();
    if (status === 'abandoned') {
      expect(card.querySelector('.summary')?.textContent).toContain('no winner');
    }
  });
});
