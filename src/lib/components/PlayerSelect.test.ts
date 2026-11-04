import { flushSync, mount, tick, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addPlayer, getAllPlayers } from '../storage/db';
import { players, refreshPlayers } from '../stores/players';
import { savePreset } from '../stores/presets';
import { settings } from '../stores/settings';
import { clearStorageError, storageError } from '../stores/storage';
import { dismissToast, toast } from '../stores/toast';
import type { Player, PresetKind } from '../types';
import GamePresets from './GamePresets.svelte';
import PlayerSelect from './PlayerSelect.svelte';
import source from './PlayerSelect.svelte?raw';

vi.mock('../storage/db', () => ({
  getAllPlayers: vi.fn().mockResolvedValue([]),
  addPlayer: vi.fn(),
}));

const names = [
  'Sam',
  'Alexandria Catherine Montgomery-Williams',
  'Q'.repeat(40),
  ...Array.from({ length: 9 }, (_, i) => `Player ${i + 1}`),
];
let component: ReturnType<typeof mount> | undefined;
let presetsComponent: ReturnType<typeof mount> | undefined;
let stored: Player[];

beforeEach(async () => {
  vi.clearAllMocks();
  stored = names.map((name, i) => ({
    id: `player-${i}`,
    name,
    color: '#7c5cff',
    createdAt: i,
  }));
  vi.mocked(getAllPlayers).mockImplementation(async () => [...stored]);
  vi.mocked(addPlayer).mockImplementation(async (name, color, claimed) => {
    const player = { id: `player-${stored.length}`, name, color, claimed, createdAt: 100 };
    stored.push(player);
    return player;
  });
  await refreshPlayers();
});

afterEach(async () => {
  if (component) await unmount(component);
  if (presetsComponent) await unmount(presetsComponent);
  component = undefined;
  presetsComponent = undefined;
  players.set([]);
  dismissToast();
  clearStorageError();
  settings.update((value) => ({ ...value, gamePresets: [] }));
  document.body.replaceChildren();
});

function renderCapacity(selected: string[] = [], max = 12) {
  const lineup = new SvelteMap([['selected', selected]]);
  const limits = new SvelteMap([['max', max]]);
  const props = {
    get selected() {
      return lineup.get('selected')!;
    },
    set selected(value: string[]) {
      lineup.set('selected', value);
    },
    get max() {
      return limits.get('max')!;
    },
  };
  component = mount(PlayerSelect, { target: document.body, props });
  flushSync();
  return { props, limits };
}

function chips() {
  return [...document.querySelectorAll<HTMLButtonElement>('.chip')];
}

async function addNamed(name: string) {
  const input = document.querySelector<HTMLInputElement>('input')!;
  input.value = name;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  document
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  flushSync();
}

async function settleCreation() {
  await vi.waitFor(() =>
    expect(document.querySelector('form')?.getAttribute('aria-busy')).toBe('false'),
  );
  flushSync();
}

describe('player selection capacity', () => {
  it('disables only unselected choices at capacity and re-enables them after deselection', () => {
    stored.push({ ...stored[0], id: 'extra', name: 'Extra' });
    players.set([...stored]);
    const { props } = renderCapacity(names.slice(0, 11).map((_, i) => `player-${i}`));
    expect(chips().every((chip) => !chip.disabled)).toBe(true);
    flushSync(() => chips()[11].click());
    expect(props.selected).toHaveLength(12);
    expect(chips()[12].disabled).toBe(true);
    expect(chips().slice(0, 12).every((chip) => !chip.disabled)).toBe(true);
    const hint = document.getElementById(chips()[12].getAttribute('aria-describedby')!)!;
    expect(hint.getAttribute('role')).toBe('status');
    expect(hint.textContent).toContain('at most 12 players');
    expect(hint.textContent).toContain('Deselect');
    flushSync(() => chips()[12].click());
    expect(props.selected).toHaveLength(12);
    flushSync(() => chips()[0].click());
    expect(chips()[12].disabled).toBe(false);
    expect(document.getElementById(hint.id)).toBeNull();
    flushSync(() => chips()[12].click());
    expect(props.selected).toEqual([
      ...names.slice(1).map((_, i) => `player-${i + 1}`),
      'extra',
    ]);
  });

  it('retains the full ordered lineup when a dynamic maximum drops, and recovers without truncation', () => {
    const selected = ['player-3', 'player-1', 'player-0'];
    const { props, limits } = renderCapacity(selected, 4);
    flushSync(() => limits.set('max', 2));
    expect(props.selected).toEqual(selected);
    expect(chips().filter((chip) => !chip.disabled)).toHaveLength(3);
    expect(document.querySelector('[role="status"]')?.textContent).toContain('at most 2 players');
    flushSync(() => chips()[3].click());
    expect(props.selected).toEqual(['player-1', 'player-0']);
    expect(chips()[2].disabled).toBe(true);
    flushSync(() => chips()[1].click());
    expect(chips()[2].disabled).toBe(false);
    flushSync(() => limits.set('max', 1));
    expect(props.selected).toEqual(['player-0']);
    expect(document.querySelector('[role="status"]')?.textContent).toContain('at most 1 player.');
    flushSync(() => limits.set('max', 5));
    expect(chips().every((chip) => !chip.disabled)).toBe(true);
  });

  it.each(['named', 'random'])(
    'keeps a %s creation in the roster at capacity and lets it be selected after making room',
    async (kind) => {
      const { props } = renderCapacity(['player-1', 'player-0'], 2);
      if (kind === 'named') await addNamed('New friend');
      else {
        document.querySelector<HTMLButtonElement>('[aria-label="Add a random player"]')!.click();
      }
      await settleCreation();
      expect(stored).toHaveLength(13);
      expect(get(players).at(-1)?.id).toBe('player-12');
      expect(props.selected).toEqual(['player-1', 'player-0']);
      expect(chips()[12].disabled).toBe(true);
      expect(get(toast)?.message).toContain(
        `${stored[12].name} was added to Players, but not selected.`,
      );
      expect(get(toast)?.message).toContain('Deselect players to make room.');
      flushSync(() => chips()[1].click());
      flushSync(() => chips()[12].click());
      expect(props.selected).toEqual(['player-0', 'player-12']);
      expect(stored).toHaveLength(13);
    },
  );

  it.each(['named', 'random'])('selects a %s creation when space remains', async (kind) => {
    const { props } = renderCapacity(['player-0'], 2);
    if (kind === 'named') await addNamed('New friend');
    else document.querySelector<HTMLButtonElement>('[aria-label="Add a random player"]')!.click();
    await settleCreation();
    expect(props.selected).toEqual(['player-0', 'player-12']);
    expect(get(toast)).toBeNull();
  });

  it('checks the current selection and maximum after pending creation and prevents duplicate submissions', async () => {
    let finish!: (player: Player) => void;
    vi.mocked(addPlayer).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { props, limits } = renderCapacity(['player-0'], 3);
    await addNamed('Pending friend');
    expect(document.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
    expect(document.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
    document.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    document.querySelector<HTMLButtonElement>('[aria-label="Add a random player"]')!.click();
    flushSync(() => chips()[1].click());
    flushSync(() => limits.set('max', 2));
    const player = { ...stored[0], id: 'pending', name: 'Pending friend' };
    stored.push(player);
    finish(player);
    await settleCreation();
    expect(addPlayer).toHaveBeenCalledTimes(1);
    expect(props.selected).toEqual(['player-0', 'player-1']);
    expect(get(players).some((p) => p.id === 'pending')).toBe(true);
    expect(get(toast)?.message).toContain('Pending friend was added to Players, but not selected.');
  });

  it('retains the name, reports storage failure and permits a retry', async () => {
    vi.mocked(addPlayer).mockRejectedValueOnce(new Error('synthetic write failure'));
    const { props } = renderCapacity([], 2);
    await addNamed('Retry friend');
    await settleCreation();
    expect(get(storageError)).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>('input')?.value).toBe('Retry friend');
    expect(props.selected).toEqual([]);
    await addNamed('Retry friend');
    await settleCreation();
    expect(props.selected).toEqual(['player-12']);
  });

  it.each(['full', 'group', 'rules'] as PresetKind[])(
    'preserves %s preset order and existing over-capacity selections',
    async (kind) => {
      const selected = ['player-4', 'player-1', 'player-0'];
      savePreset('tally', `Capacity ${kind}`, selected, {}, kind);
      const { props } = renderCapacity(kind === 'rules' ? selected : [], 2);
      presetsComponent = mount(GamePresets, {
        target: document.body,
        props: {
          type: 'tally',
          fields: [],
          max: 2,
          config: {},
          get selected() {
            return props.selected;
          },
          set selected(value: string[]) {
            props.selected = value;
          },
        },
      });
      flushSync();
      flushSync(() => document.querySelector<HTMLButtonElement>('.pchip')!.click());
      await tick();
      expect(props.selected).toEqual(selected);
      expect(chips()[4].querySelector('.ord')?.textContent).toBe('1');
      expect(chips()[1].querySelector('.ord')?.textContent).toBe('2');
      expect(chips()[0].querySelector('.ord')?.textContent).toBe('3');
      expect(chips()[2].disabled).toBe(true);
      expect(get(settings).gamePresets[0].playerIds).toEqual(kind === 'rules' ? [] : selected);
    },
  );
});

function render(selected: string[] = []) {
  component = mount(PlayerSelect, { target: document.body, props: { selected, max: 12 } });
  flushSync();
  return [...document.querySelectorAll<HTMLButtonElement>('.chip')];
}

describe('player selection identities', () => {
  it('bounds chips and wraps names without truncating identity or shrinking selection ordinals', () => {
    expect(source).toMatch(/\.chip\s*\{[^}]*max-width:\s*100%/);
    expect(source).toMatch(/\.name\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere/);
    expect(source).toMatch(/\.ord\s*\{[^}]*flex:\s*none/);
    const chips = render(names.map((_, i) => `player-${i}`));
    chips.forEach((chip, i) => {
      expect(chip.querySelector('.name')?.textContent).toBe(names[i]);
      expect(chip.getAttribute('aria-pressed')).toBe('true');
      expect(chip.querySelector('.ord')?.textContent).toBe(String(i + 1));
      expect(chip.querySelector('.ord')?.getAttribute('aria-hidden')).toBe('true');
      expect(chip.querySelector('.avatar')?.getAttribute('aria-hidden')).toBe('true');
      expect(chip.hasAttribute('aria-label')).toBe(false);
      expect(chip.type).toBe('button');
      expect(chip.disabled).toBe(false);
    });
  });

  it('retains selection order when long names are deselected and selected again', () => {
    const chips = render();
    for (const index of [2, 0, 1]) flushSync(() => chips[index].click());
    expect(chips.map((chip) => chip.querySelector('.ord')?.textContent).slice(0, 3)).toEqual([
      '2',
      '3',
      '1',
    ]);
    flushSync(() => chips[2].click());
    expect(chips[2].getAttribute('aria-pressed')).toBe('false');
    expect(chips[2].querySelector('.ord')).toBeNull();
    flushSync(() => chips[2].click());
    expect(chips.map((chip) => chip.querySelector('.ord')?.textContent).slice(0, 3)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(chips[2].querySelector('.name')?.textContent).toBe(names[2]);
  });
});
