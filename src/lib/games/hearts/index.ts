import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { heartsStats } from './stats';

export interface HeartsInput {
  hearts: Record<ID, number>;
  queen: ID | null;
  jack: ID | null;
}

function shooter(input: HeartsInput): ID | null {
  for (const [id, h] of Object.entries(input.hearts)) {
    if (h === 13 && input.queen === id) return id;
  }
  return null;
}

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

  validateRound: (input: HeartsInput, ctx: RoundContext): string | null => {
    const total = Object.values(input.hearts).reduce((a, b) => a + (Number(b) || 0), 0);
    if (total !== 13) return `Hearts must total 13 (currently ${total}).`;
    if (!input.queen) return 'Assign the Queen of Spades (♠Q) to whoever took it.';
    if (ctx.config.variantJack && !input.jack) {
      return 'Assign the Jack of Diamonds (♦J) to whoever took it.';
    }
    return null;
  },

  scoreRound: (input: HeartsInput, ctx: RoundContext): Record<ID, number> => {
    const variantJack = !!ctx.config.variantJack;
    const moonRule = ctx.config.moonRule ?? 'add26';
    const base: Record<ID, number> = {};
    for (const p of ctx.players) {
      const id = p.id;
      base[id] =
        (Number(input.hearts[id]) || 0) +
        (input.queen === id ? 13 : 0) -
        (variantJack && input.jack === id ? 10 : 0);
    }
    const moon = shooter(input);
    if (!moon) return base;

    const out: Record<ID, number> = {};
    for (const p of ctx.players) {
      if (moonRule === 'subtract') {
        out[p.id] = p.id === moon ? -26 : base[p.id];
      } else {
        out[p.id] = p.id === moon ? 0 : base[p.id] + 26;
      }
    }
    return out;
  },

  isFinished: (totals, { config }) => {
    const end = Number(config.endScore) || 100;
    return Object.values(totals).some((t) => t >= end);
  },

  describeRound: (round: Round, players): string => {
    const input = round.input as HeartsInput;
    const name = (id: ID | null) => players.find((p) => p.id === id)?.name ?? '?';
    const moon = shooter(input);
    if (moon) return `🌙 ${name(moon)} shot the moon`;
    return `♠Q: ${name(input.queen)}`;
  },

  stats: heartsStats,

  RoundEditor,
  editorLoader: () => import('./HeartsEditor.svelte'),
};
