import { flushSync, mount, unmount, type Component } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameModule, RoundContext, RoundEditorProps } from '../types';
import { settings } from '../stores/settings';
import WinnerDraftHarness from './WinnerDraftHarness.svelte';
import UnoEditor from './uno/UnoEditor.svelte';
import UnoGolfEditor from './unogolf/UnoGolfEditor.svelte';
import RummikubEditor from './rummikub/RummikubEditor.svelte';
import { uno } from './uno';
import { unogolf } from './unogolf';
import { rummikub } from './rummikub';
import type { UnoGolfInput } from './unogolf/logic';
import type { RummikubInput } from './rummikub/logic';

const mounted: ReturnType<typeof mount>[] = [];
type Draft = (UnoGolfInput | RummikubInput) & { left?: Record<string, number> };
const cases: {
  module: GameModule;
  Editor: Component<RoundEditorProps>;
  config: Record<string, unknown>;
  winner: string;
  labels: string[];
  values: number[];
}[] = [
  {
    module: uno,
    Editor: UnoEditor,
    config: {},
    winner: 'out',
    labels: ['number-card face value', 'action cards', 'wild cards'],
    values: [12, 1, 1],
  },
  {
    module: unogolf,
    Editor: UnoGolfEditor,
    config: {},
    winner: 'out',
    labels: ['number-card face value', 'action cards', 'wild cards'],
    values: [12, 1, 1],
  },
  {
    module: rummikub,
    Editor: RummikubEditor,
    config: {},
    winner: 'winner',
    labels: ['tiles', 'jokers'],
    values: [7, 1],
  },
  {
    module: rummikub,
    Editor: RummikubEditor,
    config: { jokerValue: 0 },
    winner: 'winner',
    labels: ['tiles', 'jokers'],
    values: [7, 1],
  },
];

function render(test: (typeof cases)[number], saved = false) {
  const ctx: RoundContext = {
    game: {
      id: 'winner-draft-test',
      type: test.module.id,
      config: test.config,
      playerIds: ['a', 'b', 'c'],
      status: 'active',
      roundCount: saved ? 1 : 0,
      createdAt: 1,
    },
    players: ['a', 'b', 'c'].map((id) => ({
      id,
      name: id.toUpperCase(),
      color: '#7c5cff',
      createdAt: 1,
    })),
    config: test.config,
    roundIndex: 0,
    totals: {},
    rounds: [],
  };
  const fresh = test.module.createRoundInput(ctx) as Draft;
  const initial = structuredClone(fresh);
  if (saved) {
    if ('winner' in initial) initial.winner = 'c';
    else initial.out = 'c';
    initial.hands.a =
      test.module.id === 'rummikub'
        ? { tiles: 7, jokers: 1 }
        : { numbers: 12, actions: 1, wilds: 1 };
    if (initial.left) initial.left.a = 82;
  }
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(
    mount(WinnerDraftHarness, { target, props: { Editor: test.Editor, ctx, initial, fresh } }),
  );
  flushSync();
  return { target, ctx, initial, fresh };
}

function draft(target: HTMLElement): Draft {
  return JSON.parse(target.querySelector('[data-draft]')!.textContent!);
}

function click(target: HTMLElement, selector: string) {
  target.querySelector<HTMLButtonElement>(selector)!.click();
  flushSync();
}

function toggle(target: HTMLElement, seat: number) {
  const row = target.querySelectorAll<HTMLElement>('.prow')[seat];
  row.querySelector<HTMLButtonElement>('[aria-pressed]')!.click();
  flushSync();
}

function enter(target: HTMLElement, test: (typeof cases)[number], seat = 'A', values = test.values) {
  for (const [i, label] of test.labels.entries()) {
    const field = target.querySelector<HTMLInputElement>(`[aria-label="${seat} ${label}"]`)!;
    field.value = String(values[i]);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  }
}

function values(target: HTMLElement, test: (typeof cases)[number], seat = 'A') {
  return test.labels.map((label) =>
    Number(target.querySelector<HTMLInputElement>(`[aria-label="${seat} ${label}"]`)!.value),
  );
}

beforeEach(() => {
  settings.update((value) => ({ ...value, motion: 'reduce' }));
});

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe.each(cases)('$module.id mistaken-winner recovery ($config)', (test) => {
  it.each([false, true])('restores on/off and repeated A-to-B corrections, saved=%s', (saved) => {
    const { target, ctx, initial } = render(test, saved);
    if (!saved) enter(target, test);
    const original = structuredClone(initial);
    toggle(target, 0);
    expect(Object.values(draft(target).hands.a)).toEqual(test.values.map(() => 0));
    expect(target.querySelector(`[aria-label="A ${test.labels[0]}"]`)).toBeNull();
    toggle(target, 0);
    expect(values(target, test)).toEqual(test.values);
    for (let i = 0; i < 3; i++) {
      toggle(target, 0);
      toggle(target, 1);
      expect(values(target, test)).toEqual(test.values);
      expect(Object.values(draft(target).hands.b)).toEqual(test.values.map(() => 0));
    }
    toggle(target, 2);
    const corrected = draft(target);
    expect(test.module.validateRound(corrected, ctx)).toBeNull();
    const value = test.module.id === 'rummikub' ? (test.config.jokerValue === 0 ? 7 : 37) : 82;
    expect(test.module.scoreRound(corrected, ctx)).toEqual(
      test.module.id === 'uno'
        ? { a: 0, b: 0, c: value }
        : test.module.id === 'unogolf'
          ? { a: value, b: 0, c: 0 }
          : { a: -value, b: 0, c: value },
    );
    expect(Object.keys(corrected).sort()).toEqual(Object.keys(initial).sort());
    expect(initial).toEqual(original);
  });

  it('keeps explicit clears and replacement drafts destructive', () => {
    const { target, fresh } = render(test);
    enter(target, test);
    toggle(target, 0);
    click(target, '[data-clear-hand]');
    toggle(target, 0);
    expect(values(target, test)).toEqual(test.values.map(() => 0));
    enter(target, test);
    toggle(target, 0);
    click(target, '[data-reset]');
    toggle(target, 0);
    toggle(target, 0);
    expect(draft(target)).toEqual(fresh);
    if (test.module.id === 'rummikub') {
      enter(target, test);
      click(target, '.prow .clear');
      toggle(target, 0);
      toggle(target, 0);
      expect(values(target, test)).toEqual([0, 0]);
    }
  });

  it('keeps pristine toggles pristine and captures revised values, not stale backups', () => {
    const { target, fresh } = render(test);
    toggle(target, 0);
    toggle(target, 0);
    expect(draft(target)).toEqual(fresh);
    enter(target, test);
    toggle(target, 0);
    toggle(target, 0);
    const revised = test.values.map((n) => n + 1);
    enter(target, test, 'A', revised);
    toggle(target, 0);
    toggle(target, 1);
    expect(values(target, test)).toEqual(revised);
  });
});
