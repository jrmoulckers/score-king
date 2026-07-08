import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './ChickenFootEditor.svelte';
import { chickenfootStats } from './stats';
import * as logic from './logic';
import type { ChickenFootInput } from './logic';

export type { ChickenFootInput };
export {
  playerRoundScore,
  leadingDouble,
  totalRounds,
  doubleLabel,
  blankValue,
} from './logic';

export const chickenfoot: GameModule = {
  id: 'chickenfoot',
  name: 'Chicken Foot',
  tagline: 'Count the doubles down, dump your bones.',
  emoji: '🐔',
  keywords: ['dominoes', 'bones', 'chickie', 'chicken foot', 'doubles', 'mexican train'],
  minPlayers: 2,
  maxPlayers: 8,
  lowerIsBetter: true,
  configFields: [
    {
      key: 'startDouble',
      label: 'Starting double',
      type: 'select',
      default: '9',
      options: [
        { value: '6', label: 'Double-6 · 7 rounds' },
        { value: '9', label: 'Double-9 · 10 rounds' },
        { value: '12', label: 'Double-12 · 13 rounds' },
      ],
      help: 'Play counts down one round per double, from here to double-blank.',
    },
    {
      key: 'doubleBlankValue',
      label: 'Double-blank penalty',
      type: 'number',
      default: 50,
      min: 0,
      step: 5,
      help: 'Points for being caught with the 0–0 tile. Set 0 to score it as a plain blank.',
    },
  ],

  maxRounds: (config) => logic.totalRounds(config),

  createRoundInput: (ctx: RoundContext): ChickenFootInput => ({
    double: logic.leadingDouble(ctx.config, ctx.roundIndex),
    pips: Object.fromEntries(ctx.players.map((p) => [p.id, 0])),
    outId: null,
    blankId: null,
  }),

  validateRound: (input: ChickenFootInput, ctx: RoundContext): string | null =>
    logic.validateRound(input, ctx.players),

  scoreRound: (input: ChickenFootInput, ctx: RoundContext): Record<ID, number> =>
    logic.scoreRound(input, ctx.players, logic.blankValue(ctx.config)),

  describeRound: (round: Round, players): string => logic.describeRound(round, players),

  help: [
    'Chicken Foot is dominoes played as a countdown of rounds — one per double, from the',
    'starting double down to double-blank (pick the starting double in Options).',
    '',
    'Each round is built on its double — the “chicken foot.” The round ends when one player',
    'empties their hand, or when nobody can play (a blocked round).',
    '',
    'Scoring — lowest total wins:',
    '• Whoever went out scores 0.',
    '• Everyone else adds up the pips left in their hand (a blank side = 0).',
    '• The 0–0 “double-blank” stings — it scores the penalty in Options (default 50).',
    '',
    'Each round: log everyone’s leftover pips, tap 🐔 for who went out, and flag ⬜ whoever’s',
    'stuck holding the double-blank.',
  ].join('\n'),

  stats: chickenfootStats,

  RoundEditor: Editor,
};
