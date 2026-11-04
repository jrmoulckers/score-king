import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, Player, Round } from '../lib/types';
import { emptyInput } from '../lib/games/hearts/logic';
import * as db from '../lib/storage/db';
import { settings } from '../lib/stores/settings';
import { get } from 'svelte/store';
import { dismissToast, toast } from '../lib/stores/toast';
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
  dismissToast();
  settings.update((value) => ({ ...value, motion: 'system' }));
});

describe('rematch numeric constraints', () => {
  it('does not clone invalid saved rules or change the original game', async () => {
    const saved: Game = {
      ...game,
      type: 'tally',
      status: 'finished',
      config: { step: 0, target: 0 },
    };
    vi.mocked(db.getAllPlayers).mockResolvedValue(roster);
    vi.mocked(db.getGame).mockResolvedValue(saved);
    vi.mocked(db.getRounds).mockResolvedValue([]);
    const target = document.createElement('div');
    document.body.appendChild(target);
    component = mount(GamePlay, { target, props: { id: saved.id } });
    await vi.waitFor(() => {
      flushSync();
      expect(button(target, 'Play again')).toBeDefined();
    });
    button(target, 'Play again').click();
    flushSync();
    expect(db.putGame).not.toHaveBeenCalled();
    expect(get(toast)?.message).toContain('Point step:');
    expect(get(toast)?.message).toContain('Start a new game to adjust the setup.');
    expect(saved.config).toEqual({ step: 0, target: 0 });
  });
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
    const choices = target.querySelectorAll('.moon-choice');
    expect(choices).toHaveLength(2);
    expect(choices[1].compareDocumentPosition(save) & 4).toBe(4);
    expect(target.querySelector('.save-area')?.textContent).toContain('Round not saved yet.');
    expect(target.querySelectorAll('.prow .outcome')[0].textContent).toContain('shot the moon');
    expect(target.querySelectorAll('.prow .outcome')[1].textContent).toContain('points pending');
    choices[1].querySelector<HTMLButtonElement>('button')!.click();
    flushSync();
    for (const choice of choices)
      expect(choice.querySelector('button')!.getAttribute('aria-pressed')).toBe('true');
    expect(save.disabled).toBe(false);
    expect(target.querySelector('[role="alert"]')).toBeNull();
    expect(db.putRound).not.toHaveBeenCalled();
    choices[0].querySelector<HTMLButtonElement>('button:nth-child(2)')!.click();
    flushSync();
    for (const choice of choices)
      expect(choice.querySelector('button:nth-child(2)')!.getAttribute('aria-pressed')).toBe(
        'true',
      );
    expect(target.querySelectorAll('.prow .outcome')[1].textContent).toContain('no points added');
    expect(save.disabled).toBe(false);
  });

  it.each(['add26', 'subtract'] as const)(
    'preserves a saved moon choice and shares edits at both controls (%s)',
    async (moonRule) => {
      const saved: Round = {
        id: 'saved-moon',
        gameId: game.id,
        index: 0,
        input: {
          ...emptyInput(ids),
          hearts: { a: 13, b: 0, c: 0, d: 0 },
          queens: { a: 1, b: 0, c: 0, d: 0 },
          moonRule,
        },
        deltas: moonRule === 'add26' ? { a: 0, b: 26, c: 26, d: 26 } : { a: -26, b: 0, c: 0, d: 0 },
        createdAt: 1,
      };
      const target = await render([saved]);
      target.querySelector<HTMLButtonElement>('[aria-label="Edit round 1"]')!.click();
      await vi.waitFor(() => {
        flushSync();
        expect(target.querySelectorAll('.moon-choice')).toHaveLength(2);
      });
      const choices = target.querySelectorAll('.moon-choice');
      const selector = moonRule === 'add26' ? 'button' : 'button:nth-child(2)';
      for (const choice of choices)
        expect(choice.querySelector(selector)!.getAttribute('aria-pressed')).toBe('true');
      expect(button(target, 'Save changes').disabled).toBe(false);
      expect(target.querySelector('.save-area')?.textContent).toContain('Changes not saved yet.');
      expect(target.querySelector('.prow .outcome')?.textContent).toBe('🌙 shot the moon');
      choices[1].querySelector<HTMLButtonElement>('button:nth-child(2)')!.click();
      flushSync();
      expect(choices[0].querySelector('button:nth-child(2)')!.getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(db.putRound).not.toHaveBeenCalled();
      expect((saved.input as { moonRule: string }).moonRule).toBe(moonRule);
      button(target, 'Clear hand').click();
      flushSync();
      target.querySelector<HTMLButtonElement>('.moon-btn')!.click();
      flushSync();
      expect(button(target, 'Save changes').disabled).toBe(true);
      expect(target.querySelector('[role="alert"]')?.textContent).toContain(
        'Choose how to score the moon to continue.',
      );
    },
  );

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
