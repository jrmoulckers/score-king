import { flushSync, mount, unmount, type Component } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameModule, RoundContext, RoundEditorProps } from '../types';
import { defaultConfig } from '../types';
import Harness from './IdentityEditorHarness.svelte';
import YahtzeeEditor from './yahtzee/YahtzeeEditor.svelte';
import CatanEditor from './catan/CatanEditor.svelte';
import ScrabbleEditor from './scrabble/ScrabbleEditor.svelte';
import GinRummyEditor from './ginrummy/GinRummyEditor.svelte';
import CribbageEditor from './cribbage/CribbageEditor.svelte';
import { yahtzee } from './yahtzee';
import { catan } from './catan';
import { scrabble } from './scrabble';
import { ginRummy } from './ginrummy';
import { cribbage } from './cribbage';

vi.mock('../motion', () => ({ bumpOnChange: vi.fn(), animateMotion: vi.fn() }));
vi.mock('../haptics', () => ({ haptic: vi.fn() }));

const mounted: ReturnType<typeof mount>[] = [];

function render(module: GameModule, Editor: Component<RoundEditorProps>, initial?: unknown) {
  const config = defaultConfig(module.configFields);
  const players = ['a', 'b', 'c'].slice(0, module.id === 'catan' ? 3 : 2).map((id) => ({
    id,
    name: id,
    color: '#7c5cff',
    createdAt: 1,
  }));
  const ctx: RoundContext = {
    game: {
      id: 'radio-test',
      type: module.id,
      playerIds: players.map((p) => p.id),
      config,
      status: 'active',
      roundCount: 0,
      createdAt: 1,
    },
    players,
    config,
    roundIndex: module.id === 'yahtzee' ? 8 : 0,
    totals: {},
    rounds: [],
  };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(
    mount(Harness, {
      target,
      props: { Editor, ctx, initial: initial ?? module.createRoundInput(ctx) },
    }),
  );
  flushSync();
  return {
    target,
    ctx,
    draft: () => JSON.parse(target.querySelector('[data-draft]')!.textContent!),
  };
}

function key(button: HTMLButtonElement, value: string, ctrlKey = false) {
  const event = new KeyboardEvent('keydown', {
    key: value,
    ctrlKey,
    bubbles: true,
    cancelable: true,
  });
  flushSync(() => button.dispatchEvent(event));
  return event;
}

function selection(buttons: HTMLButtonElement[], index: number) {
  expect(buttons.map((b) => b.getAttribute('aria-checked'))).toEqual(
    buttons.map((_, i) => String(i === index)),
  );
  expect(buttons.map((b) => b.tabIndex)).toEqual(buttons.map((_, i) => (i === index ? 0 : -1)));
  expect(document.activeElement).toBe(buttons[index]);
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('editor choice semantics', () => {
  it.each([
    { module: yahtzee, Editor: YahtzeeEditor, label: 'fixed score' },
    { module: scrabble, Editor: ScrabbleEditor, label: 'round type and player' },
    { module: ginRummy, Editor: GinRummyEditor, label: 'knocker' },
    { module: cribbage, Editor: CribbageEditor, label: 'dealer' },
  ])('supports one tab stop and radio navigation for $label', ({ module, Editor }) => {
    const { target } = render(module, Editor);
    const labels = [...target.querySelectorAll('[role="radiogroup"]')].map((group) =>
      group.getAttribute('aria-label'),
    );
    for (const label of labels) {
      const group = target.querySelector(`[role="radiogroup"][aria-label="${label}"]`)!;
      const buttons = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
      expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
      buttons[0].focus();
      for (const [value, index] of [
        ['ArrowRight', 1],
        ['ArrowDown', 0],
        ['ArrowLeft', 1],
        ['ArrowUp', 0],
        ['End', 1],
        ['Home', 0],
      ] as const) {
        expect(key(document.activeElement as HTMLButtonElement, value).defaultPrevented).toBe(true);
        selection(buttons, index);
      }
      expect(key(buttons[0], 'Tab').defaultPrevented).toBe(false);
      expect(key(buttons[0], ' ').defaultPrevented).toBe(false);
      expect(key(buttons[0], 'ArrowRight', true).defaultPrevented).toBe(false);
      flushSync(() => buttons[1].click());
      expect(buttons[1].getAttribute('aria-checked')).toBe('true');
      expect(buttons[1].tabIndex).toBe(0);
      flushSync(() => buttons[0].click());
    }
  });

  it('keeps focus, checked state, tab stop and full Scrabble draft on canceled keyboard discard', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const initial = { kind: 'turn', playerId: 'b', points: 20, bingo: true };
    const { target, draft, ctx } = render(scrabble, ScrabbleEditor, initial);
    const buttons = [...target.querySelectorAll<HTMLButtonElement>('.mode-btn')];
    buttons[0].focus();
    key(buttons[0], 'ArrowRight');
    selection(buttons, 0);
    expect(draft()).toEqual(initial);
    expect(scrabble.scoreRound(draft(), ctx)).toEqual({ a: 0, b: 70 });
    key(buttons[0], 'End');
    selection(buttons, 0);
    expect(draft()).toEqual(initial);
    confirm.mockReturnValue(true);
    key(buttons[0], 'End');
    selection(buttons, 1);
    expect(draft()).toEqual({ kind: 'final', finisherId: null, remaining: { a: 0, b: 0 } });
    key(buttons[1], 'Home');
    selection(buttons, 0);
    expect(draft()).toEqual({ kind: 'turn', playerId: 'a', points: 0, bingo: false });
    expect(confirm).toHaveBeenCalledTimes(3);
  });

  it('exposes both Catan awards as independently tabbable clearable pressed buttons', () => {
    const { target, draft, ctx } = render(catan, CatanEditor);
    expect(target.querySelector('[role="radio"]')).toBeNull();
    for (const [index, kind] of ['longestRoad', 'largestArmy'].entries()) {
      const group = target.querySelectorAll('[role="group"]')[index];
      const buttons = [...group.querySelectorAll<HTMLButtonElement>('button')];
      expect(buttons.every((b) => b.tabIndex === 0)).toBe(true);
      flushSync(() => buttons[0].click());
      expect(draft()[kind]).toBe('a');
      expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
      flushSync(() => buttons[1].click());
      expect(draft()[kind]).toBe('b');
      expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
      expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
      flushSync(() => buttons[1].click());
      expect(draft()[kind]).toBeNull();
      expect(buttons.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    }
    expect(catan.scoreRound(draft(), ctx)).toEqual({ a: 0, b: 0, c: 0 });
  });

  it('keeps the Scrabble finisher clearable without discarding rack values', () => {
    const { target, draft, ctx } = render(scrabble, ScrabbleEditor, {
      kind: 'final',
      finisherId: null,
      remaining: { a: 3, b: 9 },
    });
    const buttons = [
      ...target.querySelectorAll<HTMLButtonElement>('[aria-label="Who went out"] button'),
    ];
    expect(buttons.every((b) => b.tabIndex === 0 && !b.hasAttribute('role'))).toBe(true);
    flushSync(() => buttons[0].click());
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(scrabble.scoreRound(draft(), ctx)).toEqual({ a: 9, b: -9 });
    flushSync(() => buttons[0].click());
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(draft()).toEqual({ kind: 'final', finisherId: null, remaining: { a: 3, b: 9 } });
  });
});
