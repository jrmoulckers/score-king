import { writable } from 'svelte/store';

export const pathStore = writable<string>(window.location.pathname || '/');

export function navigate(to: string) {
  if (to !== window.location.pathname) {
    window.history.pushState({}, '', to);
  }
  pathStore.set(to);
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', () => {
  pathStore.set(window.location.pathname || '/');
});

/** Svelte action: turn an <a href="/..."> into a client-side navigation. */
export function link(node: HTMLAnchorElement) {
  const handler = (e: MouseEvent) => {
    const href = node.getAttribute('href');
    if (
      !href ||
      href.startsWith('http') ||
      href.startsWith('mailto:') ||
      node.target === '_blank' ||
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault();
    navigate(href);
  };
  node.addEventListener('click', handler);
  return {
    destroy() {
      node.removeEventListener('click', handler);
    },
  };
}

export type RouteName =
  | 'home'
  | 'players'
  | 'history'
  | 'stats'
  | 'settings'
  | 'play'
  | 'gametype'
  | 'notfound';

export interface Route {
  name: RouteName;
  params: Record<string, string>;
}

const RESERVED: Record<string, RouteName> = {
  '': 'home',
  players: 'players',
  history: 'history',
  stats: 'stats',
  settings: 'settings',
};

export function parseRoute(path: string): Route {
  const clean = path.replace(/^\/+|\/+$/g, '');
  const segs = clean === '' ? [''] : clean.split('/');

  if (segs.length === 1) {
    const name = RESERVED[segs[0]];
    if (name) return { name, params: {} };
    // single unknown segment => a game type landing page (e.g. /skullking)
    return { name: 'gametype', params: { type: segs[0] } };
  }
  if (segs[0] === 'play' && segs[1]) {
    return { name: 'play', params: { id: segs[1] } };
  }
  return { name: 'notfound', params: {} };
}
