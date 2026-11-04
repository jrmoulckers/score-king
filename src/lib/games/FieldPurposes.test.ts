import { flushSync, mount, unmount, type Component } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameModule, RoundContext, RoundEditorProps } from '../types';
import { defaultConfig } from '../types';
import IdentityEditorHarness from './IdentityEditorHarness.svelte';
import FindingFriendsEditor from './findingfriends/FindingFriendsEditor.svelte';
import WerewordsEditor from './werewords/WerewordsEditor.svelte';
import { findingFriends } from './findingfriends';
import { werewords } from './werewords';

const mounted: ReturnType<typeof mount>[] = [];

function render(module: GameModule, Editor: Component<RoundEditorProps>) {
  const config = defaultConfig(module.configFields);
  const players = Array.from({ length: 4 }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i + 1}`,
    color: '#7c5cff',
    createdAt: 1,
  }));
  const ctx: RoundContext = {
    game: {
      id: 'field-purpose-test',
      type: module.id,
      playerIds: players.map((p) => p.id),
      config,
      status: 'active',
      roundCount: 0,
      createdAt: 1,
    },
    players,
    config,
    roundIndex: 0,
    totals: {},
    rounds: [],
  };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(
    mount(IdentityEditorHarness, {
      target,
      props: { Editor, ctx, initial: module.createRoundInput(ctx) },
    }),
  );
  flushSync();
  return { target, ctx };
}

function purpose(field: HTMLInputElement) {
  const ids = field.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
  expect(ids).toHaveLength(1);
  const label = document.getElementById(ids[0]);
  expect(label).not.toBeNull();
  return label!.textContent!.trim();
}

function enter(field: HTMLInputElement, value: string) {
  field.focus();
  expect(document.activeElement).toBe(field);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

function draft(target: HTMLElement) {
  return JSON.parse(target.querySelector('[data-draft]')!.textContent!);
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('round field purposes', () => {
  it('associates the visible secret-word purpose before and after typing without changing outcomes', () => {
    const { target, ctx } = render(werewords, WerewordsEditor);
    const field = target.querySelector<HTMLInputElement>('.spell-input')!;
    expect(purpose(field)).toBe('🔮 The secret word');
    expect(werewords.validateRound(draft(target), ctx)).toContain('secret magic word');
    enter(field, 'Pyramid');
    expect(purpose(field)).toBe('🔮 The secret word');
    expect(field.placeholder).toBe('e.g. PYRAMID');
    expect(draft(target).word).toBe('Pyramid');
    target.querySelector<HTMLButtonElement>('[aria-label="Player 1: Werewolf"]')!.click();
    flushSync();
    expect(werewords.validateRound(draft(target), ctx)).toBeNull();
    expect(werewords.scoreRound(draft(target), ctx)).toEqual({ p0: 0, p1: 1, p2: 1, p3: 1 });
    target.querySelector<HTMLButtonElement>('[aria-label="Player 2: Seer"]')!.click();
    flushSync();
    target.querySelector<HTMLButtonElement>('.twist')!.click();
    flushSync();
    expect(werewords.scoreRound(draft(target), ctx)).toEqual({ p0: 1, p1: 0, p2: 0, p3: 0 });
    expect(purpose(field)).toBe('🔮 The secret word');
  });

  it('associates captured points with the challengers while preserving bounds, clearing and scoring', () => {
    const { target, ctx } = render(findingFriends, FindingFriendsEditor);
    const field = target.querySelector<HTMLInputElement>('.numinput')!;
    const label = 'Points the challengers captured (5s, 10s, Ks)';
    expect(purpose(field)).toBe(label);
    expect([field.min, field.max, field.step, field.placeholder]).toEqual([
      '0',
      '200',
      '5',
      'Exact points',
    ]);
    enter(field, '125');
    expect(draft(target).pointsCaptured).toBe(125);
    expect(purpose(field)).toBe(label);
    expect(findingFriends.scoreRound(draft(target), ctx)).toEqual({ p0: 0, p1: 1, p2: 1, p3: 1 });
    enter(field, '250');
    expect(draft(target).pointsCaptured).toBe(200);
    expect(findingFriends.scoreRound(draft(target), ctx)).toEqual({ p0: 0, p1: 3, p2: 3, p3: 3 });
    enter(field, '-5');
    expect(draft(target).pointsCaptured).toBe(0);
    expect(findingFriends.scoreRound(draft(target), ctx)).toEqual({ p0: 3, p1: 0, p2: 0, p3: 0 });
    enter(field, '');
    expect(draft(target).pointsCaptured).toBeNull();
    expect(findingFriends.validateRound(draft(target), ctx)).toContain('points');
    expect(purpose(field)).toBe(label);
  });

  it.each([
    [werewords, WerewordsEditor, '.spell-input'],
    [findingFriends, FindingFriendsEditor, '.numinput'],
  ] as const)(
    'keeps label references unique for simultaneous %s editors',
    (module, Editor, selector) => {
      const first = render(module, Editor).target.querySelector<HTMLInputElement>(selector)!;
      const second = render(module, Editor).target.querySelector<HTMLInputElement>(selector)!;
      expect(first.getAttribute('aria-labelledby')).not.toBe(second.getAttribute('aria-labelledby'));
      expect(purpose(first)).toBe(purpose(second));
    },
  );
});
