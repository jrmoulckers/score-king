import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { canastaStats } from './stats';
import {
  type CanastaInput,
  describeHand,
  emptyHand,
  handScore,
  pairingFromConfig,
  resolveTeams,
  scoreCanasta,
  targetFromConfig,
  validateCanasta,
} from './logic';

export type { CanastaHand, CanastaInput } from './logic';
export {
  canastaBonus,
  emptyHand,
  handScore,
  leadingTeam,
  minimumInitialMeld,
  outBonus,
  pairingFromConfig,
  redThreeBonus,
  resolveTeams,
  targetFromConfig,
  teamTotals,
  toTarget,
} from './logic';

export const canasta: GameModule = {
  id: 'canasta',
  name: 'Canasta',
  tagline: 'Meld sevens, stack canastas, race to 5000.',
  emoji: '🃏',
  keywords: ['rummy', 'melds', 'partners', 'teams', 'cards', 'wild cards', 'red threes'],
  minPlayers: 2,
  maxPlayers: 4,
  teams: true,
  configFields: [
    {
      key: 'pairing',
      label: 'Partnerships (4 players)',
      type: 'select',
      default: 'adjacent',
      options: [
        { value: 'adjacent', label: 'Teams: 1 & 2  vs  3 & 4' },
        { value: 'across', label: 'Teams: 1 & 3  vs  2 & 4' },
      ],
      help: 'How four players split into two partnerships (by pick order). Ignored with two players.',
    },
    {
      key: 'target',
      label: 'Play to',
      type: 'number',
      default: 5000,
      min: 500,
      step: 100,
      help: 'First team past this score at the end of a hand wins. Classic Canasta is 5000.',
    },
  ],

  createRoundInput: (ctx: RoundContext): CanastaInput => ({
    teams: resolveTeams(ctx.players, pairingFromConfig(ctx.config)),
    hands: [emptyHand(), emptyHand()],
  }),

  validateRound: (input: CanastaInput): string | null => validateCanasta(input),

  scoreRound: (input: CanastaInput): Record<ID, number> => scoreCanasta(input),

  isFinished: (totals, { config }) => {
    const target = targetFromConfig(config);
    return Object.values(totals).some((t) => t >= target);
  },

  describeRound: (round: Round, players): string => {
    const input = round.input as CanastaInput;
    const deltas = round.deltas ?? {};
    const scoreOf = (idx: 0 | 1): number => {
      const id = input.teams?.[idx]?.[0];
      return id != null ? (deltas[id] ?? handScore(input.hands[idx])) : handScore(input.hands[idx]);
    };
    return describeHand(input, players, [scoreOf(0), scoreOf(1)]);
  },

  help: [
    'Canasta — 4 players in two fixed partnerships (2 players also works, each their own team).',
    'Melds are 3+ cards of the same rank; a canasta is a meld of 7 or more.',
    '',
    'Card points (for melded cards, and for cards left in hand):',
    '• Jokers 50 · Aces & 2s 20 · Kings–8s 10 · 7s–4s & black 3s 5',
    '',
    'Each hand a team scores:',
    '• +500 per natural (pure) canasta, +300 per mixed canasta (has a wild card).',
    '• +100 per red three melded — or +800 for collecting all four.',
    '• +100 for going out, +200 for going out concealed (all cards laid down at once).',
    '• + the point value of every card melded on the table.',
    '• − the point value of every card still in hand.',
    '',
    "A team's very first meld each hand must clear a minimum, based on their score",
    'before the hand: below 0 → 15 · 0–1,495 → 50 · 1,500–2,995 → 90 · 3,000+ → 120.',
    '',
    'First team past the target score (5000 classic) at the end of a hand wins.',
  ].join('\n'),

  stats: canastaStats,

  RoundEditor,
  editorLoader: () => import('./CanastaEditor.svelte'),
};
