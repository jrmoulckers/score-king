import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundContext } from '../../types';
import { haptic } from '../../haptics';
import SaladBowlEditorHarness from './SaladBowlEditorHarness.svelte';
import type { SaladBowlInput } from './logic';

vi.mock('../../motion', () => ({ animateMotion: vi.fn() }));
vi.mock('../../haptics', () => ({ haptic: vi.fn() }));

let component: ReturnType<typeof mount> | undefined;

function render(guessed = [0, 0, 0]) {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const config = { teams: '3', turnSeconds: 5, sound: false };
  const ctx: RoundContext = {
    game: {
      id: 'pending-turn-test',
      type: 'saladbowl',
      playerIds: ids,
      config,
      status: 'active',
      roundCount: 0,
      createdAt: 1,
    },
    players: ids.map((id) => ({ id, name: id, color: '#7c5cff', createdAt: 1 })),
    config,
    roundIndex: 0,
    totals: {},
    rounds: [],
  };
  const target = document.createElement('div');
  document.body.appendChild(target);
  const harness = mount(SaladBowlEditorHarness, {
    target,
    props: { ctx, initial: { guessed } },
  });
  component = harness;
  flushSync();
  const click = (selector: string) => {
    target.querySelector<HTMLButtonElement>(selector)!.click();
    flushSync();
  };
  return {
    target,
    click,
    draft: () => JSON.parse(target.querySelector('[data-draft]')!.textContent!) as SaladBowlInput,
    pending: () => target.querySelector('.tn')!.textContent,
    active: () =>
      [...target.querySelectorAll('.chip')].findIndex(
        (chip) => chip.getAttribute('aria-pressed') === 'true',
      ),
    clock: () => target.querySelector('.time')!.textContent,
    setRound: (round: number) => {
      harness.setRound(round);
      flushSync();
    },
    setTurn: (seconds: number) => {
      harness.setTurn(seconds);
      flushSync();
    },
  };
}

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('Salad Bowl elapsed turn reminder', () => {
  function start() {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const editor = render([4, 7, 1]);
    editor.click('.tally');
    editor.click('.controls button:first-child');
    return editor;
  }

  function advance(ms: number) {
    vi.advanceTimersByTime(ms);
    flushSync();
  }

  function returnToPage() {
    document.dispatchEvent(new Event('resume'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow'));
    flushSync();
  }

  const buzzes = () => vi.mocked(haptic).mock.calls.filter(([kind]) => kind === 'buzz');

  it('expires once when wall time crosses the deadline without missed callbacks being delivered', () => {
    const editor = start();
    advance(1000);
    expect(editor.clock()).toBe('0:04');
    vi.setSystemTime(19000);
    expect(editor.clock()).toBe('0:04');
    expect(buzzes()).toHaveLength(0);
    returnToPage();
    expect(editor.clock()).toBe('0:00');
    expect(editor.target.querySelector('.clabel')!.textContent).toContain('Time!');
    expect(editor.target.querySelector('.controls')!.textContent).toContain('Start');
    expect(editor.pending()).toBe('1');
    expect(editor.draft().guessed).toEqual([4, 7, 1]);
    expect(buzzes()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    returnToPage();
    advance(10000);
    expect(buzzes()).toHaveLength(1);
    editor.click('.tally');
    editor.click('.endrow button:last-child');
    expect(editor.draft().guessed).toEqual([6, 7, 1]);
    expect(editor.active()).toBe(1);
  });

  it('also reconciles on a single delayed interval without a lifecycle event', () => {
    const editor = start();
    vi.setSystemTime(18000);
    advance(1000);
    expect(editor.clock()).toBe('0:00');
    expect(buzzes()).toHaveLength(1);
  });

  it('preserves fractional running time and excludes deliberate paused suspension', () => {
    const editor = start();
    advance(1500);
    editor.click('.controls button:first-child');
    expect(editor.clock()).toBe('0:04');
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(30000);
    returnToPage();
    expect(editor.clock()).toBe('0:04');
    expect(buzzes()).toHaveLength(0);
    editor.click('.controls button:first-child');
    advance(3499);
    expect(buzzes()).toHaveLength(0);
    editor.click('.controls button:first-child');
    expect(editor.clock()).toBe('0:01');
    editor.click('.controls button:first-child');
    advance(1);
    returnToPage();
    expect(editor.clock()).toBe('0:00');
    expect(buzzes()).toHaveLength(1);
  });

  it('reconciles an overdue pause and restarts a fresh turn after expiration', () => {
    const editor = start();
    vi.setSystemTime(6000);
    editor.click('.controls button:first-child');
    expect(editor.clock()).toBe('0:00');
    expect(buzzes()).toHaveLength(1);
    editor.click('.controls button:first-child');
    expect(editor.clock()).toBe('0:05');
    expect(vi.getTimerCount()).toBe(1);
    advance(5000);
    expect(buzzes()).toHaveLength(2);
  });

  it.each(['reset', 'team', 'round'] as const)(
    'clears the old deadline on %s and keeps one interval for the next turn',
    (transition) => {
      const editor = start();
      advance(1500);
      if (transition === 'reset') editor.click('[aria-label="Reset the turn clock"]');
      if (transition === 'team') {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        editor.click('.chip:nth-child(2)');
      }
      if (transition === 'round') editor.setRound(1);
      expect(editor.clock()).toBe('0:05');
      expect(vi.getTimerCount()).toBe(0);
      vi.setSystemTime(20000);
      returnToPage();
      expect(editor.clock()).toBe('0:05');
      expect(buzzes()).toHaveLength(0);
      editor.click('.controls button:first-child');
      returnToPage();
      expect(vi.getTimerCount()).toBe(1);
      advance(1000);
      expect(editor.clock()).toBe('0:04');
    },
  );

  it('uses idle configuration changes without changing an already engaged turn', () => {
    const editor = start();
    editor.setTurn(15);
    advance(1000);
    expect(editor.clock()).toBe('0:04');
    editor.click('.controls button:first-child');
    editor.setTurn(30);
    expect(editor.clock()).toBe('0:04');
    editor.click('[aria-label="Reset the turn clock"]');
    expect(editor.clock()).toBe('0:30');
    editor.setTurn(15);
    expect(editor.clock()).toBe('0:15');
    editor.click('.controls button:first-child');
    advance(1000);
    expect(editor.clock()).toBe('0:14');
  });

  it('removes intervals and lifecycle listeners on unmount, then mounts a fresh clock', async () => {
    start();
    await unmount(component!);
    component = undefined;
    document.body.replaceChildren();
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(20000);
    returnToPage();
    expect(buzzes()).toHaveLength(0);
    const editor = render();
    expect(editor.clock()).toBe('0:05');
    editor.click('.controls button:first-child');
    expect(vi.getTimerCount()).toBe(1);
    advance(1000);
    expect(editor.clock()).toBe('0:04');
  });
});

describe('Salad Bowl pending turn team switching', () => {
  it('keeps pending words and existing totals when switching is cancelled', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const editor = render([4, 7, 1]);
    editor.click('.tally');
    editor.click('.tally');
    editor.click('.chip:nth-child(2)');
    expect(confirm).toHaveBeenCalledWith(
      'Discard 2 unbanked words for Team 1 and switch to Team 2? Cancel to keep this turn, then use Bank to count the words.',
    );
    expect(editor.active()).toBe(0);
    expect(editor.pending()).toBe('2');
    expect(editor.draft().guessed).toEqual([4, 7, 1]);
    editor.click('.chip:nth-child(3)');
    expect(editor.pending()).toBe('2');
    expect(editor.active()).toBe(0);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('discards only after confirmation and switches to the requested team without crediting it', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const editor = render([4, 7, 1]);
    editor.click('.tally');
    editor.click('.chip:nth-child(3)');
    expect(confirm.mock.calls[0][0]).toContain('Discard 1 unbanked word for Team 1');
    expect(editor.active()).toBe(2);
    expect(editor.pending()).toBe('0');
    expect(editor.draft().guessed).toEqual([4, 7, 1]);
    editor.click('.chip:first-child');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(editor.pending()).toBe('0');
  });

  it('does not prompt for the active team, zero words, or a tally undone to zero', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const editor = render();
    editor.click('.chip:nth-child(2)');
    expect(editor.active()).toBe(1);
    editor.click('.tally');
    editor.click('.chip:nth-child(2)');
    expect(editor.pending()).toBe('1');
    editor.click('.endrow button:first-child');
    editor.click('.chip:nth-child(3)');
    expect(editor.active()).toBe(2);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('banks a cancelled switch exactly once to the original team and advances once', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const editor = render([4, 7, 1]);
    editor.click('.tally');
    editor.click('.tally');
    editor.click('.chip:nth-child(3)');
    editor.click('.endrow button:last-child');
    expect(editor.draft().guessed).toEqual([6, 7, 1]);
    expect(editor.active()).toBe(1);
    expect(editor.pending()).toBe('0');
    editor.click('.chip:nth-child(3)');
    expect(editor.draft().guessed).toEqual([6, 7, 1]);
    expect(editor.active()).toBe(2);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it.each(['running', 'paused', 'expired'] as const)(
    'preserves a %s clock on cancel and resets it only on a confirmed switch',
    (mode) => {
      vi.useFakeTimers();
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const editor = render();
      editor.click('.tally');
      editor.click('.controls button:first-child');
      vi.advanceTimersByTime(mode === 'expired' ? 5000 : 2000);
      flushSync();
      if (mode === 'paused') editor.click('.controls button:first-child');
      const before = editor.clock();
      editor.click('.chip:nth-child(2)');
      expect(editor.clock()).toBe(before);
      expect(editor.pending()).toBe('1');
      expect(editor.active()).toBe(0);
      vi.advanceTimersByTime(1000);
      flushSync();
      expect(editor.clock()).toBe(mode === 'running' ? '0:02' : before);
      confirm.mockReturnValue(true);
      editor.click('.chip:nth-child(2)');
      expect(editor.clock()).toBe('0:05');
      expect(editor.pending()).toBe('0');
      expect(editor.active()).toBe(1);
      expect(editor.target.querySelector('.controls')!.textContent).toContain('Start');
      vi.advanceTimersByTime(1000);
      flushSync();
      expect(editor.clock()).toBe('0:05');
    },
  );
});
