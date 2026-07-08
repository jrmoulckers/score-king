import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './RummikubEditor.svelte';
import {
  DEFAULT_JOKER_VALUE,
  scoreRummikub,
  validateRummikub,
  type RummikubInput,
} from './logic';
import { rummikubStats } from './stats';

export type { RummikubHand, RummikubInput } from './logic';
export { handPenalty } from './logic';

const jokerValueOf = (config: Record<string, unknown>): number =>
  Math.max(0, Number(config.jokerValue) || DEFAULT_JOKER_VALUE);

export const rummikub: GameModule = {
  id: 'rummikub',
  name: 'Rummikub',
  tagline: 'Empty your rack. Strand their tiles.',
  emoji: '🔢',
  keywords: ['tiles', 'runs', 'groups', 'joker', 'rummy', 'rack', 'numbers'],
  minPlayers: 2,
  maxPlayers: 4,
  configFields: [
    {
      key: 'jokerValue',
      label: 'Joker penalty',
      type: 'number',
      default: DEFAULT_JOKER_VALUE,
      min: 0,
      max: 60,
      step: 5,
      help: 'Points a leftover joker costs its holder — and adds to the winner. Official rules: 30.',
    },
    {
      key: 'endMode',
      label: 'Game length',
      type: 'select',
      default: 'rounds',
      options: [
        { value: 'rounds', label: 'Set number of rounds' },
        { value: 'target', label: 'Play to a target score' },
      ],
    },
    {
      key: 'rounds',
      label: 'Number of rounds',
      type: 'number',
      default: 4,
      min: 1,
      max: 20,
      help: 'Used when playing a set number of rounds.',
    },
    {
      key: 'target',
      label: 'Target score',
      type: 'number',
      default: 100,
      min: 10,
      help: 'Used when playing to a target — the game ends once someone reaches it.',
    },
  ],

  maxRounds: (config) => (config.endMode === 'target' ? null : Number(config.rounds) || 4),

  isFinished: (totals, { config }) => {
    if (config.endMode !== 'target') return false;
    const target = Number(config.target) || 100;
    return Object.values(totals).some((t) => t >= target);
  },

  createRoundInput: (ctx: RoundContext): RummikubInput => ({
    winner: null,
    hands: Object.fromEntries(ctx.players.map((p) => [p.id, { tiles: 0, jokers: 0 }])),
  }),

  validateRound: (input: RummikubInput, ctx: RoundContext): string | null =>
    validateRummikub(input, ctx.players.map((p) => p.id)),

  scoreRound: (input: RummikubInput, ctx: RoundContext): Record<ID, number> =>
    scoreRummikub(input, ctx.players.map((p) => p.id), jokerValueOf(ctx.config)),

  describeRound: (round: Round, players): string => {
    const input = round.input as RummikubInput;
    if (!input?.winner) return 'No winner recorded';
    const name = players.find((p) => p.id === input.winner)?.name ?? '?';
    const pot = Number(round.deltas?.[input.winner]) || 0;
    return `🏆 ${name} went out · +${pot}`;
  },

  help: [
    'Meld runs (consecutive numbers in one color) and groups (same number, different',
    'colors). Your first meld must total at least 30 points. Jokers stand in for any tile.',
    'Go out — "Rummikub!" — by playing every tile on your rack to end the round.',
    '',
    'Each round scores zero-sum:',
    '• Winner (went out): + the total value of every opponent’s leftover tiles.',
    '• Everyone else: − the value of the tiles left on their own rack.',
    '',
    'Tiles count their face value (1–13); a stranded joker costs 30 (house-configurable).',
    'The winner gains exactly what the rest of the table loses.',
    '',
    'Highest total after the last round — or first to the target score — wins. 👑',
  ].join('\n'),

  stats: rummikubStats,

  RoundEditor: Editor,
};
