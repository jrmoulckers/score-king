import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Segmented from './Segmented.svelte';
import source from './Segmented.svelte?raw';

const mounted: ReturnType<typeof mount>[] = [];
const statuses = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'finished', label: 'Finished' },
  { value: 'abandoned', label: 'Abandoned' },
];
const longOptions = [
  { value: 'all', label: 'All synthetic game records' },
  { value: 'active', label: 'Currently active game records' },
  { value: 'finished', label: 'FinishedSyntheticGameRecordsWithoutSpaces' },
  { value: 'abandoned', label: 'Abandoned synthetic game records' },
];

function render(options = statuses, value = 'all') {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(Segmented, { target, props: { label: 'Filter by status', options, value } }));
  flushSync();
  return {
    group: target.querySelector<HTMLDivElement>('[role="radiogroup"]')!,
    buttons: [...target.querySelectorAll<HTMLButtonElement>('[role="radio"]')],
  };
}

function expectSelection(buttons: HTMLButtonElement[], selected: number) {
  expect(buttons.map((b) => b.getAttribute('aria-checked'))).toEqual(
    buttons.map((_, i) => String(i === selected)),
  );
  expect(buttons.map((b) => b.tabIndex)).toEqual(buttons.map((_, i) => (i === selected ? 0 : -1)));
}

afterEach(() => {
  for (const component of mounted.splice(0)) unmount(component);
  document.head.querySelector('#segmented-layout-styles')?.remove();
  document.body.replaceChildren();
});

describe('Segmented responsive choices', () => {
  it('wraps content-sized choices and bounds long labels without clipping or shrinking targets', () => {
    const groupRule = source.match(/\.segmented\s*\{[^}]*\}/)?.[0];
    const segmentRule = source.match(/\.seg\s*\{[^}]*\}/)?.[0];
    expect(groupRule).toBeDefined();
    expect(segmentRule).toBeDefined();
    const style = document.createElement('style');
    style.id = 'segmented-layout-styles';
    style.textContent = `${groupRule}\n${segmentRule}`;
    document.head.appendChild(style);
    const { group, buttons } = render();
    const groupStyle = getComputedStyle(group);
    const segmentStyle = getComputedStyle(buttons[0]);

    expect(groupStyle.display).toBe('flex');
    expect(groupStyle.flexWrap).toBe('wrap');
    expect(Number.parseFloat(groupStyle.minWidth)).toBe(0);
    expect(segmentStyle.flexBasis).toBe('auto');
    expect(segmentStyle.minWidth).toBe('46px');
    expect(segmentStyle.minHeight).toBe('46px');
    expect(segmentStyle.maxWidth).toBe('100%');
    expect(segmentStyle.overflowWrap).toBe('anywhere');
    expect(`${groupRule}\n${segmentRule}`).not.toMatch(
      /(?:order|white-space|text-overflow|overflow-x|overflow-y)\s*:/,
    );
  });

  it.each([
    { name: 'three statuses', options: statuses.slice(0, 3) },
    { name: 'four statuses', options: statuses },
    { name: 'three long labels', options: longOptions.slice(0, 3) },
    { name: 'four long labels', options: longOptions },
  ])(
    'preserves source order, accessible names, checked state and roving focus for $name',
    ({ options }) => {
      const { group, buttons } = render(options, 'active');
      expect(group.getAttribute('aria-label')).toBe('Filter by status');
      expect(buttons.map((b) => b.textContent?.trim())).toEqual(options.map((o) => o.label));
      expectSelection(buttons, 1);
      flushSync(() => buttons.at(-1)!.click());
      expectSelection(buttons, buttons.length - 1);
      flushSync(() => buttons[0].click());
      expectSelection(buttons, 0);
    },
  );

  it.each([3, 4])('keeps Arrow/Home/End selection and focus in DOM order for %i choices', (count) => {
    const { buttons } = render(statuses.slice(0, count));
    buttons[0].focus();
    const steps: [string, number][] = [
      ['ArrowRight', 1],
      ['ArrowDown', 2],
      ['End', count - 1],
      ['ArrowRight', 0],
      ['ArrowLeft', count - 1],
      ['Home', 0],
      ['ArrowUp', count - 1],
    ];
    for (const [key, index] of steps) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      flushSync(() => document.activeElement?.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(buttons[index]);
      expectSelection(buttons, index);
    }
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    buttons.at(-1)!.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expectSelection(buttons, count - 1);
  });
});
