import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { Round, RoundContext } from '../types';
import { defaultConfig } from '../types';
import GameExtrasEditorHarness from './GameExtrasEditorHarness.svelte';
import { hearts } from '../games/hearts';
import { emptyInput, type HeartsInput } from '../games/hearts/logic';
import { codenames } from '../games/codenames';
import { createInput, type CodenamesInput } from '../games/codenames/logic';

const mounted: ReturnType<typeof mount>[] = [];
const ids = ['a', 'b', 'c', 'd'];

function context(type: 'hearts' | 'codenames', rounds: Round[] = []): RoundContext {
  const config = defaultConfig((type === 'hearts' ? hearts : codenames).configFields);
  return {
    game: {
      id: 'extras-test',
      type,
      playerIds: ids,
      config,
      status: 'active',
      roundCount: rounds.length,
      createdAt: 1,
    },
    players: ids.map((id) => ({ id, name: id.toUpperCase(), color: '#7c5cff', createdAt: 1 })),
    config,
    roundIndex: rounds.length,
    totals: {},
    rounds,
  };
}

function render(
  ctx: RoundContext,
  input: { heartsInput?: HeartsInput; codenamesInput?: CodenamesInput },
) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(GameExtrasEditorHarness, { target, props: { ctx, ...input } }));
  flushSync();
  return target;
}

function draft<T>(target: HTMLElement): T {
  return JSON.parse(target.querySelector('[data-draft]')!.textContent!) as T;
}

function click(button: HTMLButtonElement) {
  button.click();
  flushSync();
}

function toggle(details: HTMLDetailsElement) {
  details.querySelector('summary')!.click();
  flushSync();
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('Hearts Extras', () => {
  it('names the existing optional activity and preserves multiple markers without changing scores', () => {
    const ctx = context('hearts');
    const initial = emptyInput(ids);
    initial.hearts.a = 13;
    initial.queens = { a: 0, b: 1, c: 0, d: 0 };
    const scores = hearts.scoreRound(initial, ctx);
    const target = render(ctx, { heartsInput: initial });
    const extras = target.querySelector<HTMLDetailsElement>('.game-extras')!;

    expect(extras.open).toBe(false);
    expect(extras.querySelector('summary')!.textContent).toContain('Extras');
    expect(extras.querySelector('summary')!.textContent).not.toMatch(/Other stats|↩/);
    toggle(extras);
    expect(extras.querySelector('h3')!.textContent).toBe('Wrong-way moments');
    expect(extras.textContent).toContain("This doesn't affect scores.");

    const buttons = extras.querySelectorAll<HTMLButtonElement>('.wrong-way-player');
    click(buttons[0]);
    click(buttons[1]);
    expect(draft<HeartsInput>(target).wrongWayPlayerIds).toEqual(['a', 'b']);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].querySelector('.check')!.textContent).toBe('✓');
    expect(extras.querySelector('summary')!.textContent).toContain('2 marked');
    expect(hearts.scoreRound(draft<HeartsInput>(target), ctx)).toEqual(scores);
    expect(hearts.validateRound(draft<HeartsInput>(target), ctx)).toBeNull();

    toggle(extras);
    expect(extras.open).toBe(false);
    expect(draft<HeartsInput>(target).wrongWayPlayerIds).toEqual(['a', 'b']);
    toggle(extras);
    click(buttons[0]);
    expect(draft<HeartsInput>(target).wrongWayPlayerIds).toEqual(['b']);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[0].querySelector('.check')).toBeNull();
  });

  it('opens saved markers, preserves prior history and lets Clear hand reset the draft', () => {
    const prior: Round = {
      id: 'prior',
      gameId: 'extras-test',
      index: 0,
      input: { ...emptyInput(ids), wrongWayPlayerIds: ['b'] },
      deltas: {},
      createdAt: 1,
    };
    const target = render(context('hearts', [prior]), {
      heartsInput: { ...emptyInput(ids), wrongWayPlayerIds: ['a'] },
    });
    const extras = target.querySelector<HTMLDetailsElement>('.game-extras')!;
    expect(extras.open).toBe(true);
    expect(extras.querySelector('.wrong-way-history')!.textContent).toContain('Earlier this game');
    expect(extras.querySelector('.history-row')!.textContent).toMatch(/B.*Round\s*1/);

    toggle(extras);
    const clear = [...target.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Clear hand'),
    )!;
    click(clear);
    expect(draft<HeartsInput>(target).wrongWayPlayerIds).toEqual([]);
    expect(extras.open).toBe(false);
    expect(extras.querySelector('summary')!.textContent).toContain('optional');
    expect(extras.querySelector('.wrong-way-history')!.textContent).toContain('Earlier this game');
  });
});

describe('Codenames Extras', () => {
  it('uses the shared disclosure for optional spymasters and retains non-scoring selections', () => {
    const ctx = context('codenames');
    const initial = createInput(ctx);
    initial.winner = 'red';
    const scores = codenames.scoreRound(initial, ctx);
    const target = render(ctx, { codenamesInput: initial });
    const extras = target.querySelector<HTMLDetailsElement>('.game-extras')!;
    expect(extras.open).toBe(false);
    expect(extras.querySelector('summary')!.textContent).toContain('Extras');
    toggle(extras);
    expect(extras.querySelector('h3')!.textContent).toContain('Spymasters');

    const red = extras.querySelector<HTMLButtonElement>('.chip.red')!;
    const blue = extras.querySelector<HTMLButtonElement>('.chip.blue')!;
    click(red);
    click(blue);
    expect(draft<CodenamesInput>(target).spymasters).toEqual({ red: 'a', blue: 'b' });
    expect(red.getAttribute('aria-pressed')).toBe('true');
    expect(blue.getAttribute('aria-pressed')).toBe('true');
    expect(extras.querySelector('summary')!.textContent).toContain('logged');
    expect(codenames.scoreRound(draft<CodenamesInput>(target), ctx)).toEqual(scores);
    expect(codenames.validateRound(draft<CodenamesInput>(target), ctx)).toBeNull();

    toggle(extras);
    expect(draft<CodenamesInput>(target).spymasters).toEqual({ red: 'a', blue: 'b' });
    toggle(extras);
    click(red);
    expect(draft<CodenamesInput>(target).spymasters).toEqual({ red: null, blue: 'b' });
    expect(red.getAttribute('aria-pressed')).toBe('false');
  });

  it('opens recorded spymasters when editing without reopening after deselection', () => {
    const ctx = context('codenames');
    const target = render(ctx, {
      codenamesInput: { ...createInput(ctx), spymasters: { red: 'a', blue: null } },
    });
    const extras = target.querySelector<HTMLDetailsElement>('.game-extras')!;
    expect(extras.open).toBe(true);
    const red = extras.querySelector<HTMLButtonElement>('.chip.red')!;
    expect(red.getAttribute('aria-pressed')).toBe('true');
    click(red);
    expect(extras.open).toBe(true);
    expect(extras.querySelector('summary')!.textContent).toContain('optional');
    toggle(extras);
    expect(extras.open).toBe(false);
    expect(draft<CodenamesInput>(target).spymasters).toEqual({ red: null, blue: null });
  });
});
