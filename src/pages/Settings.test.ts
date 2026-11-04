import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { settings } from '../lib/stores/settings';
import Settings from './Settings.svelte';
import GameplaySettings from './GameplaySettings.svelte';

vi.mock('../lib/config', () => ({ ONEDRIVE_CLIENT_ID: '', RELAY_URL: '' }));

const initialSettings = get(settings);
const mounted: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  settings.set(initialSettings);
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function render(component: typeof Settings | typeof GameplaySettings) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(component, { target }));
  flushSync();
  return target;
}

describe('Settings gameplay summary', () => {
  it.each([
    [false, false, true, false, 'Haptic feedback'],
    [false, false, false, false, 'All off'],
    [false, false, true, true, 'Haptic feedback · Roasts'],
    [true, true, true, true, 'Keep awake · Peek-guard · Haptic feedback · Roasts'],
    [true, true, false, true, 'Keep awake · Peek-guard · Roasts'],
  ] as const)(
    'reflects awake=%s, privacy=%s, haptics=%s, roasts=%s',
    (keepAwake, privacyGuard, haptics, roastMode, expected) => {
      settings.set({ ...initialSettings, keepAwake, privacyGuard, haptics, roastMode });
      const before = get(settings);
      const target = render(Settings);
      expect(target.querySelector('a[href="/gameplay"] .muted')?.textContent).toBe(expected);
      expect(get(settings)).toEqual(before);
      expect(JSON.parse(localStorage.getItem('sk_settings')!)).toEqual(before);
    },
  );

  it('updates the mounted summary when the stored haptics preference changes', () => {
    settings.set({
      ...initialSettings,
      keepAwake: false,
      privacyGuard: false,
      roastMode: false,
      haptics: false,
    });
    const target = render(Settings);
    expect(target.querySelector('a[href="/gameplay"] .muted')?.textContent).toBe('All off');
    flushSync(() => settings.update((value) => ({ ...value, haptics: true })));
    expect(target.querySelector('a[href="/gameplay"] .muted')?.textContent).toBe('Haptic feedback');
  });

  it('summarizes the stored preference even when vibration is unsupported', () => {
    vi.stubGlobal('navigator', {});
    settings.set({
      ...initialSettings,
      keepAwake: false,
      privacyGuard: false,
      roastMode: false,
      haptics: true,
    });
    const before = get(settings);
    const detail = render(GameplaySettings);
    const row = [...detail.querySelectorAll('label')].find(
      (element) => element.querySelector('.name')?.textContent === 'Haptic feedback',
    )!;
    const input = row.querySelector('input')!;
    expect(input.checked).toBe(true);
    expect(input.disabled).toBe(true);
    expect(row.textContent).toContain('This device doesn’t support vibration.');
    const hub = render(Settings);
    expect(hub.querySelector('a[href="/gameplay"] .muted')?.textContent).toBe('Haptic feedback');
    expect(get(settings)).toEqual(before);
  });
});
