import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundContext } from '../../types';
import HeartsMeterHarness from './HeartsMeterHarness.svelte';
import { emptyInput, type HeartsInput } from './logic';

vi.mock('../../motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../motion')>();
  return { ...actual, animateMotion: vi.fn() };
});

const mounted: ReturnType<typeof mount>[] = [];
const ids = ['a', 'b', 'c', 'd'];

function editor(deckCount: 1 | 2 = 1, initialInput: HeartsInput = emptyInput(ids), roundIndex = 0) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const config = { deckCount, passing: false };
  const ctx: RoundContext = {
    game: {
      id: 'synthetic-meter',
      type: 'hearts',
      playerIds: ids,
      config,
      status: 'active',
      roundCount: roundIndex,
      createdAt: 1,
    },
    players: ids.map((id) => ({ id, name: id, color: '#7c5cff', createdAt: 1 })),
    config,
    roundIndex,
    totals: {},
    rounds: [],
  };
  mounted.push(mount(HeartsMeterHarness, { target: el, props: { initialInput, ctx } }));
  flushSync();
  return el;
}

function available(el: HTMLElement, suit: 'heart' | 'queen') {
  return el.querySelectorAll(`[data-suit="${suit}"] .playing-card:not(.allocated)`).length;
}

function typeHearts(el: HTMLElement, player: string, value: number) {
  const field = el.querySelector<HTMLInputElement>(`[aria-label="${player} hearts"]`)!;
  field.value = String(value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

function click(el: HTMLElement, selector: string) {
  el.querySelector<HTMLButtonElement>(selector)!.click();
  flushSync();
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('Hearts card allocation meter', () => {
  it.each([1, 2] as const)('starts with thirteen hearts and one Queen per deck (%i)', (decks) => {
    const el = editor(decks);
    expect(available(el, 'heart')).toBe(13 * decks);
    expect(available(el, 'queen')).toBe(decks);
    expect(el.querySelector('.meter')!.textContent).toContain(`${26 * decks} points left to place`);
    expect(el.querySelector('.meter')!.textContent).toContain(`${13 * decks} hearts left`);
    expect(el.querySelector('.meter')!.textContent).not.toMatch(/[🌑🌒🌓🌔🌕]/u);
    for (const pile of el.querySelectorAll('[data-suit]')) {
      expect(pile.getAttribute('aria-hidden')).toBe('true');
      expect(pile.querySelector('button, [tabindex]')).toBeNull();
    }
  });

  it.each([1, 2] as const)('allocates and restores cards, not Queen points (%i)', (decks) => {
    const el = editor(decks);
    typeHearts(el, 'a', 5);
    typeHearts(el, 'b', 4);
    typeHearts(el, 'c', 4);
    expect(available(el, 'heart')).toBe(13 * decks - 13);
    expect(available(el, 'queen')).toBe(decks);
    expect(el.querySelector('.count')!.textContent).toBe(`13/${26 * decks} pts`);

    click(el, '[aria-label^="Assign Queen of Spades to b."]');
    expect(available(el, 'heart')).toBe(13 * decks - 13);
    expect(available(el, 'queen')).toBe(decks - 1);
    expect(el.querySelector('.count')!.textContent).toBe(`26/${26 * decks} pts`);

    click(el, '[aria-label="Decrease a hearts"]');
    expect(available(el, 'heart')).toBe(13 * decks - 12);
    typeHearts(el, 'a', 2);
    expect(available(el, 'heart')).toBe(13 * decks - 10);

    for (let i = 0; i < decks; i++) click(el, '[aria-label^="Assign Queen of Spades to b."]');
    expect(available(el, 'queen')).toBe(decks);
    expect(available(el, 'heart')).toBe(13 * decks - 10);

    const clear = [...el.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Clear hand',
    )!;
    clear.click();
    flushSync();
    expect(available(el, 'heart')).toBe(13 * decks);
    expect(available(el, 'queen')).toBe(decks);
    expect(el.querySelector('.count')!.textContent).toBe(`0/${26 * decks} pts`);
  });

  it.each([1, 2] as const)(
    'reopens a complete distribution and restores cards on edit (%i)',
    (decks) => {
      const input = emptyInput(ids);
      input.hearts = { a: 5 * decks, b: 4 * decks, c: 4 * decks, d: 0 };
      input.queens = { a: 0, b: decks, c: 0, d: 0 };
      const el = editor(decks, input, 2);
      expect(available(el, 'heart')).toBe(0);
      expect(available(el, 'queen')).toBe(0);
      expect(el.querySelector('.label')!.textContent).toBe(`All ${26 * decks} points placed`);
      typeHearts(el, 'b', 0);
      expect(available(el, 'heart')).toBe(4 * decks);
      expect(available(el, 'queen')).toBe(0);
    },
  );

  it('reads legacy Queen holders without altering their card meaning', () => {
    const input = emptyInput(ids);
    delete input.queens;
    input.queen = 'b';
    const el = editor(1, input, 2);
    expect(available(el, 'heart')).toBe(13);
    expect(available(el, 'queen')).toBe(0);
    expect(el.querySelector('.count')!.textContent).toBe('13/26 pts');
  });

  it.each([1, 2] as const)('keeps over-allocation errors and bounds the stack (%i)', (decks) => {
    const input = emptyInput(ids);
    input.hearts.a = 13 * decks;
    input.hearts.b = 1;
    input.queens!.c = decks + 1;
    const el = editor(decks, input);
    expect(available(el, 'heart')).toBe(0);
    expect(available(el, 'queen')).toBe(0);
    expect(el.querySelector('.meter.over')).not.toBeNull();
    expect(el.querySelector('.card-error')!.textContent).toContain('1 too many hearts');
    expect(el.querySelector('.card-error')!.textContent).toContain('1 too many Queens');
    expect(el.textContent).toContain('hearts');
  });

  it('does not present a depleted Queen stack as a valid balanced pool', () => {
    const input = emptyInput(ids);
    input.queens!.a = 2;
    const el = editor(1, input);
    expect(available(el, 'heart')).toBe(13);
    expect(available(el, 'queen')).toBe(0);
    expect(el.querySelector('.meter.over')).not.toBeNull();
    expect(el.querySelector('.card-error')!.textContent).toContain('1 too many Queens');
  });
});
