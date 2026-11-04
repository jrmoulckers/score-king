import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankDef } from '../lib/games/custom/types';
import { customGameDefs, saveCustomGame } from '../lib/stores/customGames';
import CustomGameEdit from './CustomGameEdit.svelte';

vi.mock('../lib/stores/customGames', async () => {
  const { writable } = await import('svelte/store');
  return {
    customGameDefs: writable([]),
    customGamesLoaded: writable(true),
    saveCustomGame: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock('../lib/router', () => ({ navigate: vi.fn(), link: vi.fn() }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/motion', () => ({ animateMotion: vi.fn() }));
vi.mock('../lib/stores/toast', () => ({ showToast: vi.fn() }));

let component: ReturnType<typeof mount> | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  customGameDefs.set([]);
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.replaceChildren();
});

function setValue(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

describe('custom game player bounds', () => {
  it.each([false, true])(
    'keeps separately wrapping bounds and validation in edit mode %s',
    async (editing) => {
      const def = { ...blankDef(), name: 'Limits test', minPlayers: 2, maxPlayers: 8 };
      if (editing) customGameDefs.set([def]);
      const target = document.createElement('div');
      document.body.appendChild(target);
      component = mount(CustomGameEdit, {
        target,
        props: editing ? { id: def.id } : {},
      });
      flushSync();
      if (!editing) {
        setValue(target.querySelector<HTMLInputElement>('[aria-label="Game name"]')!, def.name);
      }

      const bounds = target.querySelector<HTMLElement>('.player-bounds')!;
      expect(bounds.classList.contains('wrap')).toBe(true);
      expect(bounds.children).toHaveLength(2);
      for (const [index, label] of ['min', 'max'].entries()) {
        const region = bounds.children[index];
        expect(region.classList.contains('wrap')).toBe(true);
        expect(region.querySelector('.muted')?.textContent).toBe(label);
        expect(region.querySelectorAll('.stepper')).toHaveLength(1);
      }
      const [min, max] = bounds.querySelectorAll<HTMLInputElement>('input');
      const save = target.querySelector<HTMLButtonElement>('.actions .primary')!;
      expect([min.value, max.value]).toEqual(['2', '8']);
      expect([min.min, min.max, min.step, max.min, max.max, max.step]).toEqual([
        '1',
        '99',
        '1',
        '1',
        '99',
        '1',
      ]);

      bounds.querySelectorAll<HTMLButtonElement>('button')[1].click();
      flushSync();
      expect(min.value).toBe('3');
      setValue(min, '9');
      expect(save.disabled).toBe(true);
      expect(target.querySelector('[role="alert"]')?.textContent).toContain('players');
      expect(saveCustomGame).not.toHaveBeenCalled();

      setValue(max, '12');
      expect(save.disabled).toBe(false);
      save.click();
      await tick();
      expect(saveCustomGame).toHaveBeenCalledWith(
        expect.objectContaining({ name: def.name, minPlayers: 9, maxPlayers: 12, step: 1 }),
      );
    },
  );
});

describe('custom game numeric control names', () => {
  const modes = [false, true].flatMap((editing) =>
    [false, true].flatMap((lowerIsBetter) =>
      (['counter', 'columns'] as const).map((inputShape) => ({
        editing,
        lowerIsBetter,
        inputShape,
      })),
    ),
  );

  it.each(modes)(
    'names fields and buttons: editing=$editing, low=$lowerIsBetter, shape=$inputShape',
    async ({ editing, lowerIsBetter, inputShape }) => {
      const def = {
        ...blankDef(),
        name: 'Named controls',
        lowerIsBetter,
        inputShape,
        columns: [{ key: 'points', label: 'Points', negative: false }],
      };
      if (editing) customGameDefs.set([def]);
      const target = document.createElement('div');
      document.body.appendChild(target);
      component = mount(CustomGameEdit, {
        target,
        props: editing ? { id: def.id } : {},
      });
      flushSync();
      if (!editing) {
        setValue(target.querySelector<HTMLInputElement>('[aria-label="Game name"]')!, def.name);
        for (const text of [
          lowerIsBetter ? 'Lowest wins' : 'Highest wins',
          inputShape === 'columns' ? 'Columns' : 'One number',
        ]) {
          const button = Array.from(target.querySelectorAll<HTMLButtonElement>('button')).find(
            (button) => button.textContent?.trim() === text,
          )!;
          button.click();
          flushSync();
        }
        if (inputShape === 'columns') {
          setValue(
            target.querySelector<HTMLInputElement>('[aria-label="Column 1 name"]')!,
            'Points',
          );
        }
      }

      const labels = [
        lowerIsBetter ? 'End the game at' : 'Target score',
        'Round limit',
        'Minimum players',
        'Maximum players',
        'Points per tap',
      ];
      const values = [120, 7, 3, 9, 4];
      const steppers = target.querySelectorAll<HTMLElement>('.stepper');
      expect(steppers).toHaveLength(labels.length);
      for (const [index, label] of labels.entries()) {
        const stepper = steppers[index];
        const input = stepper.querySelector<HTMLInputElement>('input')!;
        const [decrease, increase] = stepper.querySelectorAll<HTMLButtonElement>('button');
        expect(input.getAttribute('aria-label')).toBe(label);
        expect(decrease.getAttribute('aria-label')).toBe(`Decrease ${label}`);
        expect(increase.getAttribute('aria-label')).toBe(`Increase ${label}`);
        expect([decrease.tabIndex, input.tabIndex, increase.tabIndex]).toEqual([0, 0, 0]);
        expect([decrease, input, increase]).toEqual(Array.from(stepper.children));
        setValue(input, String(values[index]));
        increase.click();
        flushSync();
        expect(Number(input.value)).toBe(values[index] + Number(input.step));
        decrease.click();
        flushSync();
        expect(Number(input.value)).toBe(values[index]);
      }
      const visibleLabels = Array.from(
        target.querySelectorAll('.fieldlabel'),
        (el) => el.textContent,
      );
      expect(visibleLabels).toEqual(
        expect.arrayContaining([labels[0], 'Round limit', 'Players', 'Points per tap']),
      );
      target.querySelector<HTMLButtonElement>('.actions .primary')!.click();
      await tick();
      expect(saveCustomGame).toHaveBeenCalledWith(
        expect.objectContaining({
          name: def.name,
          lowerIsBetter,
          inputShape,
          target: 120,
          roundLimit: 7,
          minPlayers: 3,
          maxPlayers: 9,
          step: 4,
        }),
      );
    },
  );
});
