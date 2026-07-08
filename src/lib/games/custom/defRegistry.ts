import type { CustomGameDef } from './types';

/**
 * A tiny, dependency-free synchronous lookup of custom game definitions by id.
 *
 * Kept separate from the Svelte store and the module factory so leaf consumers — the
 * generic {@link ./CustomRoundEditor round editor} — can read a def's shape synchronously
 * without pulling in stores, IndexedDB, or the factory (and without an import cycle). The
 * store is the single writer: it calls {@link setCustomDefsRegistry} whenever defs load or
 * change.
 */
const byId = new Map<string, CustomGameDef>();

/** Replace the registry contents. Called by the customGames store on load/CRUD/restore. */
export function setCustomDefsRegistry(defs: CustomGameDef[]): void {
  byId.clear();
  for (const d of defs) byId.set(d.id, d);
}

/** Look up a custom definition by id (archived/retained defs included). */
export function getCustomDef(id: string): CustomGameDef | undefined {
  return byId.get(id);
}
