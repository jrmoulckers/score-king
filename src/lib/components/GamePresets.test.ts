import { mount, unmount } from 'svelte';
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

describe('GamePresets helper', () => {
  it.each(['hearts', 'skull-king', 'tally'])(
    'explains saving players and rules without promising to start %s',
    (type) => {
      const target = renderPresets(type);

      expect(target.querySelector('.empty-hint')?.textContent).toBe(
        'Save these players and rules for your next game.',
      );
      expect(target.querySelector('.linkbtn')?.textContent).toContain('Save current setup');
    },
  );

  it('only shows the helper when the current game has no presets', () => {
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
    expect(tally.querySelector('.empty-hint')?.textContent).toBe(
      'Save these players and rules for your next game.',
    );
  });
});
