import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { dominionStats } from './stats';
import {
  DOMINION_HELP,
  describeDominion,
  emptyInput,
  scoreDominion,
  validateDominion,
  type DominionInput,
} from './logic';

export type { DominionInput, DominionRow } from './logic';

/**
 * Dominion — a faithful end-game Victory Point scorer for Rio Grande Games' deck-builder
 * (2008). One final scoresheet per played game: Estates, Duchies, Provinces, Curses,
 * Gardens (deck-size dependent), and a free "Other VP" catch-all for every kingdom/
 * variable victory card across the many expansions — summed to a total, highest wins.
 * All scoring lives in the Svelte-free `logic.ts`; this module just wires it into the
 * `GameModule` contract, mirroring Finspan's end-game-category scoresheet shape.
 */
export const dominion: GameModule = {
  id: 'dominion',
  name: 'Dominion',
  tagline: 'Build your deck, count your castle — most VP wins.',
  emoji: '🏰',
  keywords: [
    'deck builder',
    'deckbuilding',
    'kingdom',
    'estate',
    'duchy',
    'province',
    'curse',
    'gardens',
    'victory points',
    'vp',
  ],
  minPlayers: 2,
  maxPlayers: 6,

  // A single final scoresheet — one round, then the game is complete.
  maxRounds: () => 1,

  createRoundInput: (ctx: RoundContext): DominionInput => emptyInput(ctx.players),

  validateRound: (input: DominionInput, ctx: RoundContext): string | null =>
    validateDominion(input, ctx.players),

  scoreRound: (input: DominionInput, ctx: RoundContext): Record<ID, number> =>
    scoreDominion(input, ctx.players),

  describeRound: (round: Round, players): string => describeDominion(round, players),

  help: DOMINION_HELP,

  stats: dominionStats,

  RoundEditor,
  editorLoader: () => import('./DominionEditor.svelte'),
};
