import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundContext } from '../../types';
import GolfEditorHarness from './GolfEditorHarness.svelte';
import { computeGrid, readConfig, scoreGolf, validateGolf, type GolfInput } from './logic';

vi.mock('../../motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../motion')>();
  return { ...actual, animateMotion: vi.fn() };
});

const mounted: ReturnType<typeof mount>[] = [];
const ctx: RoundContext = {
  game: {
    id: 'golf-grid-test',
    type: 'golf',
    playerIds: ['a'],
    config: { kingValue: -2 },
    status: 'active',
    createdAt: 1,
    roundCount: 0,
  },
  players: [{ id: 'a', name: 'Aces', color: '#7c5cff', createdAt: 1 }],
  config: { kingValue: -2 },
  roundIndex: 0,
  totals: { a: 10 },
  rounds: [],
};

function render(initial: GolfInput = { scores: { a: 0 } }) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(GolfEditorHarness, { target, props: { ctx, initial } }));
  flushSync();
  click(target, '.grid-toggle');
  return target;
}

function draft(target: HTMLElement): GolfInput {
  return JSON.parse(target.querySelector('[data-draft]')!.textContent!) as GolfInput;
}

function click(target: HTMLElement, selector: string, index = 0) {
  target.querySelectorAll<HTMLButtonElement>(selector)[index].click();
  flushSync();
}

function card(target: HTMLElement, index: number, face: string) {
  click(target, '.cell', index);
  const choice = [...target.querySelectorAll<HTMLButtonElement>('.pick')].find(
    (button) => button.querySelector('.pface')!.textContent === face,
  )!;
  choice.click();
  flushSync();
}

function expectScore(target: HTMLElement, score: number) {
  const input = draft(target);
  expect(input.scores.a).toBe(score);
  expect(target.querySelector<HTMLInputElement>('input')!.value).toBe(String(score));
  expect(target.querySelector('.running .num')!.textContent).toBe(String(10 + score));
  expect(target.querySelector('.tnum')!.textContent).toBe(String(score));
  expect(computeGrid(input.grids!.a, readConfig(ctx.config)).total).toBe(score);
  expect(validateGolf(input, ctx)).toBeNull();
  expect(scoreGolf(input, ctx)).toEqual({ a: score });
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('Golf grid score ownership', () => {
  it('publishes zero after clearing the final card of a fresh grid', () => {
    const target = render();
    card(target, 0, '5');
    expectScore(target, 5);
    card(target, 0, '⌫');
    expectScore(target, 0);
    expect(draft(target).grids!.a).toEqual(Array(6).fill(null));
    card(target, 1, '5');
    expectScore(target, 5);
    card(target, 1, '⌫');
    expectScore(target, 0);
  });

  it('keeps an untouched empty helper from overwriting a manual score', () => {
    const target = render({ scores: { a: 17 } });
    expect(draft(target).scores.a).toBe(17);
    card(target, 0, '⌫');
    expect(draft(target).scores.a).toBe(17);
    click(target, '.grid-toggle');
    click(target, '.grid-toggle');
    expect(draft(target).scores.a).toBe(17);
    card(target, 0, '5');
    expectScore(target, 5);
    card(target, 0, '⌫');
    expectScore(target, 0);
  });

  it('clears a populated saved grid without mutating the canceled edit source', () => {
    const saved: GolfInput = {
      scores: { a: 5 },
      grids: { a: ['5', null, null, null, null, null] },
    };
    const target = render(structuredClone(saved));
    expectScore(target, 5);
    card(target, 0, '⌫');
    expectScore(target, 0);
    expect(saved.scores.a).toBe(5);
    const reopened = render(structuredClone(saved));
    expectScore(reopened, 5);
    card(reopened, 0, '⌫');
    expectScore(reopened, 0);
  });

  it('preserves Clear all and subsequent card entry', () => {
    const target = render();
    card(target, 0, '5');
    click(target, '.clr');
    expectScore(target, 0);
    card(target, 1, '5');
    card(target, 1, '⌫');
    expectScore(target, 0);
  });

  it('keeps canceled-column zero and clearing either card in sync', () => {
    const target = render();
    card(target, 0, '5');
    card(target, 3, '5');
    expectScore(target, 0);
    expect(target.querySelectorAll('.cell.canceled')).toHaveLength(2);
    card(target, 0, '⌫');
    expectScore(target, 5);
    card(target, 3, '⌫');
    expectScore(target, 0);
  });

  it('publishes zero when the final negative card is cleared', () => {
    const target = render();
    card(target, 0, 'K');
    expectScore(target, -2);
    card(target, 0, '⌫');
    expectScore(target, 0);
  });
});
