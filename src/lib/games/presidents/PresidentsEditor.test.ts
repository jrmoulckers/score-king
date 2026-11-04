import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundContext } from '../../types';
import PresidentsEditorHarness from './PresidentsEditorHarness.svelte';
import { freshPositions, scoreRound, titleFor, validateRound, type PresidentsInput } from './logic';

vi.mock('../../motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../motion')>();
  return { ...actual, animateMotion: vi.fn(), prefersReducedMotion: () => true };
});

const mounted: ReturnType<typeof mount>[] = [];
const players = ['Alice', 'Bob', 'Carol', 'Dan', 'Eve'].map((name) => ({
  id: name,
  name,
  color: '#7c5cff',
  createdAt: 1,
}));

function render(initial = freshPositions(players), roundIndex = 0) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const config = { scheme: 'rankPoints' };
  const ctx: RoundContext = {
    game: {
      id: 'synthetic-presidents',
      type: 'presidents',
      playerIds: players.map((p) => p.id),
      config,
      status: 'active',
      createdAt: 1,
      roundCount: roundIndex,
    },
    players,
    config,
    roundIndex,
    totals: {},
    rounds: [],
  };
  mounted.push(mount(PresidentsEditorHarness, { target, props: { ctx, initial } }));
  flushSync();
  return target;
}

function row(target: HTMLElement, name = 'Alice') {
  return target.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!.closest('.prow')!;
}

function enter(target: HTMLElement, value: string, change = false) {
  const field = row(target).querySelector<HTMLInputElement>('input')!;
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  if (change) field.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

function draft(target: HTMLElement): PresidentsInput {
  return JSON.parse(target.querySelector('[data-draft]')!.textContent!);
}

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
});

describe('Presidents finishing-place context', () => {
  it.each([0, 1])('shows neutral context after clearing a fresh/edited finish (%s)', (roundIndex) => {
    const initial = freshPositions(players);
    const target = render(initial, roundIndex);
    enter(target, '', true);
    const cleared = row(target);
    expect(cleared.querySelector('.rank')?.textContent).toContain('Finish not entered');
    expect(cleared.querySelector('.rank')?.getAttribute('aria-label')).toBe('Finish not entered');
    expect(cleared.querySelector('.badge')?.textContent).toBe('—');
    expect(cleared.classList.contains('president')).toBe(false);
    expect([...target.querySelectorAll('.prow')].at(-1)).toBe(cleared);
    expect(validateRound(draft(target), players)).toContain('Where did Alice finish?');
    expect(target.querySelector('.wrap-banner')).toBeNull();
    expect(initial).toEqual(freshPositions(players));
    enter(target, '1', true);
    expect(row(target).querySelector('.rank')?.getAttribute('aria-label')).toBe(
      'Finished 1: President',
    );
    expect(row(target).classList.contains('president')).toBe(true);
    expect(validateRound(draft(target), players)).toBeNull();
    expect(scoreRound(draft(target), {})).toEqual({ Alice: 4, Bob: 3, Carol: 2, Dan: 1, Eve: 0 });
  });

  it('retains default positions and every valid title, including Citizen', () => {
    const target = render();
    for (const [index, player] of players.entries()) {
      const rank = row(target, player.name).querySelector('.rank')!;
      expect(rank.getAttribute('aria-label')).toBe(
        `Finished ${index + 1}: ${titleFor(index + 1, players.length).label}`,
      );
      expect(rank.querySelector('.badge')?.textContent).toBe(
        titleFor(index + 1, players.length).emoji,
      );
    }
    expect(draft(target)).toEqual(freshPositions(players));
    expect(target.querySelector('.wrap-banner')).not.toBeNull();
  });

  it.each(['0', '-1', '6', '1.5'])('does not assign a title to invalid typed finish %s', (value) => {
    const target = render();
    enter(target, value);
    const invalid = row(target);
    expect(invalid.querySelector('.rank')?.textContent).toContain('Invalid finish');
    expect(invalid.querySelector('.rank')?.getAttribute('aria-label')).toBe('Invalid finish');
    expect(invalid.querySelector('.badge')?.textContent).toBe('—');
    expect(invalid.classList.contains('president')).toBe(false);
    expect(draft(target).positions.Alice).toBe(Number(value));
  });

  it('keeps duplicate warnings and crown/stepper correction behavior', () => {
    const target = render();
    enter(target, '2', true);
    expect(row(target).querySelector('.rank')?.textContent).toContain('Vice President');
    expect(target.querySelectorAll('.prow.clash')).toHaveLength(2);
    expect(validateRound(draft(target), players)).toContain("can't both finish");
    row(target).querySelector<HTMLButtonElement>('.btn')!.click();
    flushSync();
    expect(draft(target).positions.Alice).toBe(1);
    expect(target.querySelectorAll('.prow.clash')).toHaveLength(0);
    enter(target, '', true);
    row(target).querySelector<HTMLButtonElement>('[aria-label="Increase Alice"]')!.click();
    flushSync();
    expect(draft(target).positions.Alice).toBe(1);
    expect(row(target).querySelector('.rank')?.getAttribute('aria-label')).toBe(
      'Finished 1: President',
    );
  });
});
