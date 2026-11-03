import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ConfigForm from './ConfigForm.svelte';
import { hearts } from '../games/hearts';
import { ginRummy } from '../games/ginrummy';
import { holdem } from '../games/holdem';
import { defaultConfig, type ConfigField } from '../types';

const mounted: ReturnType<typeof mount>[] = [];
const description =
  'Adds one good card worth grabbing: whoever takes the ♦J shaves 10 off their round.';

function render(fields: ConfigField[], config = defaultConfig(fields)) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(ConfigForm, { target, props: { fields, config } }));
  flushSync();
  return { target, config };
}

afterEach(() => {
  for (const component of mounted.splice(0)) unmount(component);
  document.body.replaceChildren();
});

describe('Advanced variants', () => {
  it('organizes Omnibus under Variant with its exact rule and unchanged description', () => {
    const { target, config } = render(hearts.configFields ?? []);
    const advanced = target.querySelector('details');
    const variant = advanced?.querySelector('fieldset');
    const checkbox = variant?.querySelector('input[type="checkbox"]');

    expect(advanced?.open).toBe(false);
    expect(advanced?.querySelector('summary')?.textContent).toContain('Advanced options');
    expect(advanced?.querySelector('.count')?.textContent).toBe('1');
    expect(variant?.querySelector('legend')?.textContent).toBe('Variant');
    expect(variant?.querySelector('label')?.textContent?.trim()).toBe('Omnibus');
    expect(variant?.querySelector('.rules-summary li')?.textContent).toBe('♦J = -10');
    expect(variant?.textContent).toContain(description);
    expect(config.variantJack).toBe(false);
    expect(checkbox?.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('keeps the saved key, default and toggle behavior while preserving the rule clarifier', () => {
    const fields = hearts.configFields ?? [];
    const field = fields.find((f) => f.key === 'variantJack');
    expect(field).toMatchObject({
      label: 'Omnibus',
      type: 'boolean',
      default: false,
      advanced: true,
      section: 'Variant',
      help: description,
    });

    const { target, config } = render(fields, { ...defaultConfig(fields), variantJack: true });
    const checkbox = target.querySelector<HTMLInputElement>('details input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(true);
    flushSync(() => checkbox.click());
    expect(config.variantJack).toBe(false);
    expect(target.querySelector('details .rules-summary li')?.textContent).toBe('♦J = -10');
    flushSync(() => checkbox.click());
    expect(config.variantJack).toBe(true);
    expect(target.querySelector('details')?.textContent).toContain(description);
    expect(config).not.toHaveProperty('omnibus');
  });

  it('does not misclassify Gin Rummy scoring or Hold’em table controls as variants', () => {
    for (const game of [ginRummy, holdem]) {
      const fields = game.configFields ?? [];
      const { target } = render(fields);
      const advanced = target.querySelector('details');
      expect(advanced).not.toBeNull();
      expect(
        [...(advanced?.querySelectorAll('legend') ?? [])].some(
          (legend) => legend.textContent === 'Variant',
        ),
      ).toBe(false);
      for (const field of fields.filter((f) => f.advanced && !f.showIf)) {
        expect(advanced?.textContent).toContain(field.label);
        if (field.help) expect(advanced?.textContent).toContain(field.help);
      }
    }
  });
});
