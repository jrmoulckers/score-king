import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ShareResultsSheet from './ShareResultsSheet.svelte';
import PlaySheet from './PlaySheet.svelte';

vi.mock('../motion', () => ({ bumpOnChange: vi.fn(), popIn: vi.fn() }));
vi.mock('../live/session', async () => {
  const { writable } = await import('svelte/store');
  return { liveParticipants: writable([]) };
});
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:,qr') } }));

let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('shared sheet scroll lifecycle', () => {
  it.each(['results', 'play'] as const)('locks %s until route/component unmount', async (kind) => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onclose = vi.fn();
    component =
      kind === 'results'
        ? mount(ShareResultsSheet, {
            target: document.body,
            props: {
              payload: {
                v: 1,
                t: 'tally',
                f: 0,
                p: [['Synthetic player', '#7c5cff']],
                w: [0],
                r: [[1]],
              },
              onclose,
            },
          })
        : mount(PlaySheet, {
            target: document.body,
            props: {
              mode: 'online',
              code: 'MOCK',
              link: '',
              onclose,
              onend: vi.fn(),
              onswitch: vi.fn(),
            },
          });
    flushSync();
    const sheet = document.querySelector<HTMLElement>('[aria-modal="true"]')!;
    expect(document.documentElement.style.overflowY).toBe('hidden');
    expect(document.body.style.overflowY).toBe('hidden');
    expect(sheet.style.overscrollBehaviorY).toBe('contain');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onclose).toHaveBeenCalledOnce();
    document.querySelector<HTMLElement>('.backdrop')!.click();
    expect(onclose).toHaveBeenCalledTimes(2);
    if (kind === 'results') {
      Array.from(sheet.querySelectorAll('button'))
        .find((button) => button.textContent === 'Done')!
        .click();
      expect(onclose).toHaveBeenCalledTimes(3);
    }
    await unmount(component);
    component = undefined;
    expect(document.documentElement.hasAttribute('style')).toBe(false);
    expect(document.body.hasAttribute('style')).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(scroll).toHaveBeenCalledOnce();
  });
});
