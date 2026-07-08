import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './FinspanEditor.svelte';
import { finspanStats } from './stats';
import {
  FINSPAN_HELP,
  describeFinspan,
  emptyInput,
  scoreFinspan,
  validateFinspan,
  type FinspanInput,
} from './logic';

/**
 * Finspan — a faithful end-game category scorer for Stonemaier's fish-themed
 * Wingspan-family game (2025). One final scoresheet per game: a column per scoring
 * category, summed to a total, highest wins. All scoring lives in the Svelte-free
 * `logic.ts`; this module just wires it into the `GameModule` contract.
 */
export const finspan: GameModule = {
  id: 'finspan',
  name: 'Finspan',
  tagline: 'Tally your ocean — biggest catch wins.',
  emoji: '🐟',
  keywords: ['fish', 'ocean', 'sea', 'wingspan', 'stonemaier', 'category', 'end game', 'scoresheet'],
  minPlayers: 1,
  maxPlayers: 5,

  // A single final scoresheet — one round, then the game is complete.
  maxRounds: () => 1,

  createRoundInput: (ctx: RoundContext): FinspanInput => emptyInput(ctx.players),

  validateRound: (input: FinspanInput, ctx: RoundContext): string | null =>
    validateFinspan(input, ctx.players),

  scoreRound: (input: FinspanInput, ctx: RoundContext): Record<ID, number> =>
    scoreFinspan(input, ctx.players),

  describeRound: (round: Round, players): string => describeFinspan(round, players),

  help: FINSPAN_HELP,

  stats: finspanStats,

  RoundEditor: Editor,
};
