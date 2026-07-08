import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './WerewordsEditor.svelte';
import { werewordsStats } from './stats';
import {
  describeWerewords,
  scoreWerewords,
  validateWerewords,
  type WerewordsInput,
} from './logic';

export type { WerewordsInput, WerewordsTeam, WerewordsOutcome } from './logic';
export { resolveOutcome, teamOf, isWerewolf } from './logic';

const ids = (ctx: RoundContext): ID[] => ctx.players.map((p) => p.id);

export const werewords: GameModule = {
  id: 'werewords',
  name: 'Werewords',
  tagline: 'Crack the secret word before the wolves win',
  emoji: '🐺',
  keywords: [
    'social deduction',
    'word game',
    'party',
    'werewolf',
    'guessing',
    'mayor',
    'seer',
    'hidden roles',
  ],
  minPlayers: 3,
  maxPlayers: 12,
  configFields: [
    { key: 'werewolves', label: 'Werewolves', type: 'number', default: 1, min: 1, max: 4 },
    { key: 'seer', label: 'Include the Seer', type: 'boolean', default: true },
    {
      key: 'timer',
      label: 'Timer (minutes)',
      type: 'number',
      default: 4,
      min: 1,
      max: 15,
      help: 'For your reference at the table — the app doesn’t run the clock.',
    },
  ],

  createRoundInput: (): WerewordsInput => ({
    word: '',
    mayor: null,
    seer: null,
    werewolves: [],
    guessed: true,
    werewolfFoundSeer: false,
    mayorFoundWerewolf: false,
  }),

  validateRound: (input: WerewordsInput, ctx: RoundContext): string | null =>
    validateWerewords(input, ids(ctx)),

  scoreRound: (input: WerewordsInput, ctx: RoundContext): Record<ID, number> =>
    scoreWerewords(input, ids(ctx)),

  describeRound: (round: Round): string => describeWerewords(round.input as WerewordsInput),

  help: [
    'One secret word per round. The Mayor knows it and answers only “yes”, “no”, or',
    '“maybe” as the table asks questions. Race the timer to guess the word.',
    '',
    'Village team: the Mayor, the Seer, and the Villagers.',
    'Werewolf team: the werewolves — they know the word and want it to stay hidden.',
    '',
    'How a round lands:',
    '• Guessed in time → Villagers win… unless a werewolf then names the Seer → Werewolves win.',
    '• Never guessed → Werewolves win… unless the Mayor then names a werewolf → Villagers win.',
    '',
    'Each round, tap the werewolf/wolves (and optionally the Mayor and Seer), enter the word,',
    'mark whether it was guessed, then flip the twist if it happened. Everyone on the winning',
    'side banks a point — so the leaderboard is simply who has won the most rounds.',
  ].join('\n'),

  stats: werewordsStats,

  RoundEditor: Editor,
};
