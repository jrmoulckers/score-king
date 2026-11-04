import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { RoundContext } from '../../types';
import { PALETTE, PLAYER_COLOR_CHOICES } from '../../util';
import CornholeEditor from './CornholeEditor.svelte';
import editorSource from './CornholeEditor.svelte?raw';
import { cornhole } from './index';
import { type CornholeInput, defaultTeams } from './logic';

const mounted: ReturnType<typeof mount>[] = [];
const players = [
  { id: 'a', name: 'Aces', color: PALETTE[0], createdAt: 1 },
  { id: 'b', name: 'Bombers', color: PALETTE[1], createdAt: 1 },
];

function render(colors = [PALETTE[0], PALETTE[1]]) {
  const ctx: RoundContext = {
    game: {
      id: 'palette-test',
      type: 'cornhole',
      playerIds: ['a', 'b'],
      config: {},
      status: 'active',
      roundCount: 0,
      createdAt: 1,
    },
    players,
    config: {},
    roundIndex: 0,
    totals: {},
    rounds: [],
  };
  const teams = defaultTeams(players.map((p) => p.id)).map((t, i) => ({ ...t, color: colors[i] }));
  const input: CornholeInput = {
    teams,
    throws: Object.fromEntries(teams.map((t) => [t.id, { inHole: 1, onBoard: 1 }])),
  };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(CornholeEditor, { target, props: { ctx, input } }));
  flushSync();
  [...target.querySelectorAll('button')].find((b) => b.textContent?.includes('Sides'))!.click();
  flushSync();
  return { target, ctx, input };
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('Cornhole side colour controls', () => {
  it('names all existing colours distinctly for each side and exposes the selected choice', () => {
    const { target } = render();
    const groups = target.querySelectorAll('.palette');
    expect(groups).toHaveLength(2);
    for (const [i, group] of [...groups].entries()) {
      const side = i === 0 ? 'A' : 'B';
      expect(group.getAttribute('aria-label')).toBe(`Side ${side} colour`);
      const buttons = group.querySelectorAll('button');
      expect(buttons).toHaveLength(PALETTE.length);
      for (const [index, button] of [...buttons].entries()) {
        expect(button.getAttribute('aria-label')).toBe(
          `Side ${side} colour: ${PLAYER_COLOR_CHOICES[index].name}`,
        );
        expect(button.getAttribute('aria-pressed')).toBe(index === i ? 'true' : 'false');
        expect(button.querySelector('.colour-check')?.textContent ?? '').toBe(index === i ? '✓' : '');
      }
    }
    expect(
      new Set([...target.querySelectorAll('.dot')].map((b) => b.getAttribute('aria-label'))).size,
    ).toBe(24);
  });

  it('updates only the chosen side colour and preserves selection when Sides is reopened', () => {
    const { target, ctx, input } = render();
    const initial = structuredClone(input);
    const scores = cornhole.scoreRound(input, ctx);
    for (const side of [0, 1]) {
      const group = target.querySelectorAll('.palette')[side];
      for (const [i, choice] of PLAYER_COLOR_CHOICES.entries()) {
        group.querySelectorAll('button')[i].click();
        flushSync();
        expect(input.teams![side].color).toBe(choice.value);
        expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
        expect(group.querySelector('[aria-pressed="true"] .colour-check')?.textContent).toBe('✓');
        expect(group.querySelectorAll('button')[i].getAttribute('aria-pressed')).toBe('true');
        expect(input.teams![1 - side].color).toBe(side === 0 ? PALETTE[1] : PALETTE.at(-1));
        for (const [index, team] of input.teams!.entries()) {
          expect({ ...team, color: initial.teams![index].color }).toEqual(initial.teams![index]);
        }
        expect(input.throws).toEqual(initial.throws);
        expect(cornhole.scoreRound(input, ctx)).toEqual(scores);
      }
    }
    const toggle = target.querySelector<HTMLButtonElement>('[aria-expanded]')!;
    toggle.click();
    flushSync();
    toggle.click();
    flushSync();
    expect(target.querySelectorAll('.palette [aria-pressed="true"]')).toHaveLength(2);
    expect(target.querySelectorAll('.colour-check')).toHaveLength(2);
  });

  it('does not select a palette choice for an existing custom side colour', () => {
    const { target, input } = render(['#123456', PALETTE[1]]);
    const group = target.querySelector('.palette')!;
    expect(group.querySelector('[aria-pressed="true"]')).toBeNull();
    expect(group.querySelector('.colour-check')).toBeNull();
    expect(input.teams![0].color).toBe('#123456');
    group.querySelectorAll('button')[2].click();
    flushSync();
    expect(input.teams![0].color).toBe(PALETTE[2]);
    expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  });

  it('keeps a small swatch inside a nonshrinking 46px target with wrapping and theme-aware cues', () => {
    const rule = (selector: string) =>
      editorSource.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1];
    expect(rule('\\.palette')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('\\.dot')).toMatch(/flex:\s*0 0 46px/);
    expect(rule('\\.dot')).toMatch(/width:\s*46px/);
    expect(rule('\\.dot')).toMatch(/height:\s*46px/);
    expect(rule('\\.swatch')).toMatch(/width:\s*26px/);
    expect(rule('\\.dot\\.sel')).toMatch(/border-color:\s*var\(--text\)/);
    expect(rule('\\.colour-check')).toMatch(/color:\s*var\(--text\)/);
    expect(rule('\\.dot:focus-visible')).toMatch(/outline:\s*2px solid var\(--text\)/);
  });
});
