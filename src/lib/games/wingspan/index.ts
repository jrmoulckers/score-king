import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { wingspanStats } from './stats';
import {
  describeWingspanRound,
  emptyRow,
  scoreWingspanRound,
  validateWingspanRound,
  type WingspanInput,
} from './logic';

export type { WingspanInput, WingspanRow, WingspanConfig } from './logic';

/**
 * Wingspan — the engine-building birds game, scored the way the real score pad works: one final
 * scoresheet with a column per category per player, summed to a total. Highest total reigns.
 *
 * The whole game is a single round (`maxRounds = 1`): you enter everyone's end-game categories
 * once and finish. Scoring lives in {@link ./logic logic.ts} so it stays pure and testable.
 */
export const wingspan: GameModule = {
  id: 'wingspan',
  name: 'Wingspan',
  tagline: 'Total the flock — highest score reigns 🪶',
  emoji: '🪶',
  keywords: ['birds', 'engine building', 'stonemaier', 'nectar', 'eggs', 'habitat', 'board game', 'oceania'],
  minPlayers: 1,
  maxPlayers: 5,
  configFields: [
    {
      key: 'nectar',
      label: 'Oceania nectar (adds a Nectar category)',
      type: 'boolean',
      default: false,
      help: 'Track nectar majorities scored at game end. Adds a seventh column; the base six always stay.',
    },
    {
      key: 'trackFood',
      label: 'Track unused food (tiebreaker)',
      type: 'boolean',
      default: true,
      help: 'Wingspan breaks ties by leftover food. Capture each player’s unused food — it settles ties but never adds to the score.',
    },
  ],

  // One game = one final scoresheet.
  maxRounds: () => 1,

  createRoundInput: (ctx: RoundContext): WingspanInput => ({
    rows: Object.fromEntries(ctx.players.map((p) => [p.id, emptyRow()])),
  }),

  validateRound: (input: WingspanInput, ctx: RoundContext): string | null =>
    validateWingspanRound(input, ctx.players),

  scoreRound: (input: WingspanInput, ctx: RoundContext): Record<ID, number> =>
    scoreWingspanRound(input, ctx.players),

  describeRound: (round: Round, players): string =>
    describeWingspanRound(round.input as WingspanInput, players),

  help: [
    'Wingspan is scored once, at game end. Total each player’s categories — highest wins.',
    '',
    '🐦 Birds — points printed on the birds you played',
    '🎯 Bonus cards — points from your bonus card conditions',
    '🎖️ End-of-round goals — points from the four goal tiles',
    '🥚 Eggs — 1 point each, on your bird cards',
    '🌰 Cached food — 1 point per food tucked on your birds',
    '🃏 Tucked cards — 1 point per card tucked under your birds',
    '🌸 Nectar — habitat majorities (Oceania), when enabled',
    '',
    '🍽️ Unused food breaks ties — most leftover food wins. Tied totals show as co-leaders,',
    'so settle a dead heat at the table with the food column.',
  ].join('\n'),

  stats: wingspanStats,

  RoundEditor,
  editorLoader: () => import('./WingspanEditor.svelte'),
};
