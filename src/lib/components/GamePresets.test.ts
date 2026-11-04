import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresetKind } from '../types';
import { settings } from '../stores/settings';
import { refreshPlayers } from '../stores/players';
import { removePreset, savePreset } from '../stores/presets';
import { dismissToast } from '../stores/toast';
import GamePresets from './GamePresets.svelte';

vi.mock('../storage/db', () => ({
  getAllPlayers: vi.fn().mockResolvedValue([
    { id: 'focus-player', name: 'Focus Player', color: '#7c5cff', createdAt: 1 },
  ]),
}));
vi.mock('../motion', () => ({ pop: vi.fn() }));

const mounted: ReturnType<typeof mount>[] = [];

function renderPresets(type: string, selected: string[] = [], config = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(GamePresets, { target, props: { type, selected, config, fields: [] } }));
  return target;
}

beforeEach(async () => {
  await refreshPlayers();
});

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  dismissToast();
  settings.update((value) => ({ ...value, gamePresets: [] }));
  document.body.replaceChildren();
});

function button(target: HTMLElement, label: string) {
  const found = [...target.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === label,
  );
  expect(found, label).toBeDefined();
  return found!;
}

async function activate(control: HTMLButtonElement) {
  control.focus();
  control.click();
  flushSync();
  await tick();
}

function name(target: HTMLElement, value: string) {
  const input = target.querySelector<HTMLInputElement>('input')!;
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

async function submit(target: HTMLElement) {
  const form = target.querySelector('form')!;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  flushSync();
  await tick();
}

describe('GamePresets focus recovery', () => {
  it.each(['full', 'rules', 'group'] as PresetKind[])(
    'focuses a newly saved %s chip without changing the draft or saved snapshot',
    async (kind) => {
      const selected = ['focus-player'];
      const config = { endScore: 175 };
      const target = renderPresets('hearts', selected, config);
      await activate(button(target, '＋ Save preset'));
      const select = target.querySelector('select')!;
      select.value = kind;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      name(target, `Focus ${kind}`);
      await submit(target);
      const chip = target.querySelector<HTMLButtonElement>('.pchip')!;
      expect(document.activeElement).toBe(chip);
      expect(chip.getAttribute('aria-pressed')).toBe('true');
      expect(get(settings).gamePresets[0]).toMatchObject({
        name: `Focus ${kind}`,
        kind,
        playerIds: kind === 'rules' ? [] : selected,
        config: kind === 'group' ? {} : config,
      });
      expect(selected).toEqual(['focus-player']);
      expect(config).toEqual({ endScore: 175 });
      await activate(button(target, 'Save new'));
      name(target, 'Still the same draft');
      await submit(target);
      expect(get(settings).gamePresets[1]).toMatchObject({
        playerIds: selected,
        config,
      });
      expect(document.activeElement?.textContent).toContain('Still the same draft');
    },
  );

  it('returns Save Cancel to its replaced idle or active opener', async () => {
    const target = renderPresets('hearts', ['focus-player'], { endScore: 175 });
    const opener = button(target, '＋ Save preset');
    await activate(opener);
    name(target, 'Discarded');
    await activate(button(target, 'Cancel'));
    expect(opener.isConnected).toBe(false);
    expect(document.activeElement).toBe(button(target, '＋ Save preset'));
    expect(get(settings).gamePresets).toEqual([]);
    await activate(button(target, '＋ Save preset'));
    name(target, 'Kept');
    await submit(target);
    await activate(button(target, 'Save new'));
    name(target, 'Discarded new');
    await activate(button(target, 'Cancel'));
    expect(document.activeElement).toBe(button(target, 'Save new'));
    expect(get(settings).gamePresets.map((preset) => preset.name)).toEqual(['Kept']);
  });

  it('returns rename Cancel to Rename and rename Save to the renamed chip', async () => {
    const original = savePreset('hearts', 'Original', ['focus-player'], { endScore: 175 });
    const target = renderPresets('hearts');
    await activate(target.querySelector<HTMLButtonElement>('.pchip')!);
    await activate(button(target, 'Rename'));
    name(target, 'Discarded');
    await activate(button(target, 'Cancel'));
    expect(document.activeElement).toBe(button(target, 'Rename'));
    expect(get(settings).gamePresets[0]).toEqual(original);
    await activate(button(target, 'Rename'));
    name(target, 'Renamed');
    await submit(target);
    expect(document.activeElement).toBe(target.querySelector('.pchip'));
    expect(get(settings).gamePresets[0]).toMatchObject({
      ...original,
      name: 'Renamed',
      updatedAt: expect.any(Number),
    });
  });

  it('uses Save preset when the active preset and logical opener disappear', async () => {
    const preset = savePreset('hearts', 'Removed', ['focus-player'], {});
    const target = renderPresets('hearts');
    await activate(target.querySelector<HTMLButtonElement>('.pchip')!);
    await activate(button(target, 'Save new'));
    removePreset(preset.id);
    flushSync();
    await activate(button(target, 'Cancel'));
    expect(document.activeElement).toBe(button(target, '＋ Save preset'));
  });

  it('focuses Save preset after Delete without changing other presets', async () => {
    savePreset('hearts', 'Survivor', ['focus-player'], {});
    const removed = savePreset('hearts', 'Delete me', ['focus-player'], { endScore: 175 });
    const target = renderPresets('hearts');
    await activate(target.querySelector<HTMLButtonElement>(`[data-preset-id="${removed.id}"]`)!);
    await activate(button(target, 'Delete'));
    expect(document.activeElement).toBe(button(target, '＋ Save preset'));
    expect(get(settings).gamePresets.map((preset) => preset.name)).toEqual(['Survivor']);
  });
});

describe('GamePresets presentation', () => {
  it.each(['hearts', 'skull-king', 'tally'])(
    'shows concise preset copy and exactly three icon-labelled save kinds for %s',
    (type) => {
      const target = renderPresets(type);

      expect(target.querySelector('.fieldlabel')?.textContent).toBe('Presets');
      expect(target.querySelector('.empty-hint')).toBeNull();
      expect(target.textContent).not.toContain('Save these players and rules');
      expect(target.textContent).not.toContain('Save players as a Group');
      expect(target.querySelector('.linkbtn')?.textContent).toContain('Save preset');
      target.querySelector<HTMLButtonElement>('.linkbtn')!.click();
      flushSync();
      const options = [...target.querySelectorAll('option')];
      expect(options.map((option) => option.value)).toEqual(['group', 'rules', 'full']);
      expect(options.map((option) => option.textContent)).toEqual([
        '👥 Player Group',
        '⚙️ Rules Preset',
        '👥 ⚙️ Game Preset',
      ]);
      expect(options.map((option) => option.getAttribute('aria-label'))).toEqual([
        'Player Group',
        'Rules Preset',
        'Game Preset',
      ]);
      expect(target.querySelector('[aria-label="Preset name"]')).not.toBeNull();
    },
  );

  it('keeps legacy presets visible only in their game without explanatory blocks', () => {
    settings.update((value) => ({
      ...value,
      gamePresets: [
        {
          id: 'usual-hearts',
          type: 'hearts',
          name: 'Usual Hearts',
          playerIds: [],
          config: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }));

    const hearts = renderPresets('hearts');
    const tally = renderPresets('tally');

    expect(hearts.querySelector('.empty-hint')).toBeNull();
    expect(hearts.querySelector('.pname')?.textContent).toBe('Usual Hearts');
    expect(hearts.querySelector('.kind-label')?.textContent).toContain('Game Preset');
    expect(tally.querySelector('.empty-hint')).toBeNull();
    expect(tally.querySelector('.pname')).toBeNull();
  });
});
