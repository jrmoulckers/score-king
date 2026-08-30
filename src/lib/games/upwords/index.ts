import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import {
  BINGO_BONUS,
  QU_BONUS,
  UNPLAYED_TILE_PENALTY,
  createTurnInput,
  scoreUpwords,
  turnScore,
  validateUpwords,
  type UpwordsInput,
} from './logic';
import { upwordsStats } from './stats';

export type { UpwordsInput, UpwordsWordEntry } from './logic';
export {
  BINGO_BONUS,
  FLAT_POINTS_PER_LETTER,
  MAX_STACK_HEIGHT,
  QU_BONUS,
  STACKED_POINTS_PER_TILE,
  UNPLAYED_TILE_PENALTY,
  emptyWordEntry,
  endgamePenalty,
  wordScore,
} from './logic';

export const upwords: GameModule = {
  id: 'upwords',
  name: 'Upwords',
  tagline: 'Stack your words. Score by the tile.',
  emoji: '🗼',
  keywords: ['tiles', 'letters', 'stacking', 'word game', 'crossword'],
  minPlayers: 2,
  maxPlayers: 4,

  // Each round is one player's turn (mode 'turn') or the end-of-game rack penalty
  // applied to everyone at once (mode 'endgame') — see logic.ts for both shapes.
  createRoundInput: (ctx: RoundContext): UpwordsInput => {
    const ids = ctx.players.map((p) => p.id);
    // Suggest the next player in seating order so turns default to rotating.
    const next = ids.length ? ids[ctx.roundIndex % ids.length] : null;
    return createTurnInput(ids, next);
  },

  validateRound: (input: UpwordsInput, ctx: RoundContext): string | null =>
    validateUpwords(
      input,
      ctx.players.map((p) => p.id),
    ),

  scoreRound: (input: UpwordsInput, ctx: RoundContext): Record<ID, number> =>
    scoreUpwords(
      input,
      ctx.players.map((p) => p.id),
    ),

  describeRound: (round: Round, players): string => {
    const input = round.input as UpwordsInput;
    if (input?.mode === 'endgame') {
      const parts = players
        .map((p) => [p.name, Number(round.deltas?.[p.id]) || 0] as const)
        .filter(([, d]) => d !== 0)
        .map(([name, d]) => `${name} ${d}`);
      return parts.length ? `🏁 Rack penalties: ${parts.join(' / ')}` : '🏁 No leftover tiles';
    }
    const name = players.find((p) => p.id === input?.activePlayerId)?.name ?? '?';
    const pts = turnScore(input);
    const bits: string[] = [];
    if (input?.bingo) bits.push(`+${BINGO_BONUS} bingo`);
    if (input?.quBonus) bits.push(`+${QU_BONUS} Qu`);
    return bits.length ? `${name} +${pts} (${bits.join(', ')})` : `${name} +${pts}`;
  },

  help: [
    'Letters have no letter value in Upwords — every word scores by tile HEIGHT.',
    '',
    '🟩 Flat word (every tile a single layer): 2 points per letter.',
    '🟪 Stacked word (any tile 2+ layers): 1 point for every tile under every',
    '   letter — add up each letter’s stack height.',
    '',
    'Bonuses (once per turn):',
    '• +2 for using the "Qu" tile — only when the word stays flat.',
    '• +20 for playing all 7 rack tiles in one turn (a bingo).',
    '',
    'A turn can form more than one word (your main play plus any word it crosses',
    'or changes) — add each one and every word’s points are totalled.',
    '',
    `When the game ends, subtract ${UNPLAYED_TILE_PENALTY} points for every tile left on a rack —`,
    'use the "End of game" mode to enter everyone’s leftovers in one round.',
    '',
    'Highest total wins. 👑',
  ].join('\n'),

  stats: upwordsStats,

  RoundEditor,
  editorLoader: () => import('./UpwordsEditor.svelte'),
};
