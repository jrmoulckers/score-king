import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundContext } from '../../types';
import { skullking } from './index';
import { BONUS_VALUES, type SKInput } from './logic';
import SkullKingEditorHarness from './SkullKingEditorHarness.svelte';

vi.mock('../../motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../motion')>();
  return { ...actual, animateMotion: vi.fn() };
});

const mounted: ReturnType<typeof mount>[] = [];
const dialogMethods = {
  showModal: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal'),
  close: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close'),
};
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
        this.dispatchEvent(new Event('close'));
      },
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
  for (const name of ['showModal', 'close'] as const) {
    const descriptor = dialogMethods[name];
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  if (scrollIntoView)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  vi.restoreAllMocks();
});

function render(config: Record<string, unknown> = {}, roundIndex = 4) {
  const ctx: RoundContext = {
    game: {
      id: 'help-test',
      type: 'skullking',
      playerIds: ['a', 'b'],
      config,
      status: 'active',
      createdAt: 1,
      roundCount: roundIndex,
    },
    players: ['a', 'b'].map((id) => ({
      id,
      name: id.toUpperCase(),
      color: '#7c5cff',
      createdAt: 1,
    })),
    config,
    roundIndex,
    totals: { a: 10, b: 20 },
    rounds: [],
  };
  const initial = skullking.createRoundInput(ctx) as SKInput;
  initial.rows.a.bid = 2;
  initial.rows.a.actual = 1;
  const target = document.createElement('div');
  document.body.append(target);
  mounted.push(mount(SkullKingEditorHarness, { target, props: { ctx, initial } }));
  flushSync();
  const opener = target.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!;
  opener.focus();
  return { target, opener };
}

async function click(button: HTMLButtonElement) {
  button.click();
  flushSync();
  await tick();
}

function button(target: HTMLElement, label: string) {
  return Array.from(target.querySelectorAll<HTMLButtonElement>('button')).find(
    (element) => element.textContent?.trim() === label,
  )!;
}

async function select(target: HTMLElement, label: string, value: string) {
  const control = target.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  await tick();
}

function score(target: HTMLElement) {
  return target.querySelector('[data-help-score]')?.textContent?.replace(/\s+/g, ' ').trim();
}

describe('Skull King game help', () => {
  it('keeps the scoring example independent of the draft, totals, and recorded scores', async () => {
    const { target, opener } = render();
    const draft = target.querySelector('[data-draft]')!.textContent;
    await click(opener);
    expect(score(target)).toBe('+40 points');
    await click(target.querySelector<HTMLButtonElement>('[aria-label="Trick 3"]')!);
    expect(score(target)).toBe('−10 points');
    await select(target, 'Example bid', '3');
    expect(score(target)).toBe('+60 points');
    await click(target.querySelector<HTMLButtonElement>('[aria-label="Trick 1"]')!);
    expect(score(target)).toBe('−10 points');
    expect(target.querySelector('[aria-label="Trick 1"]')?.getAttribute('aria-pressed')).toBe(
      'false',
    );
    await click(button(target, 'Clear'));
    expect(score(target)).toBe('−30 points');
    await select(target, 'Example round', '1');
    expect(target.querySelectorAll('[data-help-example] [aria-pressed]')).toHaveLength(1);
    expect(score(target)).toBe('−10 points');
    await click(button(target, 'Reset example'));
    expect(score(target)).toBe('+40 points');
    expect(target.querySelector('[data-draft]')!.textContent).toBe(draft);
    await click(button(target, 'Done'));
    expect(target.querySelector('dialog')).toBeNull();
    expect(target.querySelector('[data-draft]')!.textContent).toBe(draft);
    await click(opener);
    expect(score(target)).toBe('+40 points');
  });

  it('handles zero bids, configured round limits, and contextual bonus rules', async () => {
    const { target, opener } = render({ rounds: 3, bonusesRequireBid: false }, 1);
    await click(opener);
    expect(target.querySelectorAll('select[aria-label="Example round"] option')).toHaveLength(3);
    await click(button(target, 'Zero bids'));
    await select(target, 'Example bid', '0');
    await click(button(target, 'Clear'));
    expect(score(target)).toBe('+20 points');
    await click(target.querySelector<HTMLButtonElement>('[aria-label="Trick 2"]')!);
    expect(score(target)).toBe('−20 points');
    await select(target, 'Example round', '3');
    expect(score(target)).toBe('−30 points');
    await click(button(target, 'Bonuses'));
    expect(target.querySelector('.bonus-setting')?.textContent).toBe(
      'Bonuses count even when your bid is missed.',
    );
    expect(
      Array.from(target.querySelectorAll('tbody tr')).map(
        (row) => row.lastElementChild?.textContent,
      ),
    ).toEqual(Object.values(BONUS_VALUES).map((value) => `+${value}`));
    expect(target.textContent).toContain('Other field covers house rules');
    await click(button(target, 'Scoring guide'));
    expect(target.textContent).toContain('not the full rules');
    expect(target.textContent).toContain('This game is set to 3 rounds.');
    await click(button(target, 'Try the scoring example →'));
    expect(target.querySelector('[data-help-example]')).not.toBeNull();
  });

  it('focuses and locks the modal, changes topics, and restores focus and scroll on close', async () => {
    const { target, opener } = render();
    const rootStyle = document.documentElement.getAttribute('style');
    const bodyStyle = document.body.getAttribute('style');
    await click(opener);
    const dialog = target.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector('h2'));
    expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h2')?.id);
    expect(document.documentElement.style.overflowY).toBe('hidden');
    expect(document.body.style.overflowY).toBe('hidden');
    await click(button(target, 'Bonuses'));
    expect(button(target, 'Bonuses').getAttribute('aria-current')).toBe('page');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Help content');
    expect(target.querySelector('.bonus-setting')?.textContent).toBe(
      'Bonuses count only when you meet your bid.',
    );
    dialog.close();
    flushSync();
    expect(target.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.documentElement.getAttribute('style')).toBe(rootStyle);
    expect(document.body.getAttribute('style')).toBe(bodyStyle);
    expect(window.scrollTo).toHaveBeenCalledOnce();
  });

  it('releases the page lock when the round editor unmounts with help open', async () => {
    const { opener } = render();
    const rootStyle = document.documentElement.getAttribute('style');
    const bodyStyle = document.body.getAttribute('style');
    await click(opener);
    await unmount(mounted.pop()!);
    expect(document.documentElement.getAttribute('style')).toBe(rootStyle);
    expect(document.body.getAttribute('style')).toBe(bodyStyle);
  });
});
