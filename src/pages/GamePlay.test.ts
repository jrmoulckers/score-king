import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, Player, Round } from '../lib/types';
import { emptyInput } from '../lib/games/hearts/logic';
import * as db from '../lib/storage/db';
import { settings } from '../lib/stores/settings';
import GamePlay from './GamePlay.svelte';

vi.mock('../lib/storage/db', () => ({
  getAllPlayers: vi.fn().mockResolvedValue([]),
  getAllGames: vi.fn().mockResolvedValue([]),
  getAllGameDefs: vi.fn().mockResolvedValue([]),
  getGame: vi.fn(),
  getRounds: vi.fn(),
  putRound: vi.fn().mockResolvedValue(undefined),
  putGame: vi.fn().mockResolvedValue(undefined),
}));

const ids = ['a', 'b', 'c', 'd'];
const roster: Player[] = ids.map((id) => ({
  id,
  name: id.toUpperCase(),
  color: '#7c5cff',
  createdAt: 1,
}));
const game: Game = {
  id: 'synthetic-scoring',
  type: 'hearts',
  playerIds: ids,
  config: { passMode: 'clockwise' },
  status: 'active',
  roundCount: 0,
  createdAt: 1,
};
let component: ReturnType<typeof mount> | undefined;

async function render(rounds: Round[] = []) {
  vi.mocked(db.getAllPlayers).mockResolvedValue(roster);
  vi.mocked(db.getGame).mockResolvedValue(game);
  vi.mocked(db.getRounds).mockResolvedValue(rounds);
  const target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(GamePlay, { target, props: { id: game.id } });
  await vi.waitFor(() => {
    flushSync();
    expect(target.querySelectorAll('.prow')).toHaveLength(4);
  });
  return target;
}

function button(target: HTMLElement, text: string) {
  return [...target.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === text,
  )!;
}

function setHearts(target: HTMLElement, id: string, value: number) {
  const field = target.querySelector<HTMLInputElement>(`[aria-label="${id} hearts"]`)!;
  field.value = String(value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.update((value) => ({ ...value, motion: 'reduce' }));
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.replaceChildren();
  settings.update((value) => ({ ...value, motion: 'system' }));
});

describe('Hearts scoring presentation and entry feedback', () => {
  it('separates scoring from guidance and keeps allocation and moon choices guarded', async () => {
    const target = await render();
    const header = target.querySelector('.scoring-header')!;
    expect(header.querySelector('h2')?.textContent).toBe('Scoring');
    expect(header.previousElementSibling?.querySelector('h2')).toBeNull();
    expect(target.querySelector('.pass')).not.toBeNull();
    expect(header.compareDocumentPosition(target.querySelector('.prow')!) & 4).toBe(4);
    expect(target.textContent?.match(/Fewer points is better/g)).toHaveLength(1);
    expect(target.querySelector('.help')).toBeNull();
    expect(button(target, 'How to play')).toBeDefined();
    expect(target.querySelector('.game-extras summary')?.textContent).toContain('Extras');

    const save = button(target, 'Save round');
    expect(target.querySelector('[role="alert"]')?.textContent).toBe(
      '⚠️ Assign the remaining 13 hearts to continue.',
    );
    expect(save.disabled).toBe(true);
    setHearts(target, 'A', 12);
    expect(target.querySelector('[role="alert"]')?.textContent).toContain(
      'Assign the remaining 1 heart to continue.',
    );
    setHearts(target, 'B', 2);
    expect(target.querySelector('[role="alert"]')?.textContent).toContain(
      'Unassign 1 heart to continue.',
    );
    expect(save.disabled).toBe(true);
    setHearts(target, 'B', 1);
    expect(target.querySelector('[role="alert"]')?.textContent).toContain(
      'Assign the remaining Queen of Spades to continue.',
    );
    target
      .querySelector<HTMLButtonElement>('[aria-label^="Assign Queen of Spades to A."]')!
      .click();
    flushSync();
    expect(target.querySelector('[role="alert"]')).toBeNull();
    expect(save.disabled).toBe(false);
    expect(target.querySelector('.prow .preview')?.textContent).toBe('+25');

    button(target, 'Clear hand').click();
    flushSync();
    expect(save.disabled).toBe(true);
    target.querySelector<HTMLButtonElement>('.moon-btn')!.click();
    flushSync();
    expect(target.querySelector('[role="alert"]')?.textContent).toContain(
      'Choose how to score the moon to continue.',
    );
    expect(save.disabled).toBe(true);
    button(target, 'Everyone else +26').click();
    flushSync();
    expect(save.disabled).toBe(false);
    expect(target.querySelector('[role="alert"]')).toBeNull();
    expect(db.putRound).not.toHaveBeenCalled();
  });

  it('uses the same actionable alert and save guard when editing a saved round', async () => {
    const saved: Round = {
      id: 'synthetic-round',
      gameId: game.id,
      index: 0,
      input: {
        ...emptyInput(ids),
        hearts: { a: 12, b: 1, c: 0, d: 0 },
        queens: { a: 1, b: 0, c: 0, d: 0 },
      },
      deltas: { a: 25, b: 1, c: 0, d: 0 },
      createdAt: 1,
    };
    const target = await render([saved]);
    target.querySelector<HTMLButtonElement>('[aria-label="Edit round 1"]')!.click();
    flushSync();
    await vi.waitFor(() => {
      flushSync();
      expect(button(target, 'Save changes')).toBeDefined();
      expect(target.querySelectorAll('.prow')).toHaveLength(4);
    });
    setHearts(target, 'A', 11);
    expect(target.querySelector('[role="alert"]')?.textContent).toBe(
      '⚠️ Assign the remaining 1 heart to continue.',
    );
    expect(button(target, 'Save changes').disabled).toBe(true);
    expect(db.putRound).not.toHaveBeenCalled();
    expect(saved.deltas).toEqual({ a: 25, b: 1, c: 0, d: 0 });
  });
});
