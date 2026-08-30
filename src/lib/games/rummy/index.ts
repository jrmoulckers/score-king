import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { rummyStats } from './stats';
import {
  createRummyInput,
  isRummyFinished,
  opponentsTotal,
  scoreRummy,
  validateRummy,
  type RummyInput,
} from './logic';

export type { RummyInput, RummyConfig, RummyHand } from './logic';

export const rummy: GameModule = {
  id: 'rummy',
  name: 'Rummy',
  tagline: 'Meld your hand, then stick everyone else with their deadwood',
  emoji: '🎴',
  keywords: ['rummy', 'gin rummy', 'melds', 'sets', 'runs', 'cards', 'deadwood'],
  minPlayers: 2,
  maxPlayers: 6,
  configFields: [
    { key: 'target', label: 'Play to (points)', type: 'number', default: 100, min: 1, step: 10 },
    {
      key: 'aceHigh',
      label: 'Aces score high (15, not 1)',
      type: 'boolean',
      default: false,
      help: 'Classic Rummy counts a leftover Ace as 1 point. Flip this on to count it as 15 instead.',
    },
    {
      key: 'allowRummyBonus',
      label: 'Allow "Rummy" double bonus',
      type: 'boolean',
      default: true,
      help: 'Going out in one turn with no prior melds laid down doubles that hand\u2019s score.',
    },
  ],

  createRoundInput: (ctx: RoundContext): RummyInput => createRummyInput(ctx.players.map((p) => p.id)),

  validateRound: (input: RummyInput, ctx: RoundContext): string | null =>
    validateRummy(input, ctx.players),

  scoreRound: (input: RummyInput, ctx: RoundContext): Record<ID, number> =>
    scoreRummy(
      input,
      ctx.players.map((p) => p.id),
      ctx.config,
    ),

  isFinished: (totals, { config }) => isRummyFinished(totals, config),

  describeRound: (round: Round, players): string => {
    const input = round.input as RummyInput;
    if (!input?.out) return 'no result';
    const winner = players.find((p) => p.id === input.out)?.name ?? '?';
    const onTable = opponentsTotal(
      input,
      players.map((p) => p.id),
    );
    const bonus = input.wentRummy ? ' · went Rummy! ×2' : '';
    return onTable > 0
      ? `🎴 ${winner} out · ${onTable} deadwood left${bonus}`
      : `🎴 ${winner} out · clean sweep${bonus}`;
  },

  help: [
    'Meld sets (3–4 of a rank) and runs (3+ in sequence, same suit) from your hand.',
    'Draw a card, optionally meld or lay off, then discard to end your turn.',
    '',
    'Empty your hand to go out and end the round. You score the deadwood left in',
    'everyone else\u2019s hand:',
    '• Number cards (2\u201310) \u2014 face value',
    '• Face cards (J, Q, K) \u2014 10 each',
    '• Aces \u2014 1 (low) or 15 (high), per your table\u2019s house rule',
    '',
    'Went "Rummy"? Going out in a single turn with no melds laid down beforehand',
    'doubles your score for that hand (optional house rule).',
    '',
    'First player to the target score (default 100) wins.',
  ].join('\n'),

  stats: rummyStats,

  RoundEditor,
  editorLoader: () => import('./RummyEditor.svelte'),
};
