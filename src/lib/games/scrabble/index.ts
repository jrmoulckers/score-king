import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { scrabbleStats } from './stats';
import {
  BINGO_BONUS,
  describeRound as describeScrabbleRound,
  emptyInput,
  isTurn,
  scoreRound as scoreScrabble,
  validateRound as validateScrabble,
  type ScrabbleInput,
} from './logic';

export type { ScrabbleInput, TurnInput, FinalTallyInput } from './logic';
export { LETTER_VALUES, LETTER_GROUPS, letterValue, rackValue } from './logic';

export const scrabble: GameModule = {
  id: 'scrabble',
  name: 'Scrabble',
  tagline: 'Rack up word value, chase the bingo bonus.',
  emoji: '🔤',
  keywords: ['word game', 'tiles', 'bingo', 'letters', 'board game'],
  minPlayers: 2,
  maxPlayers: 4,

  createRoundInput: (ctx: RoundContext): ScrabbleInput => emptyInput(ctx.players.map((p) => p.id), ctx.roundIndex),

  validateRound: (input: ScrabbleInput, ctx: RoundContext): string | null =>
    validateScrabble(input, ctx.players),

  scoreRound: (input: ScrabbleInput, ctx: RoundContext): Record<ID, number> =>
    scoreScrabble(
      input,
      ctx.players.map((p) => p.id),
    ),

  describeRound: (round: Round, players): string =>
    describeScrabbleRound(round.input as ScrabbleInput | undefined, players),

  // Per-round scorecard emphasis: a bingo turn is the single most exciting thing that
  // can happen at a Scrabble table, so it earns its own tone the moment it's recorded.
  roundCellTone: (round: Round, playerId: ID) => {
    const input = round.input as ScrabbleInput | undefined;
    if (!isTurn(input) || input.playerId !== playerId) return null;
    return input.bingo ? { tone: 'good', label: `BINGO! +${BINGO_BONUS}` } : null;
  },

  help: [
    'Highest total wins. Every turn, the active player forms a word on the board;',
    'premium squares (double/triple letter or word) are worked out at the table and',
    'entered here as one number — the total value of the word just played.',
    '',
    '🎉 Bingo: used all 7 tiles in a single turn? Toggle it on for an automatic +50.',
    '',
    'Letter values:',
    'A E I O U L N S T R = 1 · D G = 2 · B C M P = 3 · F H V W Y = 4',
    'K = 5 · J X = 8 · Q Z = 10 · blank = 0',
    '',
    '🏁 Final tally: when the bag is empty and a player empties their rack, the game',
    'ends. Record one last "final tally" round: everyone else subtracts the value of',
    'the tiles left on their rack from their score, and the player who went out adds',
    'the sum of everyone else\'s leftover tiles to theirs.',
  ].join('\n'),

  stats: scrabbleStats,

  RoundEditor,
  editorLoader: () => import('./ScrabbleEditor.svelte'),
};
