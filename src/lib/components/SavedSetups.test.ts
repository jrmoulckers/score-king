import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Player, PresetKind } from '../types';
import GameType from '../../pages/GameType.svelte';
import { settings } from '../stores/settings';
import { savePreset } from '../stores/presets';
import { playerRosterReady, players, refreshPlayers } from '../stores/players';
import { restoreSnapshot } from '../storage/sync';
import { dismissToast, toast } from '../stores/toast';

const db = vi.hoisted(() => ({
  readPlayers: vi.fn<() => Promise<Player[]>>().mockResolvedValue([]),
  replaceAll: vi.fn(),
}));
vi.mock('../storage/db', () => ({
  getAllPlayers: db.readPlayers,
  getAllGames: vi.fn().mockResolvedValue([]),
  getAllGameDefs: vi.fn().mockResolvedValue([]),
  replaceAll: db.replaceAll,
}));

const roster: Player[] = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Player ${i + 1}`,
  color: '#7c5cff',
  createdAt: 1,
}));
const ids = roster.map((p) => p.id);
const mounted: ReturnType<typeof mount>[] = [];

function render(type = 'hearts') {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(GameType, { target, props: { type } }));
  flushSync();
  return target;
}

function button(target: HTMLElement, label: string): HTMLButtonElement {
  const found = [...target.querySelectorAll('button')].find(
    (el) => el.textContent?.trim() === label,
  );
  expect(found, label).toBeDefined();
  return found!;
}

function useSaved(target: HTMLElement, name: string) {
  const chip = [...target.querySelectorAll('.pchip')].find(
    (el) => el.querySelector('.pname')?.textContent === name,
  );
  expect(chip, name).toBeDefined();
  (chip as HTMLButtonElement).click();
  flushSync();
}

function selected(target: HTMLElement) {
  return [...target.querySelectorAll('.chip.on')]
    .map((chip) => ({
      name: chip.textContent?.match(/Player \d+/)?.[0],
      order: Number(chip.querySelector('.ord')?.textContent),
    }))
    .sort((a, b) => a.order - b.order)
    .map((p) => p.name);
}

function change(target: HTMLElement, selector: string, value: string) {
  const input = target.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
  expect(input, selector).not.toBeNull();
  input!.value = value;
  input!.dispatchEvent(
    new Event(input!.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }),
  );
  flushSync();
}

beforeEach(async () => {
  settings.update((s) => ({ ...s, gamePresets: [] }));
  db.readPlayers.mockReset().mockResolvedValue(roster);
  db.replaceAll.mockReset().mockResolvedValue(undefined);
  await refreshPlayers();
});

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  dismissToast();
  settings.update((s) => ({ ...s, gamePresets: [] }));
  document.body.replaceChildren();
});

describe('saved setup interaction', () => {
  it.each(['rules', 'full'] as PresetKind[])(
    'updates Hearts rules summaries when a saved %s preset replaces the draft',
    (kind) => {
      const preset = savePreset(
        'hearts',
        'Double deck rules',
        ['p1', 'p2', 'p3'],
        { deckCount: '2' },
        kind,
      );
      const target = render();
      const summary = () =>
        [...target.querySelectorAll('.rules-summary li > span:last-child')].map(
          (el) => el.textContent,
        );
      expect(summary()).toEqual(['13 hearts', '1 Queen', '26-point moon']);
      useSaved(target, preset.name);
      expect(target.querySelector<HTMLSelectElement>('#deckCount')?.value).toBe('2');
      expect(summary()).toEqual(['26 hearts', '2 Queens', '52-point moon']);
      change(target, '#deckCount', '1');
      expect(summary()).toEqual(['13 hearts', '1 Queen', '26-point moon']);
      expect(get(settings).gamePresets[0].config.deckCount).toBe('2');
    },
  );

  it('applies cross-game groups and game-specific rules independently, including toggling off', () => {
    savePreset('avalon', 'Cross game', ['p3', 'p1', 'p2'], {}, 'group');
    savePreset('hearts', 'Two decks', [], { deckCount: '2', endScore: 200 }, 'rules');
    savePreset('avalon', 'Other game rules', [], {}, 'rules');
    const target = render();
    expect(target.textContent).not.toContain('Other game rules');
    useSaved(target, 'Two decks');
    expect(selected(target)).toEqual([]);
    expect(target.querySelector('.applied')?.textContent?.trim()).toBe('Using: Two decks');
    useSaved(target, 'Cross game');
    expect(selected(target)).toEqual(['Player 3', 'Player 1', 'Player 2']);
    expect(target.querySelector<HTMLSelectElement>('#deckCount')?.value).toBe('2');
    useSaved(target, 'Two decks');
    expect(selected(target)).toEqual(['Player 3', 'Player 1', 'Player 2']);
    useSaved(target, 'Two decks');
    expect(selected(target)).toEqual(['Player 3', 'Player 1', 'Player 2']);
    expect(target.querySelector<HTMLSelectElement>('#deckCount')?.value).toBe('1');
  });

  it('applies legacy full setups to both halves without silently capping available players', () => {
    const p = savePreset('hearts', 'Legacy eight', ids, { deckCount: '1' });
    settings.update((s) => ({
      ...s,
      gamePresets: s.gamePresets.map(({ kind: _kind, ...record }) => {
        void _kind;
        return record;
      }),
    }));
    const target = render();
    useSaved(target, p.name);
    expect(selected(target)).toHaveLength(8);
    expect(button(target, 'Start game').disabled).toBe(true);
    expect(target.textContent).toContain('No players were removed automatically.');
    change(target, '#deckCount', '2');
    expect(selected(target)).toHaveLength(8);
    expect(button(target, 'Start game').disabled).toBe(false);
    expect(get(settings).gamePresets[0].playerIds).toEqual(ids);
  });

  it('preserves oversized groups on apply and when rules reduce a dynamic limit', () => {
    const group = savePreset('tally', 'Eight players', ids, {}, 'group');
    savePreset('hearts', 'Single deck', [], { deckCount: '1' }, 'rules');
    const target = render();
    change(target, '#deckCount', '2');
    useSaved(target, group.name);
    expect(button(target, 'Start game').disabled).toBe(false);
    useSaved(target, 'Single deck');
    expect(selected(target)).toHaveLength(8);
    expect(button(target, 'Start game').disabled).toBe(true);
    expect(get(settings).gamePresets.find((p) => p.id === group.id)?.playerIds).toEqual(ids);
    const chips = target.querySelectorAll<HTMLButtonElement>('.chip.on');
    chips[0].click();
    chips[1].click();
    flushSync();
    expect(selected(target)).toHaveLength(6);
    expect(button(target, 'Start game').disabled).toBe(false);
  });

  it.each(['group', 'rules', 'full'] as PresetKind[])(
    'saves, renames, and delete/undo manages %s',
    (kind) => {
      const target = render();
      target.querySelectorAll<HTMLButtonElement>('.chip')[0].click();
      flushSync();
      button(target, '＋ Save preset').click();
      flushSync();
      change(target, '.presets select', kind);
      change(target, '[aria-label="Preset name"]', `Saved ${kind}`);
      button(target, 'Save').click();
      flushSync();
      let record = get(settings).gamePresets[0];
      expect(record.kind).toBe(kind);
      expect(record.playerIds).toEqual(kind === 'rules' ? [] : ['p1']);
      expect(record.config).toEqual(
        kind === 'group' ? {} : expect.objectContaining({ deckCount: '1' }),
      );
      if (kind === 'group') {
        change(target, '#endScore', '150');
        expect(
          [...target.querySelectorAll('button')].some((el) => el.textContent === 'Update'),
        ).toBe(false);
        target.querySelectorAll<HTMLButtonElement>('.chip')[1].click();
        flushSync();
      } else {
        change(target, '#endScore', '150');
      }
      button(target, 'Update').click();
      flushSync();
      record = get(settings).gamePresets[0];
      expect(record.config).toEqual(
        kind === 'group' ? {} : expect.objectContaining({ endScore: 150 }),
      );
      expect(record.playerIds).toEqual(
        kind === 'rules' ? [] : kind === 'group' ? ['p1', 'p2'] : ['p1'],
      );
      button(target, 'Rename').click();
      flushSync();
      change(target, '[aria-label="Rename preset"]', 'Renamed');
      button(target, 'Rename').click();
      flushSync();
      record = get(settings).gamePresets[0];
      expect(record.name).toBe('Renamed');
      button(target, 'Delete').click();
      flushSync();
      expect(get(settings).gamePresets).toEqual([]);
      get(toast)?.action?.run();
      flushSync();
      expect(get(settings).gamePresets).toEqual([record]);
    },
  );

  it('allows rules without players, but requires players for a new group or full setup', () => {
    const target = render();
    button(target, '＋ Save preset').click();
    flushSync();
    change(target, '[aria-label="Preset name"]', 'Rules only');
    expect(button(target, 'Save').disabled).toBe(true);
    change(target, '.presets select', 'rules');
    expect(button(target, 'Save').disabled).toBe(false);
    button(target, 'Save').click();
    flushSync();
    expect(get(settings).gamePresets[0].kind).toBe('rules');
  });
});

describe('lazy group cleanup readiness', () => {
  it('persists pruning only after an authoritative roster load, never during an empty load', async () => {
    const p = savePreset(
      'tally',
      'Old group',
      ['p2', 'archived', 'deleted', 'missing', 'p1'],
      {},
      'group',
    );
    let finish!: (value: Player[]) => void;
    db.readPlayers.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const loading = refreshPlayers();
    players.set([]);
    const target = render();
    expect(get(playerRosterReady)).toBe(false);
    expect(get(settings).gamePresets[0].playerIds).toEqual(p.playerIds);
    finish([
      ...roster,
      { ...roster[0], id: 'archived', archived: true },
      { ...roster[0], id: 'deleted', deleted: 123 },
    ]);
    await loading;
    flushSync();
    expect(get(settings).gamePresets[0].playerIds).toEqual(['p2', 'p1']);
    expect(target.textContent).toContain('Removed 3 unavailable players');
    expect(JSON.parse(localStorage.getItem('sk_settings')!).gamePresets[0].playerIds).toEqual([
      'p2',
      'p1',
    ]);
  });

  it('retains membership and visibly blocks apply after a failed roster read', async () => {
    const p = savePreset('tally', 'Keep', ids, {}, 'group');
    db.readPlayers.mockRejectedValueOnce(new Error('read failed'));
    await refreshPlayers();
    const target = render();
    expect(get(settings).gamePresets[0].playerIds).toEqual(p.playerIds);
    expect(target.querySelector<HTMLButtonElement>('.pchip')?.disabled).toBe(true);
    expect(target.textContent).toContain('Player Groups stay unchanged');
  });

  it('holds cleanup across restore and ignores an older roster response', async () => {
    savePreset('tally', 'Restored group', ['p1', 'p2'], {}, 'group');
    const target = render();
    const saved = get(settings).gamePresets;
    let oldRead!: (value: Player[]) => void;
    db.readPlayers.mockReturnValueOnce(
      new Promise((resolve) => {
        oldRead = resolve;
      }),
    );
    const stale = refreshPlayers();
    let finishReplace!: () => void;
    db.replaceAll.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishReplace = resolve;
      }),
    );
    const restoring = restoreSnapshot({
      players: roster,
      games: [],
      rounds: [],
      exportedAt: 1,
      settings: { gamePresets: saved },
    });
    oldRead([]);
    await stale;
    flushSync();
    expect(get(playerRosterReady)).toBe(false);
    expect(get(settings).gamePresets).toEqual(saved);
    finishReplace();
    await restoring;
    flushSync();
    expect(get(playerRosterReady)).toBe(true);
    expect(get(settings).gamePresets[0].playerIds).toEqual(['p1', 'p2']);
    useSaved(target, 'Restored group');
    expect(selected(target)).toEqual(['Player 1', 'Player 2']);
  });
});
