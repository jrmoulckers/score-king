import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './HeartsEditor.svelte';
import { heartsStats } from './stats';
import {
  isFinished as isFinishedLogic,
  scoreRound as scoreRoundLogic,
  shooter,
  validateRound as validateRoundLogic,
  type HeartsInput,
} from './logic';

export { shooter, readConfig } from './logic';
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
    },
  ],

  createRoundInput: (ctx: RoundContext): HeartsInput => ({
    hearts: Object.fromEntries(ctx.players.map((p) => [p.id, 0])),
    queen: null,
    jack: null,
  }),

  validateRound: (input: HeartsInput, ctx: RoundContext): string | null =>
    validateRoundLogic(input, ctx.players, ctx.config),

  scoreRound: (input: HeartsInput, ctx: RoundContext): Record<ID, number> =>
    scoreRoundLogic(input, ctx.players, ctx.config),

  isFinished: (totals, { config }) => isFinishedLogic(totals, config),

  describeRound: (round: Round, players): string => {
    const input = round.input as HeartsInput;
    const name = (id: ID | null) => players.find((p) => p.id === id)?.name ?? '?';
    const moon = shooter(input);
    if (moon) return `🌙 ${name(moon)} shot the moon`;
    const parts = [`♠Q: ${name(input.queen)}`];
    if (input.jack) parts.push(`♦J: ${name(input.jack)}`);
    return parts.join(' · ');
  },

  stats: heartsStats,

  RoundEditor: Editor,
};
