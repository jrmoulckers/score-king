import type { GameModule, Round, RoundContext } from '../../types';
import Editor from './FluffEditor.svelte';
import { fluffStats } from './stats';
import {
  describeRound,
  isFinished,
  pickWinners,
  scoreRound,
  validateRound,
  type FluffInput,
} from './logic';

export type { FluffInput, FluffResult } from './logic';

export const fluff: GameModule = {
  id: 'fluff',
  name: 'Fluff',
  tagline: 'Bluff your bids, keep your dice.',
  emoji: '🎲',
  keywords: ["liar's dice", 'perudo', 'dudo', 'bluffing', 'dice', 'bidding', 'elimination'],
  minPlayers: 2,
  maxPlayers: 8,
  // Fewest dice lost leads — the last cup standing wins.
  lowerIsBetter: true,

  configFields: [
    {
      key: 'startDice',
      label: 'Dice per player to start',
      type: 'number',
      default: 5,
      min: 1,
      max: 6,
      help: 'Everyone begins with this many dice. Lose your last one and you’re out.',
    },
    {
      key: 'onesWild',
      label: 'Ones are wild',
      type: 'boolean',
      default: true,
      help: 'Ones count as every face when the dice are revealed (except during a Palifico round).',
    },
    {
      key: 'spotOn',
      label: 'Allow “spot-on” calls',
      type: 'boolean',
      default: false,
      help: 'Call the exact count and, if you nail it, win a die back instead of losing one.',
    },
  ],

  createRoundInput: (_ctx: RoundContext): FluffInput => ({ playerId: null, result: 'lose' }),

  validateRound,
  scoreRound,

  isFinished: (totals, info) => isFinished(totals, info),
  pickWinners,

  describeRound: (round: Round, players): string => describeRound(round, players),

  help: [
    '🎲 Fluff — a.k.a. Liar’s Dice / Perudo. Bluff, bid, and call. Last cup standing wins.',
    '',
    'Each player shakes their dice under a cup and peeks in secret.',
    'On your turn, raise the bid — a quantity and a face across ALL dice on the table',
    '(e.g. “four 5s”) — by upping the quantity, the face, or both…',
    '…or call “Fluff!” if you think the last bid is a bluff.',
    '',
    'When someone calls, every cup lifts and you count that face:',
    '• Bid was too high (a bluff) → the bidder loses a die.',
    '• Bid was right or low → the caller loses a die.',
    '',
    'Lose your last die and you’re knocked out. Play until one player remains.',
    '',
    'Ones are wild — they count as any face (toggle in setup).',
    'Spot-on (optional): nail the exact count and win a die back instead.',
    'Palifico: the first time a player drops to one die, that round fixes a single',
    'face and ones aren’t wild.',
    '',
    'This tracker keeps the dice count: tap whoever lost the die each challenge.',
  ].join('\n'),

  stats: fluffStats,

  RoundEditor: Editor,
};
