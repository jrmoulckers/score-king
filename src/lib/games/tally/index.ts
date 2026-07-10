import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import {
  createTallyInput,
  isTallyFinished,
  lowerIsBetter,
  scoreTally,
  type TallyInput,
} from './logic';

export type { TallyInput } from './logic';

export const tally: GameModule = {
  id: 'tally',
  name: 'Tally',
  tagline: 'Universal point counter for any game',
  emoji: '🎯',
  keywords: ['counter', 'points', 'generic', 'any game', 'score'],
  minPlayers: 1,
  maxPlayers: 12,
  configFields: [
    {
      key: 'direction',
      label: 'Who wins',
      type: 'select',
      default: 'high',
      options: [
        { value: 'high', label: 'Highest score' },
        { value: 'low', label: 'Lowest score' },
      ],
    },
    {
      key: 'step',
      label: 'Point step',
      type: 'number',
      default: 1,
      min: 1,
      help: 'The natural increment for the − / + buttons and quick-add chips (1, 5, 10…).',
    },
    {
      key: 'target',
      label: 'Target score to win (0 = no limit)',
      type: 'number',
      default: 0,
      min: 0,
      help: 'When set, the game ends the moment anyone reaches it — highest wins, or lowest for a low-score game.',
    },
  ],
  resolveLowerIsBetter: (c) => lowerIsBetter(c),

  createRoundInput: (ctx: RoundContext): TallyInput =>
    createTallyInput(ctx.players.map((p) => p.id)),

  validateRound: () => null,

  scoreRound: (input: TallyInput): Record<ID, number> => scoreTally(input),

  isFinished: (totals, { config }) => isTallyFinished(totals, config),

  help:
    'Tally is the all-purpose counter for any game. Pick whether the highest or lowest ' +
    'score wins, set a point step to match how your game scores (1s, 5s, 10s…), and an ' +
    'optional target to end the game automatically. Each round, tap the quick-add chips or ' +
    'the − / + buttons to log every player’s points; the board shows where the round lands ' +
    'them before you save. Points can go negative for games that subtract.',

  describeRound: (round: Round) => {
    const input = round.input as TallyInput;
    const parts = Object.entries(input.deltas)
      .filter(([, v]) => v)
      .map(([, v]) => (v > 0 ? `+${v}` : `${v}`));
    return parts.length ? parts.join(' / ') : 'no change';
  },

  RoundEditor,
  editorLoader: () => import('./TallyEditor.svelte'),
};
