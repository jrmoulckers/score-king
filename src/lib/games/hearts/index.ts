import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { heartsStats } from './stats';
import {
  describeRound as describeHeartsRound,
  emptyInput,
  isFinished as heartsFinished,
  readConfig,
  HEARTS_TOTAL,
  moonPoints,
  savedPassMode,
  scoreRound as scoreHearts,
  queenCount,
  shooter,
  validateRound as validateHearts,
  wrongWayPlayers,
  type HeartsInput,
} from './logic';

export type {
  HeartsInput,
  HeartsConfig,
  MoonRule,
  PassMode,
  PassDirection,
  PassInfo,
} from './logic';

export const hearts: GameModule = {
  id: 'hearts',
  name: 'Hearts',
  tagline: 'Avoid hearts & the Queen of Spades',
  emoji: '♥️',
  keywords: ['trick taking', 'shooting the moon', 'queen of spades', 'double deck', 'cards'],
  minPlayers: 3,
  maxPlayers: 11,
  maxPlayersForConfig: (config) => (readConfig(config).deckCount === 2 ? 11 : 6),
  lowerIsBetter: true,
  configFields: [
    {
      key: 'deckCount',
      label: 'Decks',
      type: 'select',
      default: '1',
      options: [
        { value: '1', label: 'Single deck (26 points)' },
        { value: '2', label: 'Double deck (52 points)' },
      ],
      rulesSummary: (config) => {
        const decks = readConfig(config).deckCount;
        return [
          `${HEARTS_TOTAL * decks} hearts`,
          `${decks} Queen${decks === 1 ? '' : 's'}`,
          `${moonPoints(config)}-point moon`,
        ];
      },
    },
    {
      key: 'endScore',
      label: 'End the game when a player reaches',
      type: 'number',
      default: 100,
      min: 10,
    },
    {
      key: 'variantJack',
      label: 'Jack of Diamonds = −10 (Omnibus variant)',
      type: 'boolean',
      default: false,
      advanced: true,
      help: 'Adds one good card worth grabbing: whoever takes the ♦J shaves 10 off their round.',
    },
    {
      key: 'passMode',
      section: 'Card Passing',
      label: 'Passing direction',
      type: 'select',
      default: 'clockwise',
      defaultForSaved: savedPassMode,
      options: [
        { value: 'clockwise', label: 'Clockwise (left)' },
        { value: 'counterclockwise', label: 'Counterclockwise (right)' },
        { value: 'rotating', label: 'Rotating cycle' },
        {
          value: 'legacy',
          label: 'Original cycle (saved setup)',
          showIf: (config) => config.passMode === 'legacy',
        },
        {
          value: 'legacy-hidden',
          label: 'Original cycle, reminder hidden (saved setup)',
          showIf: (config) => config.passMode === 'legacy-hidden',
        },
      ],
      rulesSummary: (config) => {
        switch (savedPassMode(config)) {
          case 'clockwise':
            return ['Left every hand'];
          case 'counterclockwise':
            return ['Right every hand'];
          case 'rotating':
            return [
              '4 players: Left, Right, Across, Hold',
              'Other tables: nearest left/right pairs, then farther pairs, across once if even, then hold',
            ];
          case 'legacy':
            return ['Original saved cycle: each seat in order, then hold'];
          case 'legacy-hidden':
            return ['Original saved cycle; reminders remain hidden'];
        }
      },
      help: 'Directions follow physical seating, not scoreboard order.',
    },
    {
      key: 'passCardCount',
      section: 'Card Passing',
      label: 'Cards each player passes',
      type: 'number',
      default: 3,
      min: 1,
      max: 13,
      step: 1,
    },
  ],

  createRoundInput: (ctx: RoundContext): HeartsInput => emptyInput(ctx.players.map((p) => p.id)),

  validateRound: (input: HeartsInput, ctx: RoundContext): string | null =>
    validateHearts(input, ctx.players, ctx.config),

  scoreRound: (input: HeartsInput, ctx: RoundContext): Record<ID, number> =>
    scoreHearts(
      input,
      ctx.players.map((p) => p.id),
      ctx.config,
    ),

  isFinished: (totals, { config }) => heartsFinished(totals, config),

  describeRound: (round: Round, players): string =>
    describeHeartsRound(round.input as HeartsInput, players),

  // Per-round scorecard emphasis: mark whoever ate the Queen in coral, and add a
  // compact arrow for optional wrong-way metadata. Only the per-round view asks
  // for these details, never the running totals.
  roundCellTone: (round: Round, playerId: ID) => {
    const input = round.input as HeartsInput | undefined;
    if (!input) return null;
    const wentWrongWay = wrongWayPlayers(input).includes(playerId);
    const tookQueen = !shooter(input) && queenCount(input, playerId) > 0;
    if (tookQueen) {
      return {
        tone: 'bad',
        label: wentWrongWay ? 'Took a ♠Q (+13) and went the wrong way' : 'Took a ♠Q (+13)',
        marker: wentWrongWay ? '↩' : undefined,
      };
    }
    return wentWrongWay ? { label: 'Went the wrong way', marker: '↩' } : null;
  },

  help: [
    'Hearts is a dodging game: lowest score wins. A single-deck round hands out 26',
    'penalty points — 13 hearts (♥ = 1 each) and one Queen of Spades (♠Q = 13).',
    'Double deck doubles the pool: 26 hearts, two Queens, and 52 points. Take as few',
    'as you can.',
    '',
    'Each round: give every heart to whoever took it (13 per deck), then assign each',
    '♠Q to whoever got stuck with it.',
    '',
    '🌙 Shoot the moon: take every heart AND every ♠Q in one round. Instead of eating',
    '26 (or 52 with two decks), you flip it. The shooter chooses: everyone else takes',
    '+26/+52, or the shooter takes −26/−52.',
    'A huge, risky swing: miss it by one heart and you just took the whole load.',
    '',
    '♦J Omnibus (optional): each Jack of Diamonds is a good card — whoever takes one',
    'shaves 10 points off their round.',
    '',
    'Card Passing: clockwise (left) or counterclockwise (right) stays the same each',
    'hand. Rotating cycle alternates left/right recipients, nearest first, then holds.',
    'Four players: Left, Right, Across, Hold. Larger tables visit every other seat',
    'before holding; only even-sized tables have an across seat. Directions refer',
    'to physical seating, not score order. Pass the configured number of cards.',
    'Saved setups keep their original cycle and reminder visibility until you',
    'choose a new passing direction. Passing never changes recorded scores.',
    '',
    'The game ends when someone reaches the end score (100 by default). Lowest total',
    'at that moment wins the crown.',
  ].join('\n'),

  stats: heartsStats,

  RoundEditor,
  editorLoader: () => import('./HeartsEditor.svelte'),
};
