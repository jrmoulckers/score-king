import { writable } from 'svelte/store';
import type { CustomGameDef } from '../games/custom/types';
import { buildCustomModule } from '../games/custom/factory';
import { setCustomDefsRegistry } from '../games/custom/defRegistry';
import { setCustomModules } from '../games/registry';
import * as db from '../storage/db';
import { prunePresetsForType } from './presets';

/**
 * Custom (user-authored) games.
 * -----------------------------
 * The single writer that keeps the two synchronous registries — the module map used by
 * `getModule` and the def lookup used by the round editor — in step with IndexedDB, and
 * exposes a reactive list for the catalog/builder UI. Archived defs are kept in the list
 * and registries (so retired types still resolve for history/stats); the catalog filters
 * them out.
 */
export const customGameDefs = writable<CustomGameDef[]>([]);

/** Flips to true after the first load from IndexedDB, so UI can tell "loading" from "empty". */
export const customGamesLoaded = writable<boolean>(false);

/** Rebuild the synchronous registries (def lookup + compiled module map) from a def list. */
function syncRegistries(defs: CustomGameDef[]): void {
  setCustomDefsRegistry(defs);
  setCustomModules(defs.map(buildCustomModule));
}

/** Load every custom def from IndexedDB into the store and the registries. */
export async function refreshCustomGames(): Promise<void> {
  const defs = await db.getAllGameDefs();
  syncRegistries(defs);
  customGameDefs.set(defs);
  customGamesLoaded.set(true);
}

/** Create or update a custom game definition. */
export async function saveCustomGame(def: CustomGameDef): Promise<void> {
  await db.putGameDef(def);
  await refreshCustomGames();
}

/**
 * "Delete" a custom game type. A type that has never been played is hard-deleted; a type
 * that games/history/stats reference is **archived** instead (retained + resolvable) so
 * those keep their name, emoji, and correct scoring. Mirrors how Players archive.
 */
export async function removeCustomGame(id: string, inUse: boolean): Promise<void> {
  if (inUse) {
    const current = (await db.getAllGameDefs()).find((d) => d.id === id);
    if (current) await db.putGameDef({ ...current, archived: true, archivedAt: Date.now() });
  } else {
    await db.deleteGameDef(id);
    // Type is gone for good — drop its now-unreachable presets.
    prunePresetsForType(id);
  }
  await refreshCustomGames();
}

/** Return a retired (archived) custom type to the catalog. */
export async function restoreCustomGame(id: string): Promise<void> {
  const current = (await db.getAllGameDefs()).find((d) => d.id === id);
  if (current) {
    await db.putGameDef({ ...current, archived: false, archivedAt: undefined });
    await refreshCustomGames();
  }
}

// Populate on startup so getModule resolves custom types for deep links (e.g. /def_… or
// /play/<id> of a custom game) as soon as IndexedDB answers. Best-effort: if storage is
// unavailable (private-mode quirks, SSR, or a test environment without IndexedDB), the app
// still boots with just the built-in games rather than crashing on an unhandled rejection.
void refreshCustomGames().catch(() => {});
