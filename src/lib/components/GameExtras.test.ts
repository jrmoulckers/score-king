import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import GameExtras from './GameExtras.svelte';
import source from './GameExtras.svelte?raw';

const mounted: ReturnType<typeof mount>[] = [];

function render(initialOpen = false, metadata = 'optional') {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(
    mount(GameExtras, {
      target,
      props: {
        initialOpen,
        metadata,
        children: createRawSnippet(() => ({
          render: () => '<div><input aria-label="Existing record" value="saved"></div>',
        })),
      },
    }),
  );
  flushSync();
  return target;
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('Game Extras disclosure', () => {
  it('starts closed with native semantics and a decorative expansion chevron', () => {
    const target = render();
    const details = target.querySelector('details')!;
    const summary = details.querySelector('summary')!;
    const icon = summary.querySelector('svg')!;

    expect(details.open).toBe(false);
    expect(summary.textContent).toContain('Extras');
    expect(summary.textContent).toContain('optional');
    expect(summary.textContent).not.toContain('↩');
    expect(summary.getAttribute('role')).toBeNull();
    expect(summary.getAttribute('tabindex')).toBeNull();
    expect(summary.getAttribute('aria-expanded')).toBeNull();
    expect(summary.querySelector('button')).toBeNull();
    expect(icon.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('focusable')).toBe('false');
    expect(icon.querySelector('path')?.getAttribute('d')).toBe('m6 4 4 4-4 4');
  });

  it('opens populated records and keeps the same child controls through native toggles', () => {
    const target = render(true, '1 marked');
    const details = target.querySelector('details')!;
    const summary = details.querySelector('summary')!;
    const input = details.querySelector('input')!;
    expect(details.open).toBe(true);
    expect(summary.textContent).toContain('1 marked');
    input.value = 'edited';

    summary.click();
    flushSync();
    expect(details.open).toBe(false);
    expect(details.querySelector('input')).toBe(input);
    expect(input.value).toBe('edited');

    summary.click();
    flushSync();
    expect(details.open).toBe(true);
    expect(input.value).toBe('edited');
  });

  it('retains the existing target, focus, theme, geometry and motion contracts', () => {
    expect(source).toMatch(/summary\s*\{[^}]*min-height: 46px/);
    expect(source).toMatch(/summary:focus-visible\s*\{[^}]*outline: 2px solid var\(--primary\)/);
    expect(source).toMatch(/\.chev\s*\{[^}]*display: block;[^}]*flex: none/);
    expect(source).toMatch(
      /\.game-extras\[open\] > summary \.chev\s*\{\s*transform: rotate\(90deg\)/,
    );
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.chev\s*\{\s*transition: none/,
    );
    expect(source).toContain('background: var(--surface-2)');
    expect(source).not.toMatch(/var\(--accent/);
  });
});
