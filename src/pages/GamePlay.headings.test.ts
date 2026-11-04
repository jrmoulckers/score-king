import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, Player, Round } from '../lib/types';
import { blankDef } from '../lib/games/custom/types';
import { getModule } from '../lib/games/registry';
import * as db from '../lib/storage/db';
import { refreshCustomGames } from '../lib/stores/customGames';
import { settings } from '../lib/stores/settings';
import GamePlay from './GamePlay.svelte';

vi.mock('../lib/storage/db', () => ({
  getAllPlayers: vi.fn().mockResolvedValue([]),
  getAllGames: vi.fn().mockResolvedValue([]),
  getAllGameDefs: vi.fn().mockResolvedValue([]),
  getGame: vi.fn(),
  getRounds: vi.fn(),
}));

const roster: Player[] = ['Ada', 'Bo', 'Cy', 'Dee'].map((name) => ({
  id: name,
  name,
  color: '#7c5cff',
  createdAt: 1,
}));
const custom = { ...blankDef(), id: 'def_headings', name: 'Synthetic Crown Counter!' };
let component: ReturnType<typeof mount> | undefined;

async function render(type: string, status: Game['status'] = 'active', editing = false) {
  const module = getModule(type)!;
  const players = roster.slice(0, type === 'hearts' ? 4 : 2);
  const game: Game = {
    id: 'synthetic-headings',
    type,
    status,
    playerIds: players.map((player) => player.id),
    config: type === 'hearts' ? { passMode: 'clockwise' } : {},
    roundCount: editing ? 1 : 0,
    createdAt: 1,
  };
  const round: Round = {
    id: 'synthetic-round',
    gameId: game.id,
    index: 0,
    input: module.createRoundInput({
      game,
      players,
      config: game.config,
      roundIndex: 0,
      totals: {},
      rounds: [],
    }),
    deltas: {},
    createdAt: 1,
  };
  vi.mocked(db.getAllPlayers).mockResolvedValue(players);
  vi.mocked(db.getGame).mockResolvedValue(game);
  vi.mocked(db.getRounds).mockResolvedValue(editing ? [round] : []);
  const target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(GamePlay, { target, props: { id: game.id } });
  await vi.waitFor(() => {
    flushSync();
    expect(target.querySelector('h1')?.textContent).toBe(module.name);
  });
  if (editing) {
    target.querySelector<HTMLButtonElement>('[aria-label="Edit round 1"]')!.click();
  }
  if (status === 'active') {
    await vi.waitFor(() => {
      flushSync();
      expect(target.querySelectorAll('.prow').length).toBeGreaterThan(0);
    });
  }
  return target;
}

function headings(target: HTMLElement) {
  return [...target.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((heading) => [
    heading.tagName,
    heading.textContent,
  ]);
}

beforeEach(async () => {
  vi.clearAllMocks();
  settings.update((value) => ({ ...value, motion: 'reduce' }));
  vi.mocked(db.getAllGameDefs).mockResolvedValue([custom]);
  await refreshCustomGames();
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.replaceChildren();
  settings.update((value) => ({ ...value, motion: 'system' }));
});

describe('shared scoring page heading hierarchy', () => {
  it.each([
    ['def_headings', custom.name, null],
    ['tally', 'Tally', null],
    ['azul', 'Azul', '🧱 Round 1'],
    ['hearts', 'Hearts', 'Scoring'],
  ] as const)('names the game and fresh round above the %s editor', async (type, name, nested) => {
    const target = await render(type);
    expect(headings(target)).toEqual([
      ['H1', name],
      ['H2', 'Round 1'],
      ...(nested ? [['H3', nested]] : []),
      ...(type === 'hearts' ? [['H3', 'Wrong-way moments']] : []),
    ]);
    expect(target.querySelector('h1')?.hasAttribute('tabindex')).toBe(false);
  });

  it.each([
    ['def_headings', custom.name, null],
    ['azul', 'Azul', '🧱 Round 1'],
    ['hearts', 'Hearts', 'Scoring'],
  ] as const)('replaces the round heading while editing %s', async (type, name, nested) => {
    const target = await render(type, 'active', true);
    expect(headings(target)).toEqual([
      ['H1', name],
      ['H2', 'Editing round 1'],
      ...(nested ? [['H3', nested]] : []),
      ...(type === 'hearts' ? [['H3', 'Wrong-way moments']] : []),
    ]);
  });

  it.each(['finished', 'abandoned'] as const)(
    'retains only the game heading for a %s wrapper',
    async (status) => {
      const target = await render(custom.id, status);
      expect(headings(target)).toEqual([['H1', custom.name]]);
      expect(target.querySelector('.round-heading')).toBeNull();
      expect(target.querySelector('.save-round')).toBeNull();
      expect(target.querySelector('[aria-label="Edit round 1"]')).toBeNull();
    },
  );
});
