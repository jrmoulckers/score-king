import { writable } from 'svelte/store';

const RAW_BASE = import.meta.env.BASE_URL || '/';
// '' when served at root ('/'), '/score-king' when served under a subpath.
const BASE = RAW_BASE.replace(/\/+$/, '');

/** Strip the deploy base prefix to get an app-relative path like '/play/x'. */
function toAppPath(pathname: string): string {
  let p = pathname || '/';
  if (BASE && (p === BASE || p.startsWith(BASE + '/'))) {
    p = p.slice(BASE.length);
  }
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

/** Turn an app-relative path into a real URL that includes the deploy base. */
function toUrl(appPath: string): string {
  const clean = appPath.startsWith('/') ? appPath : '/' + appPath;
  return BASE + clean;
}

/** Absolute, shareable URL for an app-relative path (includes origin + deploy base). */
export function absoluteUrl(appPath: string): string {
  return window.location.origin + toUrl(appPath);
}

export const pathStore = writable<string>(toAppPath(window.location.pathname));

export function navigate(to: string) {
  const url = toUrl(to);
  if (url !== window.location.pathname) {
    window.history.pushState({}, '', url);
  }
  pathStore.set(toAppPath(url));
  window.scrollTo(0, 0);
}

window.addEventListener('popstate', () => {
  pathStore.set(toAppPath(window.location.pathname));
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
  | 'court'
  | 'wrapped'
  | 'tonight'
  | 'settings'
  | 'accessibility'
  | 'managegames'
  | 'browse'
  | 'gameplay'
  | 'play'
  | 'join'
  | 'nearby'
  | 'recap'
  | 'gametype'
  | 'customedit'
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
  court: 'court',
  wrapped: 'wrapped',
  tonight: 'tonight',
  settings: 'settings',
  accessibility: 'accessibility',
  'manage-games': 'managegames',
  browse: 'browse',
  gameplay: 'gameplay',
  nearby: 'nearby',
  recap: 'recap',
  create: 'customedit',
};

/**
 * Human-readable page title per route, used to keep `document.title` in sync as
 * the SPA navigates (WCAG 2.4.2 Page Titled) and to announce the new page to
 * assistive tech. Game-specific routes fall back to a sensible generic label;
 * pages that know their own subject (a game, a custom def) can refine it later.
 */
const ROUTE_TITLES: Record<RouteName, string> = {
  home: 'Games',
  players: 'Players',
  history: 'History',
  stats: 'Stats',
  court: 'The Court',
  wrapped: 'Wrapped',
  tonight: "Tonight's Recap",
  settings: 'Settings',
  accessibility: 'Accessibility & display',
  managegames: 'Manage games',
  browse: 'Browse games',
  gameplay: 'Gameplay',
  play: 'Now playing',
  join: 'Join live game',
  nearby: 'Play nearby',
  recap: 'Recap',
  gametype: 'Start a game',
  customedit: 'Create a game',
  notfound: 'Not found',
};

const APP_NAME = 'Score King';

/** The `document.title` string for a route (e.g. "Players · Score King"). */
export function titleForRoute(route: Route): string {
  const label = ROUTE_TITLES[route.name];
  return route.name === 'home' || !label ? APP_NAME : `${label} · ${APP_NAME}`;
}

export function parseRoute(path: string): Route {
  const clean = path.replace(/^\/+|\/+$/g, '');
  const segs = clean === '' ? [''] : clean.split('/');

  if (segs.length === 1) {
    const name = RESERVED[segs[0]];
    if (name) return { name, params: {} };
    // single unknown segment => a game type landing page (e.g. /skullking)
    return { name: 'gametype', params: { type: segs[0] } };
  }
  if (segs[0] === 'create' && segs[1]) {
    // /create/<defId> => edit an existing custom game
    return { name: 'customedit', params: { id: segs[1] } };
  }
  if (segs[0] === 'play' && segs[1]) {
    return { name: 'play', params: { id: segs[1] } };
  }
  if (segs[0] === 'join' && segs[1]) {
    return { name: 'join', params: { code: segs[1] } };
  }
  return { name: 'notfound', params: {} };
}
