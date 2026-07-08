import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './TwoRoomsEditor.svelte';
import { twoRoomsStats } from './stats';
import {
  DEFAULT_ROUNDS,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_PLAYERS,
  MIN_ROUNDS,
  createInput,
  describe,
  pickWinners as pickWinnersLogic,
  roundCount,
  score,
  suggestedHostages,
  validate,
  type TwoRoomsInput,
} from './logic';

export type { TwoRoomsInput } from './logic';

const ids = (ctx: RoundContext): ID[] => ctx.players.map((p) => p.id);

export const tworooms: GameModule = {
  id: 'tworooms',
  name: 'Two Rooms and a Boom',
  tagline: 'Blue’s President vs Red’s Bomber — two rooms, one boom',
  emoji: '💣',
  keywords: [
    'social deduction',
    'hidden role',
    'party',
    'team',
    'president',
    'bomber',
    'spy',
    'werewolf',
    'two rooms',
  ],
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  teams: true,
  configFields: [
    {
      key: 'rounds',
      label: 'Number of rounds',
      type: 'number',
      default: DEFAULT_ROUNDS,
      min: MIN_ROUNDS,
      max: MAX_ROUNDS,
      help: 'Each round is a minute shorter than the last, down to a one-minute finish. The Reveal rides on the final round.',
    },
    {
      key: 'advancedRoles',
      label: 'Playing with advanced character cards',
      type: 'boolean',
      default: false,
      help: 'Adds colored roles beyond the President & Bomber. Deal those by hand — the tracker still records leaders, hostages, and the winning team.',
    },
  ],

  maxRounds: (config) => roundCount(config),

  createRoundInput: (ctx: RoundContext): TwoRoomsInput => {
    const input = createInput();
    // Pre-fill the steppers with the official suggestion so a room usually just
    // confirms; the last round always trades one hostage.
    const h = suggestedHostages(ctx.players.length, ctx.roundIndex, ctx.config);
    input.sent1 = h;
    input.sent2 = h;
    return input;
  },

  validateRound: (input: TwoRoomsInput, ctx: RoundContext): string | null =>
    validate(input, ctx.roundIndex, ctx.config, ids(ctx)),

  scoreRound: (input: TwoRoomsInput, ctx: RoundContext): Record<ID, number> =>
    score(input, ctx.roundIndex, ctx.config, ids(ctx)),

  /**
   * Scoreless team game: the reveal round tags each winner with +1, so the top
   * total is exactly the winning team. Returns [] while undecided (all zero).
   */
  pickWinners: (totals) => pickWinnersLogic(totals),

  describeRound: (round: Round, players): string =>
    describe(round.input as TwoRoomsInput, (id) => players.find((p) => p.id === id)?.name ?? '?'),

  help: [
    '💣 Two teams, two rooms, one bomb.',
    'Blue Team has the President. Red Team has the Bomber.',
    '',
    'Split the group evenly across two rooms and deal one secret character card each.',
    'Play a set number of timed rounds (each a minute shorter than the last). Each room',
    'appoints a Leader; at the end of the round the Leaders trade hostages between rooms.',
    '',
    'Hostages traded per round (per room):',
    '• 6–10 players: 1 · 1 · 1',
    '• 11–21 players: 2 · 1 · 1',
    '• 22+ players: 3 · 2 · 1',
    'The final round always trades a single hostage.',
    '',
    'After the last exchange, everyone reveals their card:',
    '• Bomber in the President’s room → 💥 RED Team wins.',
    '• Otherwise → 🕊️ BLUE Team wins.',
    '',
    'Odd number of players? Add the Gambler (grey) to even the deck.',
  ].join('\n'),

  stats: twoRoomsStats,

  RoundEditor: Editor,
};
