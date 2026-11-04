import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundContext } from '../../types';
import { skullking } from './index';
import { bountyTotal, emptyBounty, type SKInput } from './logic';
import SkullKingEditorHarness from './SkullKingEditorHarness.svelte';
import source from './SkullKingEditor.svelte?raw';

vi.mock('../../motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../motion')>();
  return { ...actual, animateMotion: vi.fn() };
});

const mounted: ReturnType<typeof mount>[] = [];
const keys = ['jollyRoger', 'mermaidCatchesSK', 'skOverMermaid'] as const;
const ctx: RoundContext = {
  game: {
    id: 'bounty-test',
    type: 'skullking',
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

function render(initial: SKInput) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(SkullKingEditorHarness, { target, props: { ctx, initial } }));
  flushSync();
  return target;
}

function click(button: HTMLButtonElement) {
  button.click();
  flushSync();
}

function draft(target: HTMLElement): SKInput {
  return JSON.parse(target.querySelector('[data-draft]')!.textContent!) as SKInput;
}

function chips(target: HTMLElement) {
  return [...target.querySelectorAll<HTMLButtonElement>('.chip')];
}

function assertState(button: HTMLButtonElement, selected: boolean) {
  expect(button.getAttribute('aria-pressed')).toBe(String(selected));
  expect(button.classList.contains('on')).toBe(selected);
  const check = button.querySelector('.check');
  if (selected) {
    expect(check?.textContent).toBe('✓');
    expect(check?.getAttribute('aria-hidden')).toBe('true');
  } else {
    expect(check).toBeNull();
  }
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('Skull King capture toggle state', () => {
  it('exposes on/off state for all captures and preserves multiple selections and scoring', () => {
    const initial = skullking.createRoundInput(ctx) as SKInput;
    initial.rows.a.bid = 1;
    initial.rows.a.actual = 1;
    const target = render(initial);
    const tray = target.querySelector<HTMLButtonElement>('.bounty-toggle')!;
    expect(tray.getAttribute('aria-expanded')).toBe('false');
    click(tray);
    const buttons = chips(target);
    expect(buttons).toHaveLength(3);
    buttons.forEach((button) => assertState(button, false));

    buttons.forEach((button, i) => {
      click(button);
      assertState(button, true);
      expect(draft(target).rows.a.bounty?.[keys[i]]).toBe(true);
    });
    expect(bountyTotal(draft(target).rows.a.bounty)).toBe(110);
    expect(draft(target).rows.a.bonus).toBe(110);
    expect(skullking.scoreRound(draft(target), ctx)).toEqual({ a: 130, b: 10 });
    expect(skullking.validateRound(draft(target), ctx)).toBeNull();
    expect(draft(target).rows.b.bounty).toEqual(emptyBounty());

    click(tray);
    expect(chips(target)).toHaveLength(0);
    click(tray);
    chips(target).forEach((button) => {
      assertState(button, true);
      click(button);
      assertState(button, false);
    });
    expect(draft(target).rows.a.bounty).toEqual(emptyBounty());
    expect(draft(target).rows.a.bonus).toBe(0);
    expect(skullking.scoreRound(draft(target), ctx)).toEqual({ a: 20, b: 10 });
  });

  it('restores populated editing state without resetting other bounty entries or bid gating', () => {
    const initial = skullking.createRoundInput(ctx) as SKInput;
    initial.rows.a.bid = 1;
    initial.rows.a.bounty = {
      ...emptyBounty(),
      jollyRoger: true,
      skOverMermaid: true,
      fourteens: 2,
      pirates: 1,
      manual: 10,
    };
    const expected = structuredClone(initial.rows.a.bounty);
    const target = render(initial);
    const tray = target.querySelector<HTMLButtonElement>('.bounty-toggle')!;
    click(tray);
    chips(target).forEach((button, i) => assertState(button, expected[keys[i]]));
    expect(draft(target).rows.a.bounty).toEqual(expected);
    expect(draft(target).rows.a.bonus).toBe(130);
    expect(skullking.scoreRound(draft(target), ctx).a).toBe(-10);
    expect(
      skullking.scoreRound(draft(target), {
        ...ctx,
        config: { bonusesRequireBid: false },
      }).a,
    ).toBe(120);
    click(chips(target)[0]);
    expect(draft(target).rows.a.bounty).toEqual({ ...expected, jollyRoger: false });
    click(tray);
    click(tray);
    chips(target).forEach((button, i) => assertState(button, i === 2));
  });

  it('keeps legacy numeric bounty editable and retains the existing 46px targets', () => {
    const initial = skullking.createRoundInput(ctx) as SKInput;
    delete initial.rows.a.bounty;
    initial.rows.a.bonus = 35;
    const target = render(initial);
    click(target.querySelector<HTMLButtonElement>('.bounty-toggle')!);
    chips(target).forEach((button) => assertState(button, false));
    click(chips(target)[1]);
    expect(draft(target).rows.a.bounty?.manual).toBe(35);
    expect(draft(target).rows.a.bonus).toBe(75);
    expect(source).toMatch(/\.chip\s*\{[^}]*min-height: 46px/);
  });
});
