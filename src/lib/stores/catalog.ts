import { derived, get, type Readable } from 'svelte/store';
import type { Game } from '../types';
import { MODULES } from '../games/registry';
import { customGameDefs } from './customGames';
import { settings } from './settings';
import { showActionToast } from './toast';

/**
 * The shared game-*type* catalog model: favorites + hidden metadata (keyed by type id),
 * plus the sectioning/search helpers Home and Manage games render, and the seam that lets
 * built-in AND user-created (session 2) types flow through one uniform catalog.
 *
 * A "type id" is a built-in slug (`skullking`) or a custom def id (`def_…`). Favorites and
 * hidden are persisted as portable settings keys, so a group's chosen games travel with a
 * backup/restore.
 */

/**
 * Whether user-created game types (session 2) are wired up. Now that this branch sits on the
 * custom-game-creation work, the catalog includes non-archived custom defs and the
 * "＋ Create a game" affordance (→ {@link CREATE_ROUTE}) is shown.
 */
export const CUSTOM_GAMES_ENABLED = true;

/**
 * The minimal projection every catalog surface needs. Both a built-in `GameModule` and a
 * session-2 `CustomGameDef` structurally satisfy it (they each expose `id`/`name`/`emoji`/
 * `tagline`), so built-in and custom types flow through one uniform catalog. `keywords` is
 * optional (built-ins may add search aliases; custom defs simply omit it).
 */
export interface CatalogType {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  keywords?: string[];
}

/**
 * Reactive list of the startable game *types* the catalog offers — the single source every
 * catalog surface reads: the built-in {@link MODULES} plus session 2's reactive `customGameDefs`
 * store (PR #32), so newly-created types appear live. Retired (`archived`) and tombstoned
 * (`deleted`) defs are filtered out here — that's the catalog's job per session 2, and is
 * DISTINCT from the user's own `catalogHidden` (layered on later in {@link sectionize}).
 * `getModule(id)` (registry) still resolves either kind when a full module is needed.
 */
export const startableTypes: Readable<CatalogType[]> = derived(
  customGameDefs,
  ($defs): CatalogType[] => [...MODULES, ...$defs.filter((d) => !d.archived && !d.deleted)],
);

/**
 * A custom (user-authored, session 2) game type — its id is prefixed `def_`; built-ins have no
 * editable def, so custom-only affordances (Edit) gate on this. Re-exported from the canonical
 * source (`CUSTOM_ID_PREFIX = 'def_'`) so there's a single definition.
 */
export { isCustomType } from '../games/custom/types';

/**
 * The custom-game builder route (session 2). `/create` opens a fresh builder; `/create/<defId>`
 * edits an existing custom type (route `customedit` → `CustomGameEdit.svelte`). Centralized here
 * so both catalog surfaces link through one place. Route shape confirmed with session 2.
 */
export const CREATE_ROUTE = '/create';
export function editCustomHref(defId: string): string {
  return `${CREATE_ROUTE}/${defId}`;
}

/** Home reveals the search field once the catalog holds at least this many types. */
export const SEARCH_THRESHOLD = 6;

/** How many recently-played types to surface before they fold into the remainder. */
export const RECENT_LIMIT = 4;

// ── Metadata: favorites + hidden, backed by portable settings ────────────────────

/** Pinned type ids, in display order (reactive). */
export const favoriteIds: Readable<string[]> = derived(settings, ($s) => $s.catalogFavorites);
/** Hidden type ids (reactive). */
export const hiddenIds: Readable<string[]> = derived(settings, ($s) => $s.catalogHidden);

export function isFavorite(id: string): boolean {
  return get(settings).catalogFavorites.includes(id);
}
export function isHidden(id: string): boolean {
  return get(settings).catalogHidden.includes(id);
}

/** Pin/unpin a type. Newly favorited types append, so the pin order stays stable. */
export function toggleFavorite(id: string): void {
  settings.update((s) => {
    const has = s.catalogFavorites.includes(id);
    return {
      ...s,
      catalogFavorites: has
        ? s.catalogFavorites.filter((x) => x !== id)
        : [...s.catalogFavorites, id],
    };
  });
}

/**
 * Hide or show a type in the catalog. Independent of favorites: a hidden favorite keeps its
 * pin and simply isn't shown until it's shown again.
 */
export function setHidden(id: string, hidden: boolean): void {
  settings.update((s) => {
    const has = s.catalogHidden.includes(id);
    if (hidden === has) return s;
    return {
      ...s,
      catalogHidden: hidden ? [...s.catalogHidden, id] : s.catalogHidden.filter((x) => x !== id),
    };
  });
}

/** Hide a type with an Undo toast — the app's standard recoverable-destructive pattern. */
export function hideWithUndo(id: string, name: string): void {
  setHidden(id, true);
  showActionToast(`${name} hidden`, 'Undo', () => setHidden(id, false));
}

// ── View model + sectioning + search ─────────────────────────────────────────────

export interface CatalogEntry {
  type: CatalogType;
  favorite: boolean;
  hidden: boolean;
}

/** Every startable type paired with its catalog metadata — the unified list siblings consume. */
export function catalogEntries(
  types: CatalogType[] = get(startableTypes),
  favs: string[] = get(settings).catalogFavorites,
  hidden: string[] = get(settings).catalogHidden,
): CatalogEntry[] {
  const favSet = new Set(favs);
  const hiddenSet = new Set(hidden);
  return types.map((t) => ({
    type: t,
    favorite: favSet.has(t.id),
    hidden: hiddenSet.has(t.id),
  }));
}

/** Distinct game-type ids ordered by most recently played (active or finished). */
export function recentTypeIds(games: Game[]): string[] {
  const lastPlayed = new Map<string, number>();
  for (const g of games) {
    const t = g.finishedAt ?? g.createdAt;
    if (t > (lastPlayed.get(g.type) ?? 0)) lastPlayed.set(g.type, t);
  }
  return [...lastPlayed.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

export interface CatalogSections {
  favorites: CatalogType[];
  recent: CatalogType[];
  remainder: CatalogType[];
}

/**
 * Split the visible catalog into mutually-exclusive sections so a tile never repeats:
 * Favorites (stored order) → Recently played (most-recent-first, capped) → the remainder
 * (registry order). Hidden types are excluded from all three.
 */
export function sectionize(
  types: CatalogType[],
  games: Game[],
  favs: string[],
  hidden: string[],
): CatalogSections {
  const hiddenSet = new Set(hidden);
  const visible = types.filter((t) => !hiddenSet.has(t.id));
  const byId = new Map(visible.map((t) => [t.id, t]));

  const favorites = favs.map((id) => byId.get(id)).filter((t): t is CatalogType => !!t);
  const favSet = new Set(favorites.map((t) => t.id));

  const recent = recentTypeIds(games)
    .map((id) => byId.get(id))
    .filter((t): t is CatalogType => !!t && !favSet.has(t.id))
    .slice(0, RECENT_LIMIT);
  const recentSet = new Set(recent.map((t) => t.id));

  const remainder = visible.filter((t) => !favSet.has(t.id) && !recentSet.has(t.id));

  return { favorites, recent, remainder };
}

/** Case-insensitive match over name + tagline + optional keyword aliases. */
export function matchModule(t: CatalogType, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [t.name, t.tagline, ...(t.keywords ?? [])].join(' ').toLowerCase();
  return hay.includes(q);
}
