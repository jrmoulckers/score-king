import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { heartsStats } from './stats';
import {
  emptyInput,
  isFinished as heartsFinished,
  scoreRound as scoreHearts,
  shooter,
  validateRound as validateHearts,
  type HeartsInput,
} from './logic';

export type { HeartsInput, HeartsConfig, MoonRule } from './logic';

export const hearts: GameModule = {
  id: 'hearts',
  name: 'Hearts',
  tagline: 'Avoid hearts & the Queen of Spades',
  emoji: '♥️',
  keywords: ['trick taking', 'shooting the moon', 'queen of spades', 'cards'],
  minPlayers: 3,
  maxPlayers: 6,
  lowerIsBetter: true,
  configFields: [
    { key: 'endScore', label: 'End the game when a player reaches', type: 'number', default: 100, min: 10 },
    {
      key: 'variantJack',
      label: 'Jack of Diamonds = −10 (Omnibus variant)',
      type: 'boolean',
      default: false,
      help: 'Adds one good card worth grabbing: whoever takes the ♦J shaves 10 off their round.',
    },
    {
      key: 'moonRule',
      label: 'Shooting the moon',
      type: 'select',
      default: 'add26',
      options: [
        { value: 'add26', label: 'Everyone else +26' },
        { value: 'subtract', label: 'Shooter −26' },
      ],
      help: 'Take all 13 hearts and the ♠Q to shoot the moon and flip the round on its head.',
    },
  ],

  createRoundInput: (ctx: RoundContext): HeartsInput =>
    emptyInput(ctx.players.map((p) => p.id)),

  validateRound: (input: HeartsInput, ctx: RoundContext): string | null =>
    validateHearts(input, ctx.players, ctx.config),

  scoreRound: (input: HeartsInput, ctx: RoundContext): Record<ID, number> =>
    scoreHearts(input, ctx.players.map((p) => p.id), ctx.config),

  isFinished: (totals, { config }) => heartsFinished(totals, config),

  describeRound: (round: Round, players): string => {
    const input = round.input as HeartsInput;
    const name = (id: ID | null) => players.find((p) => p.id === id)?.name ?? '?';
    const moon = shooter(input);
    if (moon) return `🌙 ${name(moon)} shot the moon`;
    const parts: string[] = [`♠Q ${name(input.queen)}`];
    if (input.jack) parts.push(`♦J ${name(input.jack)}`);
    return parts.join(' · ');
  },

  help: [
    'Hearts is a dodging game: lowest score wins. Every round hands out 26 penalty',
    'points — 13 hearts (♥ = 1 each) and the Queen of Spades (♠Q = 13). Take as few',
    'as you can.',
    '',
    'Each round: give every heart to whoever took it (they must total 13), then tap',
    'the ♠Q onto whoever got stuck with her.',
    '',
    '🌙 Shoot the moon: take ALL 13 hearts AND the ♠Q in one round. Instead of eating',
    '26, you flip it — either everyone else takes +26, or you take −26 (set in setup).',
    'A huge, risky swing: miss it by one heart and you just took the whole load.',
    '',
    '♦J Omnibus (optional): the Jack of Diamonds is a good card — whoever takes it',
    'shaves 10 points off their round.',
    '',
    'The game ends when someone reaches the end score (100 by default). Lowest total',
    'at that moment wins the crown.',
  ].join('\n'),

  stats: heartsStats,

  RoundEditor,
  editorLoader: () => import('./HeartsEditor.svelte'),
};
