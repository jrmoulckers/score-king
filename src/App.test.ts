import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.svelte';
import { navigate, pathStore } from './lib/router';

vi.mock('./pages/Home.svelte', () => ({ default: vi.fn() }));
vi.mock('./pages/Players.svelte', () => ({ default: vi.fn() }));
vi.mock('./pages/History.svelte', () => ({ default: vi.fn() }));
vi.mock('./pages/NotFound.svelte', () => ({ default: vi.fn() }));
vi.mock('./lib/components/Lazy.svelte', () => ({ default: vi.fn() }));
vi.mock('./lib/components/SyncBubble.svelte', () => ({ default: vi.fn() }));
vi.mock('./lib/components/UpdateBanner.svelte', () => ({ default: vi.fn() }));

let component: ReturnType<typeof mount>;
let target: HTMLDivElement;

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  pathStore.set('/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(App, { target });
  flushSync();
});

afterEach(async () => {
  await unmount(component);
  target.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function visit(path: string) {
  navigate(path);
  flushSync();
  await Promise.resolve();
  flushSync();
}

function expectNavigation(hub: string | null, current: 'page' | 'true' | null) {
  const navs = target.querySelectorAll('nav[aria-label="Primary"]');
  expect(navs).toHaveLength(2);
  for (const nav of navs) {
    const links = nav.querySelectorAll('a');
    expect(links).toHaveLength(4);
    for (const link of links) {
      const active = link.getAttribute('href') === hub;
      expect(link.classList.contains('active')).toBe(active);
      expect(link.getAttribute('aria-current')).toBe(active ? current : null);
    }
  }
}

describe('shared primary navigation', () => {
  it.each(['/', '/players', '/history', '/stats'])(
    'marks only the exact hub %s as the current page in both navigations',
    async (path) => {
      await visit(path);
      expectNavigation(path, 'page');
    },
  );

  it.each([
    ['/hearts', '/'],
    ['/browse', '/'],
    ['/manage-games', '/'],
    ['/create', '/'],
    ['/create/synthetic-definition', '/'],
    ['/nights', '/history'],
    ['/nights/2026-11-03', '/history'],
    ['/court', '/stats'],
    ['/wrapped', '/stats'],
    ['/tonight', '/stats'],
  ])(
    'marks %s as belonging to %s without claiming its hub is the current page',
    async (path, hub) => {
      await visit(path);
      expectNavigation(hub, 'true');
    },
  );

  it.each([
    '/settings',
    '/accessibility',
    '/gameplay',
    '/play/synthetic-game',
    '/join/synthetic-code',
    '/nearby',
    '/recap',
    '/missing/route',
  ])('leaves every primary link unmarked on the ungrouped route %s', async (path) => {
    await visit(path);
    expectNavigation(null, null);
  });

  it('updates both navs through link activation and back navigation while preserving route focus', async () => {
    for (const selector of ['.tabbar', '.sidebar-nav']) {
      const players = target.querySelector<HTMLAnchorElement>(`${selector} a[href="/players"]`)!;
      players.focus();
      players.click();
      flushSync();
      await Promise.resolve();
      expectNavigation('/players', 'page');
      expect(window.location.pathname).toBe('/players');
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(target.querySelector('main')),
      );

      await visit('/court');
      expectNavigation('/stats', 'true');
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
      flushSync();
      await Promise.resolve();
      expectNavigation('/', 'page');
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(target.querySelector('main')),
      );
    }
  });
});
