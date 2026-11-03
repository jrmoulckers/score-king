import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { RoundContext } from '../../types';
import { defaultConfig } from '../../types';
import ConfigForm from '../../components/ConfigForm.svelte';
import HeartsEditor from './HeartsEditor.svelte';
import { hearts } from './index';
import { emptyInput } from './logic';

const mounted: ReturnType<typeof mount>[] = [];

function target() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function form(config = defaultConfig(hearts.configFields)) {
  const el = target();
  mounted.push(
    mount(ConfigForm, {
      target: el,
      props: { fields: hearts.configFields!, config },
    }),
  );
  flushSync();
  return el;
}

function editor(config: Record<string, unknown>, roundIndex = 0) {
  const el = target();
  const ids = ['a', 'b', 'c', 'd'];
  const ctx: RoundContext = {
    game: {
      id: 'synthetic',
      type: 'hearts',
      playerIds: ids,
      config,
      status: 'active',
      roundCount: roundIndex,
      createdAt: 1,
    },
    players: ids.map((id) => ({ id, name: id, color: '#7c5cff', createdAt: 1 })),
    config,
    roundIndex,
    totals: {},
    rounds: [],
  };
  mounted.push(
    mount(HeartsEditor, {
      target: el,
      props: { ctx, input: emptyInput(ids) },
    }),
  );
  flushSync();
  return el;
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('Card Passing interface', () => {
  it('groups direction and card count without a reminder checkbox', () => {
    const el = form();
    const section = [...el.querySelectorAll('fieldset')].find(
      (node) => node.querySelector('legend')?.textContent === 'Card Passing',
    );
    expect(section).toBeDefined();
    const select = section!.querySelector<HTMLSelectElement>('#passMode')!;
    expect(select.value).toBe('clockwise');
    expect([...select.options].map((option) => option.value)).toEqual([
      'clockwise',
      'counterclockwise',
      'rotating',
    ]);
    expect(section!.querySelector('#passCardCount')).not.toBeNull();
    expect(el.textContent).not.toContain('Show the passing direction each hand');
  });

  it('explains a legacy hidden reminder without treating it as no passing', () => {
    const el = form({ ...defaultConfig(hearts.configFields), passMode: 'legacy-hidden' });
    const select = el.querySelector<HTMLSelectElement>('#passMode')!;
    expect(select.selectedOptions[0].textContent).toContain('reminder hidden');
    expect(el.textContent).not.toContain('No passing');
    expect(el.querySelector('#passCardCount')).not.toBeNull();
  });

  it('shows fixed directions on later hands despite an old hidden flag', () => {
    expect(
      editor({ passMode: 'clockwise', passing: false, passCardCount: 2 }, 3).querySelector('.pass')
        ?.textContent,
    ).toContain('Pass clockwise (left)');
    expect(
      editor({ passMode: 'counterclockwise', passCardCount: 1 }, 3).querySelector('.pass')
        ?.textContent,
    ).toContain('Pass counterclockwise (right)');
  });

  it('shows conventional rotating directions and hold in reopened hand indices', () => {
    expect(editor({ passMode: 'rotating' }, 1).querySelector('.pass')?.textContent).toContain(
      'Pass right',
    );
    expect(editor({ passMode: 'rotating' }, 3).querySelector('.pass')?.textContent).toContain(
      'Hold',
    );
  });

  it('retains original saved-game reminders and the legacy hidden exception', () => {
    expect(editor({}, 1).querySelector('.pass')?.textContent).toContain('Pass across');
    expect(editor({ passing: false }, 1).querySelector('.pass')).toBeNull();
    expect(editor({ passMode: 'legacy-hidden' }, 1).querySelector('.pass')).toBeNull();
  });
});
