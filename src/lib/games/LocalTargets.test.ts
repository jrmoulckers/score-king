import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
  document.head.querySelector('#local-target-styles')?.remove();
  document.body.replaceChildren();
});

function rule(path: string, selector: string) {
  const source = readFileSync(resolve('src', path), 'utf8');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`))?.[0];
  expect(match, `${path}: ${selector}`).toBeDefined();
  return match!;
}

describe('assigned game-local target floors', () => {
  it.each([
    ['lib/games/avalon/AvalonEditor.svelte', '.vbead'],
    ['lib/games/werewords/WerewordsEditor.svelte', '.dice'],
    ['lib/games/saladbowl/SaladBowlEditor.svelte', '.chip'],
    ['lib/games/volleyball/VolleyballEditor.svelte', '.linklike'],
    ['lib/games/volleyball/VolleyballEditor.svelte', '.sidehead'],
    ['lib/games/botc/BotcEditor.svelte', '.life'],
    ['lib/games/botc/BotcEditor.svelte', '.team button'],
    ['lib/games/botc/BotcEditor.svelte', '.act'],
    ['pages/Wrapped.svelte', '.chip'],
  ])('%s %s retains a flexible 46px minimum', (path, selector) => {
    const css = rule(path, selector);
    const style = document.createElement('style');
    style.id = 'local-target-styles';
    style.textContent = css;
    document.head.appendChild(style);
    const parent = document.createElement('div');
    const control = document.createElement('button');
    if (selector === '.team button') parent.className = 'team';
    else control.className = selector.slice(1);
    parent.appendChild(control);
    document.body.appendChild(parent);
    expect(getComputedStyle(control).minHeight).toBe('46px');
    expect(css).not.toMatch(/(?:^|;)\s*(?:height|max-height)\s*:/);
  });

  it('wraps Avalon vote targets without shrinking either hitbox dimension', () => {
    const path = 'lib/games/avalon/AvalonEditor.svelte';
    expect(rule(path, '.vbeads')).toContain('flex-wrap: wrap');
    expect(rule(path, '.vbead')).toContain('min-width: 46px');
    expect(rule(path, '.vbead')).toContain('flex: 1 1 46px');
  });

  it('wraps full-sized Wrapped hitboxes while retaining the compact visual dots', () => {
    const path = 'pages/Wrapped.svelte';
    expect(rule(path, '.dots')).toContain('flex-wrap: wrap');
    expect(rule(path, '.dots')).toContain('min-width: 0');
    const dot = rule(path, '.dot');
    expect(dot).toContain('flex: none');
    expect(dot).toContain('width: 46px');
    expect(dot).toContain('height: 46px');
    const mark = rule(path, '.dot-mark');
    expect(mark).toContain('width: 7px');
    expect(mark).toContain('height: 7px');
  });
});
