import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundContext } from '../../types';
import { rummikub } from './index';
import type { RummikubInput } from './logic';
import RummikubEditorHarness from './RummikubEditorHarness.svelte';
import source from './TileKeypad.svelte?raw';

vi.mock('../../motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../motion')>();
  return { ...actual, animateMotion: vi.fn(), prefersReducedMotion: () => false };
});

const mounted: ReturnType<typeof mount>[] = [];

function render(jokerValue?: number, initial?: RummikubInput) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const config = jokerValue === undefined ? {} : { jokerValue };
  const ctx: RoundContext = {
    game: {
      id: 'joker-test',
      type: 'rummikub',
      playerIds: ['a', 'b'],
      config,
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
    config,
    roundIndex: 0,
    totals: {},
    rounds: [],
  };
  mounted.push(
    mount(RummikubEditorHarness, {
      target,
      props: { ctx, initial: initial ?? (rummikub.createRoundInput(ctx) as RummikubInput) },
    }),
  );
  flushSync();
  return { target, ctx };
}

function click(target: HTMLElement, selector: string) {
  target.querySelector<HTMLButtonElement>(selector)!.click();
  flushSync();
}

function draft(target: HTMLElement): RummikubInput {
  return JSON.parse(target.querySelector('[data-draft]')!.textContent!);
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('Rummikub joker configuration in the editor', () => {
  it.each([0, 15, 30, 60, undefined])(
    'uses joker value %s consistently in labels, previews, sting and saved scoring',
    (jokerValue) => {
      const { target, ctx } = render(jokerValue);
      const value = jokerValue ?? 30;
      click(target, '.prow .toggle');
      click(target, `[aria-label="Add a stranded joker, worth ${value}"]`);
      const previews = [...target.querySelectorAll('.preview')].map((el) => el.textContent);
      expect(previews).toEqual([`+${value}`, value ? `−${value}` : '0']);
      expect(target.querySelector('.emptyrack')?.textContent).toContain(`${value}-point pot`);
      expect(target.querySelector('.stamp')?.textContent ?? null).toBe(
        value ? `🃏 −${value}` : null,
      );
      expect(rummikub.scoreRound(draft(target), ctx)).toEqual({ a: value, b: value ? -value : 0 });
    },
  );

  it('preserves a zero-penalty saved input on edit and scores numbered tile corrections', () => {
    const initial: RummikubInput = {
      winner: 'a',
      hands: { a: { tiles: 0, jokers: 0 }, b: { tiles: 0, jokers: 1 } },
    };
    const { target, ctx } = render(0, initial);
    expect(draft(target)).toEqual(initial);
    expect(target.querySelector('.stamp')).toBeNull();
    click(target, '[aria-label="Add a 13 tile"]');
    expect([...target.querySelectorAll('.preview')].map((el) => el.textContent)).toEqual([
      '+13',
      '−13',
    ]);
    expect(rummikub.scoreRound(draft(target), ctx)).toEqual({ a: 13, b: -13 });
    expect(initial.hands.b).toEqual({ tiles: 0, jokers: 1 });
  });
});

describe('Rummikub responsive tile keypad', () => {
  it('fits columns to the rack with 46px keys and no more than seven columns', () => {
    expect(source).toContain(
      'grid-template-columns: repeat(auto-fit, minmax(max(46px, calc((100% - 36px) / 7)), 1fr))',
    );
    const keyRule = source.match(/\.key\s*\{([^}]*)\}/)?.[1];
    expect(keyRule).toContain('min-width: 46px');
    expect(keyRule).toContain('min-height: 46px');
  });

  describe('Rummikub raw rack validation', () => {
    it.each(['tiles', 'jokers'] as const)(
      'blocks fractional %s until corrected, including saved input',
      (field) => {
        const initial: RummikubInput = {
          winner: 'a',
          hands: { a: { tiles: 0, jokers: 0 }, b: { tiles: 0, jokers: 1 } },
        };
        const { target, ctx } = render(30, initial);
        const control = target.querySelector<HTMLInputElement>(`[aria-label="B ${field}"]`)!;
        control.value = '1.5';
        control.dispatchEvent(new Event('input', { bubbles: true }));
        flushSync();
        expect(control.checkValidity()).toBe(false);
        expect(draft(target).hands.b[field]).toBe(1.5);
        expect(rummikub.validateRound(draft(target), ctx)).toMatch(/whole-number/);
        for (const value of [0, 1, 2]) {
          control.value = String(value);
          control.dispatchEvent(new Event('input', { bubbles: true }));
          flushSync();
          expect(rummikub.validateRound(draft(target), ctx)).toBeNull();
          expect(draft(target).hands.b[field]).toBe(value);
        }
        expect(initial.hands.b).toEqual({ tiles: 0, jokers: 1 });
      },
    );
  });

  it('keeps numbered keys in order, tallies repeated tiles, caps jokers and clears the rack', () => {
    const { target } = render();
    const rack = target.querySelector<HTMLElement>('.prow')!;
    const keys = [...rack.querySelectorAll<HTMLButtonElement>('.pad button')];
    expect(keys.map((key) => key.getAttribute('aria-label'))).toEqual([
      ...Array.from({ length: 13 }, (_, i) => `Add a ${i + 1} tile`),
      'Add a stranded joker, worth 30',
    ]);
    expect(keys.every((key) => key.type === 'button')).toBe(true);

    for (const index of [12, 1, 12, 13, 13, 13]) {
      keys[index].click();
      flushSync();
    }
    expect(draft(target).hands.a).toEqual({ tiles: 28, jokers: 2 });
    expect(keys[13].disabled).toBe(true);

    click(rack, '.clear');
    expect(draft(target).hands.a).toEqual({ tiles: 0, jokers: 0 });
    expect(keys[13].disabled).toBe(false);
    expect(rack.querySelector<HTMLButtonElement>('.clear')!.disabled).toBe(true);
  });
});
