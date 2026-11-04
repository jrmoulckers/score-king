import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundContext } from '../../types';
import KittensEditorHarness from './KittensEditorHarness.svelte';
import { emptyInput, finishingPositions, scoreMatch, validateMatch, type EKInput } from './logic';

vi.mock('../../motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../motion')>();
  return { ...actual, animateMotion: vi.fn(), popIn: vi.fn(), prefersReducedMotion: () => true };
});

const mounted: ReturnType<typeof mount>[] = [];
const ids = ['a', 'b', 'c', 'd'];

function render(type: string, trackOrder: boolean, initial = emptyInput()) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const config = { trackOrder, trackDefuses: true };
  const ctx: RoundContext = {
    game: {
      id: 'synthetic-kittens',
      type,
      config,
      playerIds: ids,
      status: 'active',
      createdAt: 1,
      roundCount: initial.winner ? 1 : 0,
    },
    players: ids.map((id) => ({ id, name: `Kitten ${id}`, color: '#7c5cff', createdAt: 1 })),
    config,
    roundIndex: 0,
    totals: {},
    rounds: [],
  };
  mounted.push(mount(KittensEditorHarness, { target, props: { ctx, initial } }));
  flushSync();
  return target;
}

function draft(target: HTMLElement): EKInput {
  return JSON.parse(target.querySelector('[data-draft]')!.textContent!);
}

function row(target: HTMLElement, index: number) {
  return target.querySelectorAll<HTMLElement>('.list .krow')[index];
}

function click(target: HTMLElement, index: number) {
  row(target, index).click();
  flushSync();
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe.each(['explodingkittens', 'implodingkittens'])('%s survivor controls', (type) => {
  it('keeps choose, clear and change reachable as native pressed buttons', () => {
    const target = render(type, false);
    expect(target.querySelectorAll('.krow[aria-pressed="false"]')).toHaveLength(4);
    click(target, 0);
    const selected = row(target, 0);
    expect(selected.tagName).toBe('BUTTON');
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(selected.querySelector('.badge.crown')?.textContent).toContain('Survivor');
    selected.focus();
    expect(document.activeElement).toBe(selected);
    expect(draft(target)).toEqual({ winner: 'a', order: [] });
    click(target, 0);
    expect(row(target, 0)).toBe(selected);
    expect(selected.getAttribute('aria-pressed')).toBe('false');
    expect(draft(target)).toEqual(emptyInput());
    expect(validateMatch(draft(target), ids, false)).not.toBeNull();
    click(target, 0);
    click(target, 1);
    expect(target.querySelectorAll('.krow[aria-pressed="true"]')).toHaveLength(1);
    expect(row(target, 0).getAttribute('aria-pressed')).toBe('false');
    expect(row(target, 1).getAttribute('aria-pressed')).toBe('true');
    expect(scoreMatch(draft(target), ids)).toEqual({ a: 0, b: 1, c: 0, d: 0 });
    expect(finishingPositions(draft(target), ids)).toEqual({ b: 1 });
  });

  it('can clear and correct a saved winner without changing defuses or elimination data', () => {
    const initial = { winner: 'c', order: [], defuses: { a: 2, c: 1 } };
    const target = render(type, false, initial);
    expect(row(target, 2).tagName).toBe('BUTTON');
    expect(row(target, 2).getAttribute('aria-pressed')).toBe('true');
    click(target, 2);
    expect(draft(target)).toEqual({ ...initial, winner: null });
    click(target, 3);
    expect(draft(target)).toEqual({ ...initial, winner: 'd' });
    expect(validateMatch(draft(target), ids, false)).toBeNull();
  });

  it('preserves automatic survivor, elimination order, placement and revive behavior', () => {
    const target = render(type, true);
    click(target, 0);
    click(target, 1);
    click(target, 2);
    expect(draft(target)).toEqual({ winner: 'd', order: ['a', 'b', 'c'] });
    expect(row(target, 3).tagName).toBe('DIV');
    expect(row(target, 3).hasAttribute('aria-pressed')).toBe(false);
    click(target, 3);
    expect(draft(target).winner).toBe('d');
    expect(finishingPositions(draft(target), ids)).toEqual({ a: 4, b: 3, c: 2, d: 1 });
    click(target, 1);
    expect(draft(target)).toEqual({ winner: null, order: ['a', 'c'] });
    expect(row(target, 3).tagName).toBe('BUTTON');
    click(target, 3);
    expect(draft(target)).toEqual({ winner: 'b', order: ['a', 'c', 'd'] });
    expect(validateMatch(draft(target), ids, true)).toBeNull();
  });
});
