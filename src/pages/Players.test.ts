import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { Player } from '../lib/types';
import { players, refreshPlayers } from '../lib/stores/players';
import { settings } from '../lib/stores/settings';
import { updatePlayer } from '../lib/storage/db';
import Players from './Players.svelte';
import source from './Players.svelte?raw';

const fixture = vi.hoisted(() => ({ rows: [] as Player[] }));

vi.mock('../lib/storage/db', () => ({
  getAllPlayers: vi.fn(async () =>
    structuredClone(fixture.rows).sort((a, b) => a.name.localeCompare(b.name)),
  ),
  updatePlayer: vi.fn(async (player: Player) => {
    const saved = structuredClone(player);
    fixture.rows = fixture.rows.map((row) => (row.id === player.id ? saved : row));
  }),
}));

vi.mock('../lib/motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/motion')>();
  return { ...actual, animateMotion: vi.fn(), popIn: vi.fn(), prefersReducedMotion: () => true };
});

const names = [
  'Sam',
  'Alexandria Catherine Montgomery-Williams',
  'AlexandriaLongUnbrokenNameForSyntheticQA',
];
let component: ReturnType<typeof mount>;
let target: HTMLDivElement;

beforeEach(async () => {
  await refreshPlayers();
  fixture.rows = names.map((name, index) => ({
    id: `roster-${index}`,
    name,
    color: '#7c5cff',
    createdAt: 1,
    claimed: index !== 2,
  }));
  players.set(structuredClone(fixture.rows));
  settings.update((value) => ({ ...value, leadMemberId: null }));
  target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(Players, { target });
  flushSync();
});

afterEach(async () => {
  await unmount(component);
  fixture.rows = [];
  vi.clearAllMocks();
  players.set([]);
  settings.update((value) => ({ ...value, leadMemberId: null }));
  document.body.replaceChildren();
});

function card(index: number) {
  return [...target.querySelectorAll<HTMLElement>('.player-grid > .card')].find(
    (row) => row.querySelector('.avatar')?.getAttribute('aria-label') === names[index],
  )!;
}

async function click(button: HTMLButtonElement) {
  button.click();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  flushSync();
}

function button(text: string) {
  return [...target.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === text,
  )!;
}

describe('Players roster containment', () => {
  it('keeps full short, spaced and unbroken identities and lead/unclaimed tags', async () => {
    for (const [index, name] of names.entries()) {
      expect(card(index).querySelector('.who strong')?.textContent).toBe(name);
      expect(card(index).querySelector('.avatar')?.getAttribute('aria-label')).toBe(name);
      expect(card(index).querySelector('[aria-label="Edit player"]')).not.toBeNull();
    }
    await click(card(2).querySelector<HTMLButtonElement>('button[aria-pressed]')!);
    expect(card(2).querySelector('.lead-tag')?.textContent).toContain('On this device');
    expect(card(2).querySelector('.muted-tag')?.textContent).toBe('Unclaimed');
    const toggle = card(2).querySelector('button[aria-pressed]');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
  });

  it('preserves full editor names, gradient colors and save behavior', async () => {
    await click(card(2).querySelector<HTMLButtonElement>('[aria-label="Edit player"]')!);
    expect(target.querySelector<HTMLInputElement>('[aria-label="Player name"]')?.value).toBe(
      names[2],
    );
    await click(button('Gradient'));
    expect(target.querySelector('[aria-label="Choose any second color"]')).not.toBeNull();
    expect(target.querySelectorAll('.custom-color')).toHaveLength(2);
    await click(button('Save profile'));
    expect(target.querySelector('.editing')).toBeNull();
    expect(card(2).querySelector('.avatar.gradient')).not.toBeNull();
    expect(get(players).find((player) => player.id === 'roster-2')).toMatchObject({
      name: names[2],
      claimed: true,
      appearance: { style: 'gradient', color2: '#1d4ed8' },
    });
  });

    describe('Players inline profile focus', () => {
      it('focuses the replacement name input and returns to the same player on Cancel', async () => {
        const opener = card(2).querySelector<HTMLButtonElement>('[aria-label="Edit player"]')!;
        opener.focus();
        await click(opener);
        const input = target.querySelector<HTMLInputElement>('[aria-label="Player name"]')!;
        expect(document.activeElement).toBe(input);
        input.value = 'Discarded draft';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await click(button('Gradient'));
        await click(button('Cancel'));
        expect(document.activeElement).toBe(
          card(2).querySelector<HTMLButtonElement>('[aria-label="Edit player"]'),
        );
        expect(get(players).find((player) => player.id === 'roster-2')?.name).toBe(names[2]);
        await click(document.activeElement as HTMLButtonElement);
        expect(document.activeElement).toBe(
          target.querySelector<HTMLInputElement>('[aria-label="Player name"]'),
        );
        expect(target.querySelector<HTMLInputElement>('[aria-label="Player name"]')?.value).toBe(
          names[2],
        );
        expect(button('Solid').getAttribute('aria-pressed')).toBe('true');
      });

      it('waits for async Save and follows the player id through name sorting', async () => {
        const update = vi.mocked(updatePlayer);
        const persist = update.getMockImplementation()!;
        let finish!: () => void;
        update.mockImplementationOnce(
          (player) =>
            new Promise<void>((resolve) => {
              finish = () => {
                void persist(player).then(resolve);
              };
            }),
        );
        await click(card(2).querySelector<HTMLButtonElement>('[aria-label="Edit player"]')!);
        const input = target.querySelector<HTMLInputElement>('[aria-label="Player name"]')!;
        input.value = 'ZZ Synthetic Renamed';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await click(button('Gradient'));
        await click(target.querySelector<HTMLButtonElement>('[aria-label="Use Fox badge"]')!);
        const save = button('Save profile');
        save.focus();
        await click(save);
        expect(document.activeElement).toBe(save);
        expect(target.querySelector('.editing')).not.toBeNull();
        finish();
        await vi.waitFor(() => expect(target.querySelector('.editing')).toBeNull());
        const lastCard = target.querySelector<HTMLElement>('.player-grid > .card:last-child')!;
        expect(lastCard.querySelector('.who strong')?.textContent).toBe('ZZ Synthetic Renamed');
        expect(document.activeElement).toBe(lastCard.querySelector('[aria-label="Edit player"]'));
        expect(get(players).find((player) => player.id === 'roster-2')).toMatchObject({
          name: 'ZZ Synthetic Renamed',
          appearance: { style: 'gradient', emoji: '🦊' },
        });
      });

      it('keeps invalid-image focus and draft recovery inside the inline editor', async () => {
        await click(card(0).querySelector<HTMLButtonElement>('[aria-label="Edit player"]')!);
        await click(
          [...target.querySelectorAll<HTMLButtonElement>('.style-choice')].find((element) =>
            element.textContent?.trim().endsWith('Image'),
          )!,
        );
        const url = target.querySelector<HTMLInputElement>('[aria-label="Image URL"]')!;
        url.value = 'invalid';
        url.dispatchEvent(new Event('input', { bubbles: true }));
        flushSync();
        const useUrl = button('Use URL');
        useUrl.focus();
        await click(useUrl);
        expect(document.activeElement).toBe(useUrl);
        expect(target.querySelector('[role="alert"]')?.textContent).toContain(
          'Enter a complete image URL',
        );
        expect(target.querySelector('[role="dialog"]')).toBeNull();
        await click(button('Cancel'));
        expect(document.activeElement).toBe(card(0).querySelector('[aria-label="Edit player"]'));
        await click(document.activeElement as HTMLButtonElement);
        expect(target.querySelector('[role="alert"]')).toBeNull();
        expect(target.querySelector<HTMLInputElement>('[aria-label="Player name"]')?.value).toBe(
          names[0],
        );
      });
    });

  it('keeps archived identities and restore/delete confirmation controls', async () => {
    await click(card(1).querySelector<HTMLButtonElement>('[aria-label="Edit player"]')!);
    await click(button('Archive'));
    await click(target.querySelector<HTMLButtonElement>('.archtoggle')!);
    expect(target.querySelector('.arch-name')?.textContent).toBe(names[1]);
    expect(target.querySelector('.card.arch .avatar')?.getAttribute('aria-label')).toBe(names[1]);
    const selector = `[aria-label="Delete ${names[1]} for good"]`;
    await click(target.querySelector<HTMLButtonElement>(selector)!);
    expect(button('Delete')).toBeDefined();
    await click(button('Cancel'));
    await click(button('Restore'));
    expect(card(1)).toBeDefined();
    expect(target.querySelector('.card.arch')).toBeNull();
  });

  it('contains grid tracks and the identity chain without clipping the card or editor', () => {
    const rule = (selector: string) =>
      source.match(new RegExp(`${selector.replaceAll('.', '\\.')}\\s*\\{([^}]+)\\}`))?.[1];
    expect(rule('.player-grid')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(rule('.card')).toContain('min-width: 0');
    expect(rule('.identity')).toContain('min-width: 0');
    expect(rule('.identity input')).toContain('min-width: 0');
    expect(rule('.who')).toContain('flex: 1');
    expect(rule('.who strong')).toContain('text-overflow: ellipsis');
    expect(rule('.arch-name')).toContain('text-overflow: ellipsis');
    expect(rule('.custom-color')).toContain('grid-column: span 2');
    expect(rule('.editactions')).toContain('flex-wrap: wrap');
    expect(rule('.card')).not.toMatch(/overflow:\s*(hidden|clip)/);
  });
});
