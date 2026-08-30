import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { ersStats } from './stats';
import {
  createErsInput,
  describeErs,
  isErsFinished,
  scoreErs,
  validateErs,
  type ErsInput,
} from './logic';

export type { ErsInput, ErsConfig } from './logic';

export const ers: GameModule = {
  id: 'ers',
  name: 'Egyptian Rat Screw',
  tagline: 'Slap fast, win the deck',
  emoji: '🐀',
  keywords: [
    'ers',
    'rat screw',
    'ratscrew',
    'slapjack',
    'slap jack',
    'cards',
    'reflexes',
    'slap',
  ],
  minPlayers: 2,
  maxPlayers: 8,
  configFields: [
    {
      key: 'target',
      label: 'Hands to take the night',
      type: 'number',
      default: 3,
      min: 0,
      help: 'First to win this many hands takes the night. 0 = no limit — play until you call it.',
    },
  ],

  createRoundInput: (): ErsInput => createErsInput(),

  validateRound: (input: ErsInput, ctx: RoundContext): string | null =>
    validateErs(input, ctx.players.map((p) => p.id)),

  scoreRound: (input: ErsInput, ctx: RoundContext): Record<ID, number> =>
    scoreErs(input, ctx.players.map((p) => p.id)),

  isFinished: (totals, { config }) => isErsFinished(totals, config),

  describeRound: (round: Round, players): string =>
    describeErs(round.input as ErsInput | undefined, players),

  help: [
    'Egyptian Rat Screw (ERS) 🐀 has no running score — it’s winner-take-all. Deal the whole',
    'deck out face-down, evenly, no peeking. Players take turns flipping their top card',
    'face-up onto a shared center pile. This tracker just records who wins each hand; the',
    'table plays it out and taps the winner when the deck is theirs.',
    '',
    'FACE CARD CHALLENGES — playing a face card or Ace forces the next player to answer',
    'with one of their own within a set number of chances, or the challenger takes the pile:',
    '• Jack 🃋 — 1 chance',
    '• Queen 🃍 — 2 chances',
    '• King 🃎 — 3 chances',
    '• Ace 🂡 — 4 chances',
    'Answering with another face card resets the chances for the next player in line.',
    '',
    'SLAPS — any player, any time, can slap the pile to claim it on sight of:',
    '• Doubles — two cards of the same rank in a row (7, 7).',
    '• Sandwiches — two same-rank cards split by one other (7, 3, 7).',
    '• Top-bottom — the top card of the pile matches the very bottom card.',
    'Popular house-rule slaps: Marriage (K + Q together), 10s (two cards adding to 10, Ace = 1),',
    'and runs of four in a row. Agree on house rules before you deal.',
    '',
    'A wrong slap costs a penalty card, usually placed face-up at the bottom of the pile.',
    'Players who run out of cards stay in and can still slap back in. The hand ends — and',
    'a winner is recorded — the moment one player holds the entire deck.',
  ].join('\n'),

  stats: ersStats,

  RoundEditor,
  editorLoader: () => import('./ErsEditor.svelte'),
};
