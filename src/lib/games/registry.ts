import type { GameModule } from '../types';
import { skullking } from './skullking';
import { hearts } from './hearts';
import { tally } from './tally';

/** All registered built-in games. Add a new built-in by appending its module here. */
export const MODULES: GameModule[] = [skullking, hearts, tally];

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
