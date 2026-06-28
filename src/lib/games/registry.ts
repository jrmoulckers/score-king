import type { GameModule } from '../types';
import { skullking } from './skullking';
import { hearts } from './hearts';
import { tally } from './tally';

/** All registered games. Add a new game by appending its module here. */
export const MODULES: GameModule[] = [skullking, hearts, tally];

const byId = new Map(MODULES.map((m) => [m.id, m]));

export function getModule(id: string): GameModule | undefined {
  return byId.get(id);
}
