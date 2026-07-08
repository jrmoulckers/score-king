import type { GameModule } from '../types';

/**
 * Built-in games are **auto-discovered** — each lives in its own folder with an
 * `index.ts` that exports its {@link GameModule}. Adding a game is therefore just
 * dropping in `src/lib/games/‹id›/index.ts`; nothing here changes. That keeps game
 * modules from ever colliding on a shared registration list, so independent games
 * can land as clean, parallel pull requests.
 *
 * `import.meta.glob(..., { eager: true })` is resolved statically by Vite at build
 * time (and by Vitest, which shares Vite's transform), so this stays a compile-time
 * manifest — no dynamic `import()`, no runtime file access. The `custom/` folder has
 * no `index.ts`, so user-authored games (compiled at runtime) are excluded here and
 * flow in through {@link setCustomModules} instead.
 */
const discovered = import.meta.glob<Record<string, unknown>>('./*/index.ts', {
  eager: true,
});

/** Structural (duck-typed) guard: an exported value that is a real GameModule. */
function isGameModule(value: unknown): value is GameModule {
  if (!value || typeof value !== 'object') return false;
  const m = value as Partial<GameModule>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.emoji === 'string' &&
    typeof m.scoreRound === 'function' &&
    typeof m.validateRound === 'function' &&
    typeof m.createRoundInput === 'function' &&
    m.RoundEditor != null
  );
}

function collectBuiltIns(): GameModule[] {
  const mods: GameModule[] = [];
  for (const path of Object.keys(discovered).sort()) {
    const ns = discovered[path];
    for (const key of Object.keys(ns)) {
      if (isGameModule(ns[key])) mods.push(ns[key] as GameModule);
    }
  }
  // Stable, catalog-friendly order: alphabetical by display name.
  mods.sort((a, b) => a.name.localeCompare(b.name));
  return mods;
}

/** All registered built-in games, auto-discovered from `./‹id›/index.ts`. */
export const MODULES: GameModule[] = collectBuiltIns();

const byId = new Map(MODULES.map((m) => [m.id, m]));

/**
 * Runtime modules compiled from user-authored custom definitions, kept in sync by the
 * customGames store. Archived types are included so historical games, history and stats
 * still resolve; the catalog is responsible for filtering archived types out of listings.
 */
const customById = new Map<string, GameModule>();

/** Replace the custom module set. Called by the customGames store on load/CRUD/restore. */
export function setCustomModules(mods: GameModule[]): void {
  customById.clear();
  for (const m of mods) customById.set(m.id, m);
}

/** Resolve a game module by id — built-ins first, then custom (user-authored) games. */
export function getModule(id: string): GameModule | undefined {
  return byId.get(id) ?? customById.get(id);
}
