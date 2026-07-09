import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { euchreStats } from './stats';
import {
  type EuchreInput,
  describeHand,
  optionsFromConfig,
  pairingFromConfig,
  resolveTeams,
  scoreEuchre,
  targetFromConfig,
  validateEuchre,
} from './logic';

export type { EuchreInput } from './logic';

export const euchre: GameModule = {
  id: 'euchre',
  name: 'Euchre',
  tagline: 'Call trump, take tricks, race to 10.',
  emoji: '🃏',
  keywords: ['trick taking', 'trump', 'partners', 'teams', 'bower', 'cards'],
  minPlayers: 4,
  maxPlayers: 4,
  teams: true,
  configFields: [
    {
      key: 'pairing',
      label: 'Partnerships',
      type: 'select',
      default: 'adjacent',
      options: [
        { value: 'adjacent', label: 'Teams: 1 & 2  vs  3 & 4' },
        { value: 'across', label: 'Teams: 1 & 3  vs  2 & 4' },
      ],
      help: 'How the four players you pick split into two teams (by pick order).',
    },
    {
      key: 'target',
      label: 'Play to',
      type: 'number',
      default: 10,
      min: 1,
      help: 'First team to reach this score wins. Classic euchre is 10; some play to 5.',
    },
    {
      key: 'aloneBonus',
      label: 'Going alone & sweeping all 5 scores 4 (otherwise 2)',
      type: 'boolean',
      default: true,
    },
    {
      key: 'loneEuchreBonus',
      label: 'Euchring a lone caller scores the defenders 4 (otherwise 2)',
      type: 'boolean',
      default: false,
    },
  ],

  createRoundInput: (ctx: RoundContext): EuchreInput => ({
    teams: resolveTeams(ctx.players, pairingFromConfig(ctx.config)),
    maker: null,
    alone: false,
    alonePlayer: null,
    result: null,
  }),

  validateRound: (input: EuchreInput): string | null => validateEuchre(input),

  scoreRound: (input: EuchreInput, ctx: RoundContext): Record<ID, number> =>
    scoreEuchre(input, optionsFromConfig(ctx.config)),

  isFinished: (totals, { config }) => {
    const target = targetFromConfig(config);
    return Object.values(totals).some((t) => t >= target);
  },

  describeRound: (round: Round, players): string => {
    const input = round.input as EuchreInput;
    const awarded = Math.max(0, ...Object.values(round.deltas ?? {}));
    return describeHand(input, players, awarded);
  },

  help: [
    'Euchre — 4 players in two fixed teams, a 24-card deck, 5 tricks a hand.',
    'One team names trump — "the makers".',
    '',
    'Each hand:',
    '• Makers take 3 or 4 tricks — 1 point.',
    '• Makers take all 5 (a "march") — 2 points.',
    '• A maker goes alone and takes all 5 — 4 points.',
    '  (Alone but only 3–4 tricks still scores 1.)',
    '• Makers fail to reach 3 tricks — they are "euchred" and the defenders score 2.',
    '',
    'First team to 10 wins (some play to 5).',
    'The right & left bowers — the two jacks of the trump colour — are the top trumps.',
  ].join('\n'),

  stats: euchreStats,

  RoundEditor,
  editorLoader: () => import('./EuchreEditor.svelte'),
};
