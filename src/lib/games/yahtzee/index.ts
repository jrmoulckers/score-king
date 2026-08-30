import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { yahtzeeStats } from './stats';
import {
  CATEGORIES,
  UPPER_BONUS,
  UPPER_BONUS_THRESHOLD,
  YAHTZEE_BONUS,
  categoryForRound,
  describeRound,
  emptyInput,
  maxRounds,
  roundCellTone,
  scoreRound,
  validateYahtzee,
  type Category,
  type CategoryId,
  type YahtzeeInput,
} from './logic';

// Re-exported so the editor and stats share a single entry point for the pure model.
export {
  CATEGORIES,
  UPPER_BONUS,
  UPPER_BONUS_THRESHOLD,
  YAHTZEE_BONUS,
  categoryForRound,
  type Category,
  type CategoryId,
  type YahtzeeInput,
};

export const yahtzee: GameModule = {
  id: 'yahtzee',
  name: 'Yahtzee',
  tagline: 'Roll five, fill the box, chase the bonus.',
  emoji: '🎲',
  keywords: ['dice', 'scorecard', 'upper section', 'full house', 'straight'],
  minPlayers: 1,
  maxPlayers: 10,

  maxRounds,

  createRoundInput: (ctx: RoundContext): YahtzeeInput =>
    emptyInput(ctx.players.map((p) => p.id)),

  validateRound: (input: YahtzeeInput, ctx: RoundContext): string | null =>
    validateYahtzee(input, ctx),

  scoreRound: (input: YahtzeeInput, ctx: RoundContext): Record<ID, number> =>
    scoreRound(input, ctx),

  describeRound: (round: Round, players): string => describeRound(round, players),

  roundCellTone: (round: Round, playerId: ID) => roundCellTone(round, playerId),

  help: [
    '🎲 Yahtzee — 13 categories, one per round, same category for the whole table each turn.',
    'Roll your own dice at the table as usual, then enter the score your category earned.',
    '',
    'Upper section (Ones–Sixes): sum of the matching dice.',
    `Score 63+ across the upper section and everyone banks a +${UPPER_BONUS} bonus —`,
    'awarded automatically the moment the Sixes round is scored.',
    '',
    'Lower section:',
    '• 3 of a Kind / 4 of a Kind / Chance — enter the sum of all 5 dice.',
    '• Full House (25) / Small Straight (30) / Large Straight (40) / Yahtzee (50) —',
    '  all-or-nothing: hit it or score 0.',
    '',
    `Extra Yahtzees (rolling a 2nd, 3rd… Yahtzee) are worth +${YAHTZEE_BONUS} each under the`,
    'Joker rule. Claim them in the final Chance round — the last stop in this fixed order.',
    '',
    'Highest total wins.',
  ].join('\n'),

  stats: yahtzeeStats,

  RoundEditor,
  editorLoader: () => import('./YahtzeeEditor.svelte'),
};
