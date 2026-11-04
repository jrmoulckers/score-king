import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundContext } from '../../types';
import HeartsMeter from './HeartsMeter.svelte';
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

function progress(el: HTMLElement) {
  return [...el.querySelectorAll<HTMLProgressElement>('progress')];
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
  it.each([
    [1, 0, 0],
    [1, 8, 0],
    [1, 8, 1],
    [1, 13, 1],
    [1, 14, 2],
    [2, 0, 0],
    [2, 20, 1],
    [2, 8, 2],
    [2, 26, 0],
    [2, 26, 2],
    [2, 27, 3],
  ])('fills point segments: %i decks, %i hearts, %i Queens', (decks, hearts, queens) => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const points = hearts + queens * 13;
    const total = decks * 26;
    mounted.push(
      mount(HeartsMeter, {
        target: el,
        props: {
          hearts,
          queens,
          totalHearts: decks * 13,
          totalQueens: decks,
          points,
          total,
        },
      }),
    );
    flushSync();

    const segments = progress(el);
    expect(segments).toHaveLength(2);
    const [heart, queen] = segments;
    expect(heart.max).toBe(decks * 13);
    expect(queen.max).toBe(decks * 13);
    expect(heart.value).toBe(Math.min(hearts, decks * 13));
    expect(queen.value).toBe(Math.min(queens, decks) * 13);
    expect(heart.position).toBeCloseTo(Math.min(hearts / (decks * 13), 1));
    expect(queen.position).toBeCloseTo(Math.min(queens / decks, 1));
    expect(heart.getAttribute('aria-label')).toBe('Heart points placed');
    expect(queen.getAttribute('aria-label')).toBe('Queen of Spades points placed');
    expect(heart.getAttribute('aria-valuetext')).toBe(`${hearts} of ${decks * 13} points placed`);
    expect(queen.getAttribute('aria-valuetext')).toBe(`${queens * 13} of ${decks * 13} points placed`);
    expect(el.querySelector('.count')!.textContent).toBe(`${points}/${total} pts`);
    const panel = el.querySelector('.progress-panel')!;
    expect(el.querySelector('.inventory')!.nextElementSibling).toBe(panel);
    expect(panel.firstElementChild).toBe(el.querySelector('.cap'));
    expect(panel.querySelectorAll('progress')).toHaveLength(2);
    expect(heart.nextElementSibling!.textContent).toBe(`♥ ${hearts}/${decks * 13} pts`);
    expect(queen.nextElementSibling!.textContent).toBe(`Q♠ ${queens * 13}/${decks * 13} pts`);
    expect(el.querySelector('.remaining')!.textContent).toContain(
      `${Math.max(0, decks * 13 - hearts)} heart`,
    );
    expect(el.querySelectorAll('.remaining')[1].textContent).toContain(
      `${Math.max(0, decks - queens)} Queen`,
    );
    if (points > total) {
      expect(el.querySelector('.label')!.textContent).toBe(`${points - total} too many points`);
      expect(el.querySelector('.card-error')!.textContent).toContain('1 too many hearts.');
      expect(el.querySelector('.card-error')!.textContent).toContain('1 too many Queens.');
    } else {
      expect(el.querySelector('.meter.over')).toBeNull();
      expect(el.querySelector('.label')!.textContent).toBe(
        points === total ? `All ${total} points placed` : `${total - points} points left to place`,
      );
    }
  });

  it('uses the supplied totals rather than assuming a deck size', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    mounted.push(
      mount(HeartsMeter, {
        target: el,
        props: {
          hearts: 8,
          totalHearts: 10,
          queens: 1,
          totalQueens: 3,
          points: 21,
          total: 49,
        },
      }),
    );
    flushSync();
    const [heart, queen] = progress(el);
    expect(heart.max).toBe(10);
    expect(heart.position).toBeCloseTo(8 / 10);
    expect(queen.max).toBe(39);
    expect(queen.position).toBeCloseTo(1 / 3);
    expect(el.querySelector('.count')!.textContent).toBe('21/49 pts');
    expect(el.querySelector('.label')!.textContent).toBe('28 points left to place');
  });

  it.each([1, 2] as const)(
    'distinguishes moon rows before and after either choice (%i)',
    (decks) => {
      const el = editor(decks);
      click(el, '.moon-btn');
      const rows = el.querySelectorAll('.prow');
      expect(rows[0].querySelector('.outcome')!.textContent).toBe(
        '🌙 shot the moon · choose scoring',
      );
      expect(rows[1].querySelector('.outcome')!.textContent).toBe('🌙 mooned · points pending');
      expect(rows[0].querySelector('.preview')!.textContent).toBe('—');
      expect(el.querySelector('.meter.ready .label')!.textContent).toBe('🌙 Moon shot');
      expect(progress(el).map((segment) => segment.position)).toEqual([1, 1]);
      const body = el.querySelector('.moon-body')!;
      expect(body.firstElementChild!.textContent).toBe('a is shooting the moon!');
      expect(body.querySelector('.moon-scoring')!.firstElementChild!.textContent).toBe(
        'Choose how to score the moon.',
      );
      click(el, '.moon-choice button');
      expect(rows[0].querySelector('.outcome')!.textContent).toBe('🌙 shot the moon');
      expect(rows[1].querySelector('.outcome')!.textContent).toBe(
        `🌙 mooned · +${26 * decks} points`,
      );
      expect(rows[1].querySelector('.preview')!.textContent).toBe(`+${26 * decks}`);
      click(el, '.moon-choice button:nth-child(2)');
      expect(rows[0].querySelector('.preview')!.textContent).toBe(`−${26 * decks}`);
      expect(rows[1].querySelector('.outcome')!.textContent).toBe('🌙 mooned · no points added');
      expect(rows[1].querySelector('.preview')!.textContent).toBe('0');
    },
  );

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
    expect(progress(el).map((segment) => segment.position)).toEqual([1 / decks, 0]);

    click(el, '[aria-label^="Assign Queen of Spades to b."]');
    expect(available(el, 'heart')).toBe(13 * decks - 13);
    expect(available(el, 'queen')).toBe(decks - 1);
    expect(el.querySelector('.count')!.textContent).toBe(`26/${26 * decks} pts`);
    expect(progress(el).map((segment) => segment.position)).toEqual([1 / decks, 1 / decks]);

    click(el, '[aria-label="Decrease a hearts"]');
    expect(available(el, 'heart')).toBe(13 * decks - 12);
    typeHearts(el, 'a', 2);
    expect(available(el, 'heart')).toBe(13 * decks - 10);
    expect(progress(el)[0].position).toBeCloseTo(10 / (13 * decks));

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
    expect(progress(el).map((segment) => segment.position)).toEqual([0, 0]);
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
    expect(progress(el).map((segment) => segment.position)).toEqual([0, 1]);
    expect(progress(el)[1].getAttribute('aria-valuetext')).toBe('26 of 13 points placed');
  });
});
