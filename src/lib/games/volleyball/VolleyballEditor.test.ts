import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { RoundContext } from '../../types';
import { volleyball } from './index';
import type { Side, VolleyballInput } from './logic';
import VolleyballEditorHarness from './VolleyballEditorHarness.svelte';
import source from './VolleyballEditor.svelte?raw';

const mounted: ReturnType<typeof mount>[] = [];
const ctx: RoundContext = {
  game: {
    id: 'court-test',
    type: 'volleyball',
    playerIds: ['a', 'b'],
    config: {},
    status: 'active',
    createdAt: 1,
    roundCount: 0,
  },
  players: ['a', 'b'].map((id) => ({
    id,
    name: id.toUpperCase(),
    color: '#7c5cff',
    createdAt: 1,
  })),
  config: {},
  roundIndex: 0,
  totals: {},
  rounds: [],
};

function render(initial: VolleyballInput) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(VolleyballEditorHarness, { target, props: { ctx, initial } }));
  flushSync();
  return target;
}

function draft(target: HTMLElement): VolleyballInput {
  return JSON.parse(target.querySelector('[data-draft]')!.textContent!) as VolleyballInput;
}

function click(target: HTMLElement, selector: string, index = 0) {
  target.querySelectorAll<HTMLButtonElement>(selector)[index].click();
  flushSync();
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('Volleyball court reflow', () => {
  it('retains narrow reflow and nonshrinking rally targets without hiding overflow', () => {
    expect(source).toMatch(/grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
    expect(source).toMatch(
      /@media \(max-width: 380px\)\s*\{\s*\.match\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(source).toMatch(/\.side\s*\{[^}]*min-width: 0/);
    expect(source).toMatch(/\.plus\s*\{[^}]*min-width: 46px/);
    expect(source).toMatch(/\.minus\s*\{[^}]*width: 52px/);
    expect(source).not.toMatch(/overflow-x:\s*hidden/);
  });

  it('keeps rally taps, per-side correction and undo associated with their teams', () => {
    const target = render(volleyball.createRoundInput(ctx) as VolleyballInput);
    click(target, '.plus');
    click(target, '.plus', 1);
    click(target, '.plus');
    expect(draft(target).points).toEqual({ home: 2, away: 1 });
    click(target, '.minus', 1);
    expect(draft(target).rallies).toEqual(['a', 'a']);
    click(target, '.undo');
    expect(draft(target).points).toEqual({ home: 1, away: 0 });
    click(target, '.swap');
    expect(draft(target).points).toEqual({ home: 0, away: 1 });
    expect(draft(target).rallies).toEqual(['b']);
  });

  it('preserves deuce, completion, undo completion and saved set validation', () => {
    const initial = volleyball.createRoundInput(ctx) as VolleyballInput;
    initial.rallies = Array.from({ length: 48 }, (_, i): Side => (i % 2 ? 'b' : 'a'));
    initial.points = { home: 24, away: 24 };
    const target = render(initial);
    expect(target.querySelector('.status')!.textContent).toContain('Deuce');
    click(target, '.plus');
    expect(target.querySelector('.status')!.textContent).toContain('Set point');
    click(target, '.plus');
    expect(target.querySelectorAll('.plus:disabled')).toHaveLength(2);
    expect(volleyball.validateRound(draft(target), ctx)).toBeNull();
    click(target, '.undo');
    expect(target.querySelectorAll('.plus:disabled')).toHaveLength(0);
    expect(draft(target).points).toEqual({ home: 25, away: 24 });
  });

  it('keeps legacy totals editable without inventing a rally log', () => {
    const initial = volleyball.createRoundInput(ctx) as VolleyballInput;
    delete initial.rallies;
    initial.points = { home: 3, away: 2 };
    const target = render(initial);
    click(target, '.minus');
    click(target, '.plus', 1);
    expect(draft(target).points).toEqual({ home: 2, away: 3 });
    expect(draft(target).rallies).toBeUndefined();
    expect(target.querySelector<HTMLButtonElement>('.undo')!.disabled).toBe(true);
  });
});
