import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { golfStats } from './stats';
import { createGolfInput, readConfig, scoreGolf, validateGolf, type GolfInput } from './logic';

export type { GolfInput, GolfConfig, GridSize } from './logic';

export const golf: GameModule = {
  id: 'golf',
  name: 'Golf',
  tagline: 'Fewest points over 9 holes wins',
  emoji: '⛳',
  keywords: ['cards', 'six card golf', 'polka', 'lowest', 'grid', 'holes', 'par'],
  minPlayers: 2,
  maxPlayers: 8,
  lowerIsBetter: true,
  configFields: [
    { key: 'holes', label: 'Number of holes', type: 'number', default: 9, min: 1, max: 18 },
    {
      key: 'grid',
      label: 'Grid size',
      type: 'select',
      default: '6',
      options: [
        { value: '6', label: '6 cards (3×2)' },
        { value: '4', label: '4 cards (2×2)' },
        { value: '9', label: '9 cards (3×3)' },
      ],
      help: 'How many cards each player lays out per hole.',
    },
    {
      key: 'kingValue',
      label: 'King value',
      type: 'select',
      default: '0',
      options: [
        { value: '0', label: 'King = 0' },
        { value: '-2', label: 'King = −2' },
      ],
      help: 'Kings are free in the common ruleset; −2 is a popular variant.',
    },
    {
      key: 'jokers',
      label: 'Jokers count −2',
      type: 'boolean',
      default: false,
      help: 'Add two −2 Jokers to the deck for deeper red numbers.',
    },
  ],

  maxRounds: (config) => readConfig(config).holes,

  createRoundInput: (ctx: RoundContext): GolfInput => createGolfInput(ctx.players),
  validateRound: validateGolf,
  scoreRound: scoreGolf,

  describeRound: (round: Round, players): string => {
    const input = round.input as GolfInput;
    const scores = input?.scores ?? {};
    const parts = players
      .filter((p) => p.id in scores)
      .map((p) => `${p.name} ${Math.trunc(Number(scores[p.id]) || 0)}`);
    return parts.length ? `Hole ${round.index + 1} · ${parts.join(' · ')}` : `Hole ${round.index + 1}`;
  },

  help: [
    'Golf — play 9 holes and finish with the FEWEST points.',
    '',
    'Each hole, everyone lays out a face-down grid (6 cards by default) and',
    'flips them as play goes. Add up your grid and call out the hole score.',
    '',
    'Card values (common ruleset):',
    '• Ace = 1',
    '• 2–10 = face value',
    '• Jack / Queen = 10',
    '• King = 0  (some groups play −2)',
    '• Joker = −2  (optional)',
    '',
    'Two equal cards in the SAME COLUMN cancel each other to 0 — the heart of',
    'Golf, and how a clean grid reaches 0 or dips into the red.',
    '',
    'Lowest running total after the last hole wins the round of Golf.',
  ].join('\n'),

  stats: golfStats,

  RoundEditor,
  editorLoader: () => import('./GolfEditor.svelte'),
};
