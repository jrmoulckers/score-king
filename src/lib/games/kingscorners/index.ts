import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { kingsCornersStats } from './stats';
import {
  describeRound as describeKingsCornersRound,
  emptyInput,
  isFinished as kingsCornersFinished,
  scoreRound as scoreKingsCorners,
  validateRound as validateKingsCorners,
  wentOutIds,
  type KingsCornersInput,
} from './logic';

export type { KingsCornersInput, KingsCornersConfig } from './logic';

export const kingscorners: GameModule = {
  id: 'kingscorners',
  name: 'Kings Corners',
  tagline: 'Empty your hand before the Kings pile up',
  emoji: '👑',
  keywords: ['kings in the corner', 'solitaire', 'cards', 'corners', 'layout'],
  minPlayers: 2,
  maxPlayers: 4,
  lowerIsBetter: true,
  configFields: [
    {
      key: 'endScore',
      label: 'End the game when a player reaches',
      type: 'number',
      default: 25,
      min: 10,
      help: '25 is the classic finish line; some tables play to 50 for a longer night.',
    },
  ],

  createRoundInput: (ctx: RoundContext): KingsCornersInput =>
    emptyInput(ctx.players.map((p) => p.id)),

  validateRound: (input: KingsCornersInput, ctx: RoundContext): string | null =>
    validateKingsCorners(input, ctx.players, ctx.config),

  scoreRound: (input: KingsCornersInput, ctx: RoundContext): Record<ID, number> =>
    scoreKingsCorners(
      input,
      ctx.players.map((p) => p.id),
    ),

  isFinished: (totals, { config }) => kingsCornersFinished(totals, config),

  describeRound: (round: Round, players): string =>
    describeKingsCornersRound(round.input as KingsCornersInput, players),

  // Per-round scorecard emphasis: flag whoever went out (a clean, penalty-free hand) so
  // the round-by-round view celebrates the round's winner, never colour alone.
  roundCellTone: (round: Round, playerId: ID) => {
    const input = round.input as KingsCornersInput | undefined;
    if (!input?.kingsLeft) return null;
    const ids = Object.keys(input.kingsLeft);
    if (!wentOutIds(input, ids).includes(playerId)) return null;
    return { tone: 'good', label: 'Went out — zero cards left' };
  },

  help: [
    'Kings Corners deals a hand to every player and fans four piles into a cross around a',
    'central stock, with the four corners reserved for Kings. On your turn, play a card of',
    'the opposite color one rank lower onto any of the four arms — or start a fresh pile in',
    'an empty corner with a King. Whole piles can be picked up and moved onto a valid card',
    'elsewhere, and an empty non-corner spot can be filled from the stock or the top of any',
    'pile. Draw back up to your hand size (or as your table agrees) each turn.',
    '',
    'The round ends the instant a player plays their last card — they go out clean.',
    'Everyone else counts what is stuck in their hand: 👑 Kings cost 10 points each, every',
    'other card costs 1. Lower is better, so the player who went out banks a clean 0.',
    '',
    'Play continues, round after round, until someone\'s running total reaches the end',
    'score (25 by default, or 50 for a longer game). Whoever has the LOWEST total at that',
    'point wins the crown.',
  ].join('\n'),

  stats: kingsCornersStats,

  RoundEditor,
  editorLoader: () => import('./KingsCornersEditor.svelte'),
};
