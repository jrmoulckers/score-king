import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { players, refreshPlayers } from '../stores/players';
import PlayerSelect from './PlayerSelect.svelte';
import source from './PlayerSelect.svelte?raw';

vi.mock('../storage/db', () => ({
  getAllPlayers: vi.fn().mockResolvedValue([]),
}));

const names = [
  'Sam',
  'Alexandria Catherine Montgomery-Williams',
  'Q'.repeat(40),
  ...Array.from({ length: 9 }, (_, i) => `Player ${i + 1}`),
];
let component: ReturnType<typeof mount> | undefined;

beforeEach(async () => {
  await refreshPlayers();
  players.set(
    names.map((name, i) => ({
      id: `player-${i}`,
      name,
      color: '#7c5cff',
      createdAt: i,
    })),
  );
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  players.set([]);
  document.body.replaceChildren();
});

function render(selected: string[] = []) {
  component = mount(PlayerSelect, { target: document.body, props: { selected, max: 12 } });
  flushSync();
  return [...document.querySelectorAll<HTMLButtonElement>('.chip')];
}

describe('player selection identities', () => {
  it('bounds chips and wraps names without truncating identity or shrinking selection ordinals', () => {
    expect(source).toMatch(/\.chip\s*\{[^}]*max-width:\s*100%/);
    expect(source).toMatch(/\.name\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere/);
    expect(source).toMatch(/\.ord\s*\{[^}]*flex:\s*none/);
    const chips = render(names.map((_, i) => `player-${i}`));
    chips.forEach((chip, i) => {
      expect(chip.querySelector('.name')?.textContent).toBe(names[i]);
      expect(chip.getAttribute('aria-pressed')).toBe('true');
      expect(chip.querySelector('.ord')?.textContent).toBe(String(i + 1));
      expect(chip.querySelector('.ord')?.getAttribute('aria-hidden')).toBe('true');
      expect(chip.querySelector('.avatar')?.getAttribute('aria-hidden')).toBe('true');
      expect(chip.hasAttribute('aria-label')).toBe(false);
      expect(chip.type).toBe('button');
      expect(chip.disabled).toBe(false);
    });
  });

  it('retains selection order when long names are deselected and selected again', () => {
    const chips = render();
    for (const index of [2, 0, 1]) flushSync(() => chips[index].click());
    expect(chips.map((chip) => chip.querySelector('.ord')?.textContent).slice(0, 3)).toEqual([
      '2',
      '3',
      '1',
    ]);
    flushSync(() => chips[2].click());
    expect(chips[2].getAttribute('aria-pressed')).toBe('false');
    expect(chips[2].querySelector('.ord')).toBeNull();
    flushSync(() => chips[2].click());
    expect(chips.map((chip) => chip.querySelector('.ord')?.textContent).slice(0, 3)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(chips[2].querySelector('.name')?.textContent).toBe(names[2]);
  });
});
