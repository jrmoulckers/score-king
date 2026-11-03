import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConfigField, GameModule } from '../types';
import { defaultConfig } from '../types';
import { hearts } from '../games/hearts';
import { findingFriends } from '../games/findingfriends';
import { chickenfoot } from '../games/chickenfoot';
import { golf } from '../games/golf';
import { mariokart } from '../games/mariokart';
import { presidents } from '../games/presidents';
import { uno } from '../games/uno';
import { unogolf } from '../games/unogolf';
import ConfigFormTest from './ConfigFormTest.svelte';

const mounted: ReturnType<typeof mount>[] = [];

function render(fields: ConfigField[], config = defaultConfig(fields)) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(ConfigFormTest, { target, props: { fields, initial: config } }));
  flushSync();
  return target;
}

function rules(target: HTMLElement, key: string) {
  const control = target.querySelector(`#${key}`);
  const description = document.getElementById(control?.getAttribute('aria-describedby') ?? '');
  expect(description).not.toBeNull();
  expect(description?.querySelector('ul')?.getAttribute('aria-label')).toBe(
    `${target.querySelector(`label[for="${key}"]`)?.textContent} rules`,
  );
  return [...description!.querySelectorAll('li > span:last-child')].map((el) => el.textContent);
}

function change(target: HTMLElement, key: string, value: string) {
  const select = target.querySelector<HTMLSelectElement>(`#${key}`)!;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('configuration rules summaries', () => {
  it('describes the default Hearts deck and reacts to selection changes in both directions', () => {
    const target = render(hearts.configFields!);
    expect(rules(target, 'deckCount')).toEqual(['13 hearts', '1 Queen', '26-point moon']);
    expect(target.textContent).not.toContain('Double deck uses');
    change(target, 'deckCount', '2');
    expect(rules(target, 'deckCount')).toEqual(['26 hearts', '2 Queens', '52-point moon']);
    change(target, 'deckCount', '1');
    expect(rules(target, 'deckCount')).toEqual(['13 hearts', '1 Queen', '26-point moon']);
  });

  it('uses the same Hearts normalization as scoring for numeric saved configurations', () => {
    const target = render(hearts.configFields!, { deckCount: 2 });
    expect(rules(target, 'deckCount')).toEqual(['26 hearts', '2 Queens', '52-point moon']);
  });

  it('keeps static instructions and associates them with controls', () => {
    const target = render([
      { key: 'count', label: 'Count', type: 'number', default: 3, help: 'Keep this instruction.' },
      { key: 'toggle', label: 'Toggle', type: 'boolean', default: false, help: 'Toggle help.' },
      { key: 'plain', label: 'Plain', type: 'number', default: 1 },
    ]);
    const count = target.querySelector('#count')!;
    expect(document.getElementById(count.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Keep this instruction.',
    );
    const toggle = target.querySelector('input[type="checkbox"]')!;
    expect(document.getElementById(toggle.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Toggle help.',
    );
    expect(target.querySelector('#plain')?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('gives multiple form instances distinct description IDs', () => {
    const first = render(hearts.configFields!);
    const second = render(hearts.configFields!, { deckCount: '2' });
    expect(first.querySelector('#deckCount')?.getAttribute('aria-describedby')).not.toBe(
      second.querySelector('#deckCount')?.getAttribute('aria-describedby'),
    );
  });

  const cases: [GameModule, string, string, string[]][] = [
    [
      findingFriends,
      'deckCount',
      '2',
      ['200-point pool', '5s = 5 points', '10s & Kings = 10 points'],
    ],
    [
      findingFriends,
      'deckCount',
      '3',
      ['300-point pool', '5s = 5 points', '10s & Kings = 10 points'],
    ],
    [
      findingFriends,
      'deckCount',
      '4',
      ['400-point pool', '5s = 5 points', '10s & Kings = 10 points'],
    ],
    [
      chickenfoot,
      'startDouble',
      '6',
      ['7 rounds', 'Double-6 to double-blank', 'Lowest total wins'],
    ],
    [
      chickenfoot,
      'startDouble',
      '9',
      ['10 rounds', 'Double-9 to double-blank', 'Lowest total wins'],
    ],
    [
      chickenfoot,
      'startDouble',
      '12',
      ['13 rounds', 'Double-12 to double-blank', 'Lowest total wins'],
    ],
    [golf, 'grid', '4', ['4 cards per hole', 'Equal cards in a column cancel']],
    [golf, 'grid', '6', ['6 cards per hole', 'Equal cards in a column cancel']],
    [golf, 'grid', '9', ['9 cards per hole', 'Equal cards in a column cancel']],
    [golf, 'kingValue', '0', ['King = 0 points']],
    [golf, 'kingValue', '-2', ['King = -2 points']],
    [
      mariokart,
      'pointsTable',
      'modern12',
      ['15 / 12 / 10 / 9 / 8 / 7 / 6 / 5 / 4 / 3 / 2 / 1 points by place', 'After 12th = 0 points'],
    ],
    [
      mariokart,
      'pointsTable',
      'classic8',
      ['15 / 12 / 10 / 9 / 8 / 7 / 6 / 5 points by place', 'After 8th = 0 points'],
    ],
    [mariokart, 'pointsTable', 'retro4', ['9 / 6 / 3 / 1 points by place', 'After 4th = 0 points']],
    [mariokart, 'pointsTable', 'party', ['1st = 12 points', 'Each place down = 1 less']],
    [
      presidents,
      'scheme',
      'rankPoints',
      ['1st = player count minus 1', 'Each place down = 1 less', 'Last = 0'],
    ],
    [
      presidents,
      'scheme',
      'tieredTitles',
      ['President = 3', 'Vice President = 1', 'Citizen = 0', 'Vice Scum = -1', 'Scum = -3'],
    ],
    [presidents, 'scheme', 'winsOnly', ['President = 1 point', 'Everyone else = 0']],
    [uno, 'mode', 'winner', ['Winner scores opponents’ leftover cards', 'Highest total wins']],
    [uno, 'mode', 'golf', ['Count your own leftover cards', 'Lowest total wins']],
    [unogolf, 'format', 'holes', ['9 holes', 'Lowest total wins']],
    [unogolf, 'format', 'target', ['End when anyone reaches 100 points', 'Lowest total wins']],
  ];

  it.each(cases)('renders selected rules for %s %s = %s', (module, key, value, expected) => {
    const target = render(module.configFields!);
    change(target, key, value);
    expect(rules(target, key)).toEqual(expected);
  });

  it('reacts to numeric controls that change a selected variant summary', () => {
    const target = render(mariokart.configFields!);
    change(target, 'pointsTable', 'party');
    const racers = target.querySelector<HTMLInputElement>('#racers')!;
    racers.value = '8';
    racers.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(rules(target, 'pointsTable')).toEqual(['1st = 8 points', 'Each place down = 1 less']);
  });

  it('pluralizes a single Uno Golf hole correctly', () => {
    const target = render(unogolf.configFields!, { format: 'holes', holes: 1 });
    expect(rules(target, 'format')).toEqual(['1 hole', 'Lowest total wins']);
  });
});
