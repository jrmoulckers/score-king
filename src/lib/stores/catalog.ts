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
 * editable def, so custom-only affordances (Edit) gate on this. Imported from the canonical
 * source (`CUSTOM_ID_PREFIX = 'def_'`) and re-exported so there's a single definition.
 */
import { isCustomType } from '../games/custom/types';
export { isCustomType };

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

/**
 * Fold a string for searching: lower-cased and diacritic-stripped (NFD → drop combining
 * marks), so a plain typing of "Uno" still matches an accented "Úno" tagline and vice-versa.
 */
export function foldSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Case- and diacritic-insensitive match over name + tagline + optional keyword aliases, plus
 * the type's category label so a group can search by *kind* ("cards", "party", "sports") and
 * surface every game in that family — not just ones whose name happens to contain the word.
 */
export function matchModule(t: CatalogType, query: string): boolean {
  const q = foldSearch(query);
  if (!q) return true;
  const cat = categoryOf(t.id);
  const catLabel = CATEGORY_ORDER.find((c) => c.id === cat)?.label ?? '';
  // Both the category id ("cards") and its label ("Card Games") go in the haystack so either
  // the short kind word or the display name surfaces the whole family.
  const hay = foldSearch([t.name, t.tagline, cat, catLabel, ...(t.keywords ?? [])].join(' '));
  return hay.includes(q);
}

/**
 * The most-recently-*finished* games, newest first — the source for Home's "Recent results".
 * Ordered by `finishedAt` (falling back to `createdAt`) rather than the store's create order,
 * so a long-running game that only wrapped up today ranks above a quicker one that was started
 * later but is still open. Archived games are excluded.
 */
export function recentlyFinished(games: Game[], limit = RECENT_LIMIT): Game[] {
  return games
    .filter((g) => g.status === 'finished' && !g.archived)
    .sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt))
    .slice(0, limit);
}

// ── Categories: group the catalog by game "type" for the browse page ──────────────

/**
 * The kind of game a catalog type is, used to categorize the full "All games" browse
 * page. Custom (user-authored) types group under `custom`; any built-in not listed in
 * {@link BUILTIN_CATEGORY} falls back to `other`, so a newly-dropped-in game still shows
 * up (just uncategorized) until it's mapped here.
 */
export type GameCategory =
  | 'universal'
  | 'cards'
  | 'tiles'
  | 'party'
  | 'board'
  | 'sports'
  | 'video'
  | 'custom'
  | 'other';

export interface CategoryMeta {
  id: GameCategory;
  label: string;
  emoji: string;
}

/** Display order for both the category sections and the filter chips on the browse page. */
export const CATEGORY_ORDER: CategoryMeta[] = [
  { id: 'universal', label: 'Universal', emoji: '🧮' },
  { id: 'cards', label: 'Card Games', emoji: '🃏' },
  { id: 'tiles', label: 'Tiles & Dice', emoji: '🎲' },
  { id: 'party', label: 'Party & Social', emoji: '🎭' },
  { id: 'board', label: 'Board Games', emoji: '♟️' },
  { id: 'sports', label: 'Sports & Yard', emoji: '🥏' },
  { id: 'video', label: 'Video Games', emoji: '🎮' },
  { id: 'custom', label: 'Your Games', emoji: '✨' },
  { id: 'other', label: 'More', emoji: '📦' },
];

/** Built-in type id → category. New built-ins default to `other` until mapped here. */
const BUILTIN_CATEGORY: Record<string, GameCategory> = {
  tally: 'universal',
  hearts: 'cards',
  skullking: 'cards',
  spades: 'cards',
  euchre: 'cards',
  uno: 'cards',
  unogolf: 'cards',
  golf: 'cards',
  explodingkittens: 'cards',
  chickenfoot: 'tiles',
  rummikub: 'tiles',
  fluff: 'tiles',
  botc: 'party',
  avalon: 'party',
  codenames: 'party',
  saladbowl: 'party',
  werewords: 'party',
  tworooms: 'party',
  wingspan: 'board',
  wyrmspan: 'board',
  finspan: 'board',
  cornhole: 'sports',
  spikeball: 'sports',
  volleyball: 'sports',
  mariokart: 'video',
};

/** The category a catalog type belongs to (custom types group under `custom`). */
export function categoryOf(id: string): GameCategory {
  if (isCustomType(id)) return 'custom';
  return BUILTIN_CATEGORY[id] ?? 'other';
}

export interface CategoryGroup {
  meta: CategoryMeta;
  types: CatalogType[];
}

/**
 * Group the visible catalog into ordered, non-empty category sections for the browse page.
 * Hidden types are excluded; within a category the incoming (name-sorted registry) order is
 * preserved. Empty categories are dropped so the page never shows a bare header.
 */
export function groupByCategory(
  types: CatalogType[],
  hidden: string[] = get(settings).catalogHidden,
): CategoryGroup[] {
  const hiddenSet = new Set(hidden);
  const buckets = new Map<GameCategory, CatalogType[]>();
  for (const t of types) {
    if (hiddenSet.has(t.id)) continue;
    const cat = categoryOf(t.id);
    const bucket = buckets.get(cat);
    if (bucket) bucket.push(t);
    else buckets.set(cat, [t]);
  }
  return CATEGORY_ORDER.map((meta) => ({ meta, types: buckets.get(meta.id) ?? [] })).filter(
    (g) => g.types.length > 0,
  );
}
