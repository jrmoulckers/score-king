import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { cribbageStats } from './stats';
import {
  describeDeal,
  emptyInput,
  isFinished as cribbageFinished,
  scoreRound as scoreCribbage,
  validateRound as validateCribbage,
  type CribbageInput,
} from './logic';

export type { Card, CribbageInput, CribbageConfig, Breakdown, UnitEntry, SkunkKind } from './logic';

/** A deal this big is worth a nudge in the scorecard. */
const MONSTER_DEAL = 20;

export const cribbage: GameModule = {
  id: 'cribbage',
  name: 'Cribbage',
  tagline: 'Fifteen-two, fifteen-four — peg your way to 121.',
  emoji: '🂠',
  keywords: ['crib', 'pegging', 'board', 'fifteens', 'nob', 'skunk', 'cards', 'two player'],
  minPlayers: 2,
  maxPlayers: 4,
  teams: true,
  configFields: [
    {
      key: 'target',
      label: 'Length of board',
      type: 'select',
      default: '121',
      options: [
        { value: '121', label: 'Long game — 121 (twice around)' },
        { value: '61', label: 'Short game — 61 (once around)' },
      ],
      help: 'First side to peg out wins. 121 is the classic; 61 is the quick one when the night is nearly over.',
    },
    {
      key: 'mode',
      label: 'Four players',
      type: 'select',
      default: 'solo',
      options: [
        { value: 'solo', label: 'Everyone for themselves' },
        { value: 'partners', label: 'Partnerships: 1 & 2  vs  3 & 4' },
      ],
      help: 'Four-handed cribbage is usually two partnerships pegging one score each. Ignored with two or three players.',
    },
    {
      key: 'skunks',
      label: 'Call out skunks at the finish',
      type: 'boolean',
      default: true,
      help: 'A loser short of the skunk line (91 on a 121 board) is skunked; short of half the board, double skunked.',
    },
  ],

  createRoundInput: (ctx: RoundContext): CribbageInput =>
    emptyInput(ctx.players, ctx.roundIndex, ctx.config),

  validateRound: (input: CribbageInput, ctx: RoundContext): string | null =>
    validateCribbage(input, ctx.players, ctx.config),

  scoreRound: (input: CribbageInput, ctx: RoundContext): Record<ID, number> =>
    scoreCribbage(input, ctx.players, ctx.config),

  isFinished: (totals, { config }) => cribbageFinished(totals, config),

  describeRound: (round: Round, players): string =>
    describeDeal(round.input as CribbageInput | undefined, players, round.deltas ?? {}),

  // Scorecard emphasis for the two deals worth a second look: a monster count,
  // and the deal where a side took nothing at all. Both are co-signalled by the
  // title/AT label, and only the per-round (delta) view asks for a tone.
  roundCellTone: (round: Round, playerId: ID) => {
    const delta = round.deltas?.[playerId];
    if (delta == null) return null;
    if (delta >= MONSTER_DEAL) return { tone: 'good', label: `Monster deal (+${delta})` };
    if (delta === 0) return { tone: 'bad', label: 'Shut out — nothing pegged' };
    return null;
  },

  help: [
    'Cribbage is a race up a board: first side to peg out (121 holes, or 61 for a',
    'short game) wins the moment they get there.',
    '',
    'Every deal has three scoring beats, and this editor records them in that order:',
    '',
    '1. The play ("pegging") — fifteens, pairs, runs, a go, and last card. Tap the',
    '   total each side pegged during the play.',
    '2. The hands — non-dealer counts first, then the dealer.',
    '3. The crib — the dealer’s alone, counted last.',
    '',
    'Counting a hand (four cards plus the cut starter):',
    '• Fifteens — every combination adding to 15 is worth 2.',
    '• Pairs — every pair is 2, so three of a kind is 6 and four of a kind is 12.',
    '• Runs — three or more in rank, worth their length, once for each way it can',
    '  be made (a double run of three is 6).',
    '• Flush — 4 for four cards of a suit, 5 if the starter matches. The crib only',
    '  flushes on all five, for 5.',
    '• Nob — 1 for a jack in hand matching the starter’s suit.',
    '',
    '🂻 His heels: if the cut turns a jack, the dealer takes 2 straight away.',
    '',
    'The deal rotates every hand, and the crib always belongs to whoever dealt.',
    '',
    '🦨 Skunk: the loser finishes short of the skunk line (91 on a 121 board).',
    '🦨🦨 Double skunk: they finish short of half the board (61). Talked about for years.',
    '',
    'No hand of five cards can ever count 19 — which is why a worthless hand is',
    'jokingly called "a nineteen".',
  ].join('\n'),

  stats: cribbageStats,

  RoundEditor,
  editorLoader: () => import('./CribbageEditor.svelte'),
};
