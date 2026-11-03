import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { settings } from '../stores/settings';
import GamePresets from './GamePresets.svelte';

const mounted: ReturnType<typeof mount>[] = [];

function renderPresets(type: string) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(
    mount(GamePresets, { target, props: { type, selected: [], config: {}, fields: [] } }),
  );
  return target;
}

afterEach(() => {
  for (const component of mounted.splice(0)) unmount(component);
  settings.update((value) => ({ ...value, gamePresets: [] }));
  document.body.replaceChildren();
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
