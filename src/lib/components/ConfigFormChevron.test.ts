import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ConfigForm from './ConfigForm.svelte';
import source from './ConfigForm.svelte?raw';
import type { ConfigField } from '../types';

const mounted: ReturnType<typeof mount>[] = [];

function render(fields: ConfigField[]) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(ConfigForm, { target, props: { fields, config: { moon: true } } }));
  return target;
}

afterEach(() => {
  for (const component of mounted.splice(0)) unmount(component);
  document.body.replaceChildren();
});

describe('Advanced options chevron', () => {
  it('uses centered, font-independent decorative geometry in the native disclosure', () => {
    const target = render([
      { key: 'moon', label: 'Shoot the moon', type: 'boolean', default: true, advanced: true },
    ]);
    const disclosure = target.querySelector('details');
    const summary = disclosure?.querySelector('summary');
    const icon = summary?.querySelector('svg.chev');

    expect(disclosure?.open).toBe(false);
    expect(summary?.textContent).toContain('Advanced options');
    expect(summary?.querySelector('.count')?.textContent).toBe('1');
    expect(icon?.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(icon?.getAttribute('width')).toBe('16');
    expect(icon?.getAttribute('height')).toBe('16');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('focusable')).toBe('false');
    expect(icon?.querySelector('path')?.getAttribute('d')).toBe('m6 4 4 4-4 4');
    expect(summary?.getAttribute('role')).toBeNull();
    expect(summary?.getAttribute('tabindex')).toBeNull();
    expect(target.querySelector('input')?.checked).toBe(true);
  });

  it('keeps fixed geometry, expanded rotation, motion accommodation and target size', () => {
    const iconRule = source.match(/\.chev\s*\{([^}]*)\}/)?.[1];
    expect(iconRule).toMatch(/display:\s*block/);
    expect(iconRule).toMatch(/flex:\s*none/);
    expect(iconRule).not.toMatch(/font-size|line-height|translate/);
    expect(source).toMatch(/\.advanced\[open\] > summary \.chev\s*\{\s*transform: rotate\(90deg\)/);
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.chev\s*\{\s*transition: none/,
    );
    expect(source).toMatch(/\.advanced > summary\s*\{[^}]*min-height: 46px/);
  });

  it('does not introduce a disclosure when there are no visible advanced options', () => {
    expect(render([]).querySelector('details')).toBeNull();
    expect(
      render([
        {
          key: 'moon',
          label: 'Shoot the moon',
          type: 'boolean',
          default: true,
          advanced: true,
          showIf: () => false,
        },
      ]).querySelector('details'),
    ).toBeNull();
  });
});
