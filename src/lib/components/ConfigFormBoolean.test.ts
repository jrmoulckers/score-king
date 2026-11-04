import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { avalon } from '../games/avalon';
import { hearts } from '../games/hearts';
import { defaultConfig, type ConfigField } from '../types';
import ConfigFormTest from './ConfigFormTest.svelte';
import source from './ConfigForm.svelte?raw';

const mounted: ReturnType<typeof mount>[] = [];

function render(fields: ConfigField[], initial = defaultConfig(fields)) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(ConfigFormTest, { target, props: { fields, initial } }));
  flushSync();
  return target;
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('boolean configuration targets', () => {
  it('enlarges the associated label without enlarging or replacing the native checkbox', () => {
    expect(source).toMatch(/\.boolean-field\s*\{[^}]*min-height:\s*46px/);
    expect(source).toMatch(/\.boolean-field input\s*\{[^}]*flex:\s*none/);
    expect(source).toMatch(/\.boolean-field span\s*\{[^}]*overflow-wrap:\s*anywhere/);
    const target = render(avalon.configFields!);
    const checkboxes = [...target.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(checkboxes).toHaveLength(4);
    for (const checkbox of checkboxes) {
      const label = checkbox.closest('label')!;
      expect(label.classList.contains('boolean-field')).toBe(true);
      expect(checkbox.labels?.[0]).toBe(label);
      expect(checkbox.style.width).toBe('auto');
      expect(checkbox.style.minHeight).toBe('0');
      expect(checkbox.hasAttribute('role')).toBe(false);
      expect(checkbox.hasAttribute('aria-checked')).toBe(false);
      expect(checkbox.checked).toBe(false);
      const description = document.getElementById(checkbox.getAttribute('aria-describedby')!);
      expect(description?.textContent?.trim()).toBeTruthy();
      flushSync(() => label.click());
      expect(checkbox.checked).toBe(true);
      flushSync(() => label.click());
      expect(checkbox.checked).toBe(false);
    }
  });

  it('retains saved advanced values, descriptions and native label activation', () => {
    const fields = hearts.configFields!;
    const target = render(fields, { ...defaultConfig(fields), variantJack: true });
    const details = target.querySelector('details')!;
    expect(details.open).toBe(false);
    details.open = true;
    const checkbox = details.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.closest('label')?.classList.contains('boolean-field')).toBe(true);
    const description = document.getElementById(checkbox.getAttribute('aria-describedby')!);
    expect(description?.textContent).toContain('♦J = -10');
    flushSync(() => checkbox.closest('label')!.click());
    expect(checkbox.checked).toBe(false);
    expect(description?.textContent).toContain('♦J = -10');
    expect(target.querySelector('#target')?.closest('label.boolean-field')).toBeNull();
  });

  it('keeps long conditional labels in their group and preserves drafts when hidden', () => {
    const longLabel = 'An optional rule with a long label that wraps across multiple lines';
    const target = render([
      { key: 'enabled', label: 'Enable', type: 'boolean', default: false },
      {
        key: 'conditional',
        label: longLabel,
        type: 'boolean',
        default: true,
        advanced: true,
        section: 'Optional rules',
        showIf: (config) => config.enabled === true,
      },
    ]);
    const enabled = target.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(target.querySelector('details')).toBeNull();
    flushSync(() => enabled.closest('label')!.click());
    const conditional = target.querySelector<HTMLInputElement>('details input[type="checkbox"]')!;
    expect(conditional.checked).toBe(true);
    expect(conditional.closest('label')?.textContent?.trim()).toBe(longLabel);
    const legend = conditional.closest('fieldset')?.querySelector('legend');
    expect(legend?.textContent).toBe('Optional rules');
    flushSync(() => conditional.closest('label')!.click());
    expect(conditional.checked).toBe(false);
    flushSync(() => enabled.closest('label')!.click());
    expect(target.querySelector('details')).toBeNull();
    flushSync(() => enabled.closest('label')!.click());
    const restored = target.querySelector<HTMLInputElement>('details input[type="checkbox"]');
    expect(restored?.checked).toBe(false);
  });
});
