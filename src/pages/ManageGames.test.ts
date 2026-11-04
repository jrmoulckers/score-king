import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import { blankDef } from '../lib/games/custom/types';
import { customGameDefs } from '../lib/stores/customGames';
import { settings } from '../lib/stores/settings';
import ManageGames from './ManageGames.svelte';
import source from './ManageGames.svelte?raw';

const initialSettings = get(settings);
const mounted: ReturnType<typeof mount>[] = [];

afterEach(() => {
  for (const component of mounted.splice(0)) unmount(component);
  customGameDefs.set([]);
  settings.set(initialSettings);
  document.head.querySelector('#manage-games-layout')?.remove();
  document.body.replaceChildren();
});

describe('Manage games row containment', () => {
  it('wraps constrained rows and action groups without truncating names or shrinking targets', () => {
    const style = document.createElement('style');
    style.id = 'manage-games-layout';
    style.textContent = ['mrow', 'info', 'name', 'actions', 'starbtn']
      .map((name) => source.match(new RegExp(`\\.${name}\\s*\\{[^}]*\\}`))?.[0])
      .join('\n');
    document.head.appendChild(style);
    for (const name of ['mrow', 'info', 'name', 'actions', 'starbtn']) {
      const element = document.createElement('span');
      element.className = name;
      document.body.appendChild(element);
    }
    const computed = (name: string) => getComputedStyle(document.querySelector(`.${name}`)!);
    expect(computed('mrow').flexWrap).toBe('wrap');
    expect(computed('info').flexGrow).toBe('1');
    expect(computed('info').flexBasis).toBe('18rem');
    expect(computed('info').maxWidth).toBe('100%');
    expect(computed('name').overflowWrap).toBe('anywhere');
    expect(computed('name').textOverflow).not.toBe('ellipsis');
    expect(computed('actions').flexWrap).toBe('wrap');
    expect(computed('actions').maxWidth).toBe('100%');
    expect(computed('actions').marginLeft).toBe('auto');
    expect(computed('starbtn').width).toBe('46px');
    expect(computed('starbtn').height).toBe('46px');
  });

  it('preserves full built-in/custom/hidden/retired identities and their actual controls', () => {
    const custom = { ...blankDef(), name: 'Friday tournament scorer' };
    const hidden = { ...blankDef(), name: 'HiddenSyntheticGameTitle' };
    const retired = { ...blankDef(), name: 'Retired tournament game', archived: true };
    customGameDefs.set([custom, hidden, retired]);
    settings.set({ ...initialSettings, catalogHidden: [hidden.id], catalogFavorites: [] });
    const target = document.createElement('div');
    document.body.appendChild(target);
    mounted.push(mount(ManageGames, { target }));
    flushSync();
    const rows = [...target.querySelectorAll('.mrow')];
    const row = (name: string) => rows.find((e) => e.querySelector('.name')?.textContent === name)!;
    const actions = (name: string) =>
      [...row(name).querySelectorAll('button,a')].map((e) =>
        (e.querySelector('.sr-only') ?? e).textContent?.trim(),
      );

    expect(rows.length).toBeGreaterThan(3);
    expect(actions(custom.name)).toEqual(['Edit', 'Duplicate', `Favorite ${custom.name}`, 'Hide']);
    expect(row(custom.name).querySelector('a')?.getAttribute('href')).toBe(`/create/${custom.id}`);
    expect(row(custom.name).querySelector('.starbtn')?.getAttribute('aria-pressed')).toBe('false');
    expect(actions(hidden.name)).toEqual(['Show']);
    expect(actions(retired.name)).toEqual(['Restore']);
    expect(target.querySelectorAll('.name').length).toBe(rows.length);

    const search = target.querySelector<HTMLInputElement>('.search')!;
    flushSync(() => {
      search.value = custom.name;
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(target.querySelectorAll('.mrow')).toHaveLength(1);
    expect(target.querySelector('.name')?.textContent).toBe(custom.name);
    expect(get(customGameDefs).map((d) => d.name)).toEqual([custom.name, hidden.name, retired.name]);
  });
});
