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
  it('wraps content-sized choices and bounds long labels without shrinking targets', () => {
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
      /(?:^|[;{])\s*(?:order|white-space|text-overflow|overflow-x|overflow-y)\s*:/,
    );
  });

  it.each([
    { name: 'three statuses', options: statuses.slice(0, 3) },
    { name: 'four statuses', options: statuses },
    { name: 'three long labels', options: longOptions.slice(0, 3) },
    { name: 'four long labels', options: longOptions },
  ])('preserves radio identity and state for $name', ({ options }) => {
    const { group, buttons } = render(options, 'active');
    expect(group.getAttribute('aria-label')).toBe('Filter by status');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(options.map((o) => o.label));
    expectSelection(buttons, 1);
    flushSync(() => buttons.at(-1)!.click());
    expectSelection(buttons, buttons.length - 1);
    flushSync(() => buttons[0].click());
    expectSelection(buttons, 0);
  });

  it.each([3, 4])('keeps Arrow/Home/End selection and focus for %i choices', (count) => {
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

describe('Segmented forced-colors selection', () => {
  it('keeps a non-color selection cue after focus leaves and follows the checked option', () => {
    const style = document.createElement('style');
    style.id = 'segmented-layout-styles';
    style.textContent = source.match(/<style>([\s\S]*)<\/style>/)![1];
    document.head.appendChild(style);
    const media = [...style.sheet!.cssRules].find(
      (rule): rule is CSSMediaRule =>
        rule instanceof CSSMediaRule && rule.conditionText === '(forced-colors: active)',
    );
    expect(media).toBeDefined();
    const forcedRules = [...media!.cssRules].map((rule) => rule.cssText).join('\n');
    expect(forcedRules).not.toMatch(/forced-color-adjust|box-shadow|background|border|padding/);

    // jsdom does not emulate forced colors; apply its rules explicitly for state assertions.
    style.textContent += `\n${forcedRules}`;
    const { buttons } = render();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    buttons[0].focus();
    outside.focus();
    expectSelection(buttons, 0);
    expect(document.activeElement).toBe(outside);
    expect(getComputedStyle(buttons[0]).textDecorationLine).toBe('underline');
    expect(getComputedStyle(buttons[0]).textDecorationThickness).toBe('3px');
    expect(getComputedStyle(buttons[0]).textUnderlineOffset).toBe('4px');
    expect(getComputedStyle(buttons[0]).textDecorationColor.toLowerCase()).toBe('canvastext');
    expect(getComputedStyle(buttons[1]).textDecorationLine).not.toBe('underline');

    flushSync(() => buttons[2].click());
    outside.focus();
    expectSelection(buttons, 2);
    expect(getComputedStyle(buttons[0]).textDecorationLine).not.toBe('underline');
    expect(getComputedStyle(buttons[2]).textDecorationLine).toBe('underline');
    expect(getComputedStyle(buttons[2]).outlineStyle).not.toBe('solid');
    expect(forcedRules).toMatch(/\.seg:focus-visible\s*\{\s*outline-color:\s*Highlight;/);
  });

  it('confines the selected underline to forced colors and leaves the normal palette intact', () => {
    const selectedRule = source.match(/\.seg\.on\s*\{[^}]*\}/)![0];
    expect(selectedRule).toContain('background: var(--primary)');
    expect(selectedRule).toContain('color: #fff');
    expect(selectedRule).not.toContain('text-decoration');
    expect(source).not.toContain('forced-color-adjust: none');
  });
});
