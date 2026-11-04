import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoundContext } from '../../types';
import { settings } from '../../stores/settings';
import { EVAL_CATEGORIES, emptySeason, type StardewSeasonInput } from './logic';
import StardewEditorHarness from './StardewEditorHarness.svelte';

const mounted: ReturnType<typeof mount>[] = [];

function render(initial = emptySeason(), roundIndex = 0) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const config = { years: 4, targetCandles: 4 };
  const ctx: RoundContext = {
    game: {
      id: 'synthetic-stardew',
      type: 'stardew',
      config,
      playerIds: ['qa'],
      status: 'active',
      createdAt: 1,
      roundCount: 2,
    },
    players: [
      {
        id: 'qa',
        name: 'AlexandriaLongUnbrokenNameForSyntheticQA',
        color: '#7c5cff',
        createdAt: 1,
      },
    ],
    config,
    roundIndex,
    totals: { qa: roundIndex ? 4 : 0 },
    rounds: [0, 1].map((index) => ({
      id: `season-${index}`,
      gameId: 'synthetic-stardew',
      index,
      input: { bundles: 1, goals: 1, fish: 1, gold: 1 },
      deltas: { qa: 4 },
      createdAt: 1,
    })),
  };
  mounted.push(mount(StardewEditorHarness, { target, props: { ctx, initial } }));
  flushSync();
  return target;
}

function draft(target: HTMLElement): StardewSeasonInput {
  return JSON.parse(target.querySelector('[data-draft]')!.textContent!);
}

beforeEach(() => {
  settings.update((value) => ({ ...value, motion: 'reduce' }));
});

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
  settings.update((value) => ({ ...value, motion: 'system' }));
});

describe('Stardew category entry regions', () => {
  it('separates each readable label and description from its tally and stepper', () => {
    const target = render();
    const rows = [...target.querySelectorAll('.crow')];
    expect(rows).toHaveLength(EVAL_CATEGORIES.length);
    rows.forEach((row, index) => {
      const category = EVAL_CATEGORIES[index];
      expect(row.querySelector('.label strong')?.textContent).toBe(category.label);
      expect(row.querySelector('.label .hint')?.textContent).toBe(category.hint);
      expect(row.querySelector(':scope > .tally')?.textContent?.trim()).toBe(`0/${category.cap}`);
      const controls = row.querySelector(':scope > .category-stepper')!;
      expect(controls.querySelector('input')?.getAttribute('aria-label')).toBe(category.label);
      expect(controls.querySelectorAll('button')).toHaveLength(2);
    });
  });

  it('keeps season input and cumulative tallies distinct while editing with prior seasons', () => {
    const target = render({ bundles: 2, goals: 1, fish: 2, gold: 1 }, 1);
    const rows = [...target.querySelectorAll('.crow')];
    rows.forEach((row, index) => {
      const category = EVAL_CATEGORIES[index];
      const field = row.querySelector<HTMLInputElement>('input')!;
      expect(Number(field.max)).toBe(category.cap - 1);
      expect(row.querySelector('.tally')?.textContent?.trim()).toBe(
        `${Number(field.value) + 1}/${category.cap}`,
      );
    });
    target.querySelector<HTMLButtonElement>('[aria-label="Increase Bundles restored"]')!.click();
    flushSync();
    expect(draft(target).bundles).toBe(3);
    expect(rows[0].querySelector('.tally')?.textContent?.trim()).toBe('4/6');
  });

  it('preserves completion cues, category caps and decrement behavior for every category', () => {
    const initial = Object.fromEntries(EVAL_CATEGORIES.map((c) => [c.key, c.cap]));
    const target = render({ ...emptySeason(), ...initial });
    for (const category of EVAL_CATEGORIES) {
      const increase = target.querySelector<HTMLButtonElement>(
        `[aria-label="Increase ${category.label}"]`,
      )!;
      const row = increase.closest('.crow')!;
      expect(increase.disabled).toBe(true);
      expect(row.querySelector('.tally.maxed .sr-only')?.textContent).toBe('— complete');
      expect(row.querySelector('.check')?.getAttribute('aria-hidden')).toBe('true');
      target
        .querySelector<HTMLButtonElement>(`[aria-label="Decrease ${category.label}"]`)!
        .click();
      flushSync();
      expect(draft(target)[category.key]).toBe(category.cap - 1);
      expect(increase.disabled).toBe(false);
      expect(row.querySelector('.tally.maxed')).toBeNull();
    }
  });
});
