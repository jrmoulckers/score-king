import { flushSync, mount, unmount, type Component } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameModule, RoundContext, RoundEditorProps } from '../types';
import { defaultConfig } from '../types';
import { settings } from '../stores/settings';
import IdentityEditorHarness from './IdentityEditorHarness.svelte';
import WizardEditor from './wizard/WizardEditor.svelte';
import SpadesEditor from './spades/SpadesEditor.svelte';
import EuchreEditor from './euchre/EuchreEditor.svelte';
import FindingFriendsEditor from './findingfriends/FindingFriendsEditor.svelte';
import HoldemEditor from './holdem/HoldemEditor.svelte';
import TwoRoomsEditor from './tworooms/TwoRoomsEditor.svelte';
import CustomRoundEditor from './custom/CustomRoundEditor.svelte';
import { wizard } from './wizard';
import { spades } from './spades';
import { euchre } from './euchre';
import { findingFriends } from './findingfriends';
import { holdem } from './holdem';
import { tworooms } from './tworooms';
import { buildCustomModule } from './custom/factory';
import { blankDef } from './custom/types';
import { setCustomDefsRegistry } from './custom/defRegistry';
import wizardSource from './wizard/WizardEditor.svelte?raw';
import spadesSource from './spades/SpadesEditor.svelte?raw';
import euchreSource from './euchre/EuchreEditor.svelte?raw';
import friendsSource from './findingfriends/FindingFriendsEditor.svelte?raw';
import holdemSource from './holdem/HoldemEditor.svelte?raw';
import roomsSource from './tworooms/TwoRoomsEditor.svelte?raw';
import customSource from './custom/CustomRoundEditor.svelte?raw';

const mounted: ReturnType<typeof mount>[] = [];
const names = [
  'Alex',
  'AlexandriaLongUnbrokenNameForSyntheticQA',
  'Alexandria Long Spaced Name Synthetic QA',
];

function render(module: GameModule, Editor: Component<RoundEditorProps>, name: string) {
  const config = defaultConfig(module.configFields);
  if (module.id === 'holdem') config.unit = 'chips';
  const players = Array.from({ length: module.minPlayers }, (_, i) => ({
    id: `p${i}`,
    name: i ? `Player ${i + 1}` : name,
    color: '#7c5cff',
    createdAt: 1,
  }));
  const ctx: RoundContext = {
    game: {
      id: 'identity-test',
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
  const initial = module.createRoundInput(ctx);
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(IdentityEditorHarness, { target, props: { Editor, ctx, initial } }));
  flushSync();
  return { target, ctx, initial };
}

function click(target: HTMLElement, selector: string) {
  target.querySelector<HTMLButtonElement>(selector)!.click();
  flushSync();
}

function draft(target: HTMLElement): RoundEditorProps['input'] {
  return JSON.parse(target.querySelector('[data-draft]')!.textContent!);
}

beforeEach(() => {
  settings.update((value) => ({ ...value, motion: 'reduce' }));
});

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
  setCustomDefsRegistry([]);
});

describe('local editor identity containment', () => {
  it.each([
    [wizardSource, '.who', '.who strong'],
    [spadesSource, '.who', '.who strong'],
    [euchreSource, '.teambtn', '.names'],
    [friendsSource, '.chip', '.chipname'],
    [holdemSource, '.pchip', '.chipname'],
    [roomsSource, '.chip', '.chipname'],
    [customSource, '.who', '.who strong'],
  ])('bounds and wraps complete identity text', (source, item, text) => {
    function rule(selector: string) {
      const start = source.indexOf(`  ${selector} {`);
      return source.slice(start).split('}')[0];
    }
    expect(rule(item)).toContain('min-width: 0');
    expect(rule(text)).toContain('overflow-wrap: anywhere');
    expect(rule(text)).not.toContain('text-overflow: ellipsis');
    expect(rule(text)).not.toContain('white-space: nowrap');
  });

  it.each(names)('preserves Wizard bids and tricks for %s', (name) => {
    const { target, ctx } = render(wizard, WizardEditor, name);
    expect(target.querySelector('.who strong')!.textContent).toBe(name);
    click(target, `[aria-label="Increase ${name} bid"]`);
    click(target, `[aria-label="Increase ${name} tricks"]`);
    const expected = {
      rows: Object.fromEntries(
        ctx.players.map((p, i) => [p.id, { bid: i ? 0 : 1, tricks: i ? 0 : 1 }]),
      ),
    };
    expect(draft(target)).toEqual(expected);
    expect(wizard.validateRound(draft(target), ctx)).toBeNull();
    expect(wizard.scoreRound(draft(target), ctx).p0).toBe(30);
    expect(target.querySelector('.proj')!.textContent?.trim()).toBe('+30');
  });

  it.each(names)('preserves Spades Nil and names for %s', (name) => {
    const { target, ctx, initial } = render(spades, SpadesEditor, name);
    expect(target.querySelector('.who strong')!.textContent).toBe(name);
    click(target, '.toggle');
    expect(draft(target).rows.p0.nil).toBe('nil');
    expect(target.querySelector<HTMLInputElement>(`[aria-label="${name} tricks"]`)).not.toBeNull();
    click(target, '.toggle');
    expect(draft(target)).toEqual(initial);
    expect(spades.scoreRound(draft(target), ctx)).toEqual(spades.scoreRound(initial, ctx));
  });

  it.each(names)('preserves Euchre teams and lone caller for %s', (name) => {
    const { target, ctx } = render(euchre, EuchreEditor, name);
    expect(target.querySelector('.names')!.textContent).toBe(`${name} & Player 2`);
    click(target, '.teambtn');
    click(target, '.alonebtn');
    expect(target.querySelector('.whoname')!.textContent).toBe(name);
    click(target, '.whobtn');
    click(target, '.resbtn:nth-child(2)');
    const expected = {
      teams: [
        ['p0', 'p1'],
        ['p2', 'p3'],
      ],
      maker: 0,
      alone: true,
      alonePlayer: 'p0',
      result: 'march',
    };
    expect(draft(target)).toEqual(expected);
    expect(euchre.validateRound(draft(target), ctx)).toBeNull();
    expect(euchre.scoreRound(draft(target), ctx)).toEqual({ p0: 4, p1: 4, p2: 0, p3: 0 });
    expect(target.querySelector('.cel-cheer')!.textContent).toContain(name);
  });

  it.each(names)('preserves Finding Friends sides and points for %s', (name) => {
    const { target, ctx } = render(findingFriends, FindingFriendsEditor, name);
    expect(target.querySelector('.chipname')!.textContent).toBe(name);
    click(target, '.chip');
    expect(draft(target).challengers).toContain('p0');
    click(target, '.chip');
    click(target, '.qbtn');
    const expected = {
      declarers: ['p0'],
      challengers: ['p1', 'p2', 'p3'],
      pointsCaptured: 0,
    };
    expect(draft(target)).toEqual(expected);
    expect(findingFriends.validateRound(draft(target), ctx)).toBeNull();
    expect(findingFriends.scoreRound(draft(target), ctx)).toEqual(
      findingFriends.scoreRound(expected, ctx),
    );
    expect(target.querySelector('.cel-cheer')!.textContent).toContain(name);
  });

  it.each(names)('preserves Holdem buy-in identity and amount for %s', (name) => {
    const { target, ctx } = render(holdem, HoldemEditor, name);
    expect(target.querySelector('.chipname')!.textContent).toBe(name);
    click(target, '.pchip:nth-child(2)');
    click(target, '[aria-label="Increase Buy-in amount"]');
    const expected = {
      kind: 'buyin',
      playerId: 'p1',
      amount: Number(ctx.config.defaultBuyin) + 1,
    };
    expect(draft(target)).toEqual(expected);
    expect(holdem.validateRound(draft(target), ctx)).toBeNull();
    expect(holdem.scoreRound(draft(target), ctx)).toEqual(holdem.scoreRound(expected, ctx));
  });

  it.each(names)('preserves Two Rooms leaders and hostages for %s', (name) => {
    const { target, ctx } = render(tworooms, TwoRoomsEditor, name);
    expect(target.querySelector('.chipname')!.textContent).toBe(name);
    click(target, '.room .chip');
    expect(target.querySelector('.ledby')!.textContent).toContain(name);
    click(target, '[aria-label="Increase from Room 1 to Room 2"]');
    const expected = {
      leader1: 'p0',
      leader2: null,
      sent1: 2,
      sent2: 1,
      reveal: { winner: null, winners: [], president: null, bomber: null },
    };
    expect(draft(target)).toEqual(expected);
    expect(tworooms.validateRound(draft(target), ctx)).toBeNull();
    expect(tworooms.scoreRound(draft(target), ctx)).toEqual(tworooms.scoreRound(expected, ctx));
  });

  it.each(['counter', 'columns'] as const)('preserves custom %s values and labels', (shape) => {
    for (const name of names) {
      const def = {
        ...blankDef(),
        name: 'Identity test',
        inputShape: shape,
        columns: [{ key: 'points', label: 'Points' }],
      };
      setCustomDefsRegistry([def]);
      const module = buildCustomModule(def);
      const { target, ctx } = render(module, CustomRoundEditor, name);
      expect(target.querySelector('.who strong')!.textContent).toBe(name);
      const label = shape === 'counter' ? name : `${name} Points`;
      click(target, `[aria-label="Increase ${label}"]`);
      const key = shape === 'counter' ? 'v' : 'points';
      const expected = {
        values: Object.fromEntries(ctx.players.map((p, i) => [p.id, { [key]: i ? 0 : 1 }])),
      };
      expect(draft(target)).toEqual(expected);
      expect(module.validateRound(draft(target), ctx)).toBeNull();
      expect(module.scoreRound(draft(target), ctx)).toEqual({ p0: 1, p1: 0 });
    }
  });
});
