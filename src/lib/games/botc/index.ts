import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './BotcEditor.svelte';
import * as logic from './logic';
import type { BotcInput } from './logic';
import { botcStats } from './stats';

export type { BotcInput } from './logic';

const ids = (ctx: RoundContext): ID[] => ctx.players.map((p) => p.id);

export const botc: GameModule = {
  id: 'botc',
  name: 'Blood on the Clocktower',
  tagline: 'Storyteller tracker for the town’s day & night',
  emoji: '🕒',
  keywords: ['social deduction', 'clocktower', 'botc', 'werewolf', 'mafia', 'storyteller', 'town'],
  minPlayers: 5,
  maxPlayers: 20,

  configFields: [
    {
      key: 'script',
      label: 'Script / edition (role reference)',
      type: 'select',
      default: 'tb',
      options: logic.SCRIPTS.map((s) => ({ value: s.value, label: s.label })),
      help: 'Sets the character list used to autocomplete roles — it never limits what you can type.',
    },
  ],

  createRoundInput: (ctx: RoundContext): BotcInput => {
    const prevRound = ctx.rounds[ctx.roundIndex - 1];
    const prev = prevRound ? (prevRound.input as BotcInput).states : undefined;
    const states =
      ctx.roundIndex === 0
        ? logic.initialRoster(ids(ctx))
        : logic.carryRoster(prev, ids(ctx));
    return { states, nominations: [], result: null, note: '' };
  },

  validateRound: (input: BotcInput, ctx: RoundContext): string | null =>
    logic.validate(input, ids(ctx)),

  scoreRound: (input: BotcInput, ctx: RoundContext): Record<ID, number> =>
    logic.scoreRound(input, ids(ctx)),

  isFinished: (totals) => logic.isResolved(totals),

  pickWinners: (totals) => logic.pickWinners(totals),

  describeRound: (round: Round, players): string => {
    const nameOf = (id: ID) => players.find((p) => p.id === id)?.name ?? '?';
    return logic.describe(round.input as BotcInput, round.index, nameOf);
  },

  help: [
    'A Storyteller’s tracker for the town’s day & night ritual — you run the game,',
    'this just keeps the roster, deaths, votes, and the winner glanceable.',
    '',
    'Each round is one phase, alternating 🌙 Night → ☀️ Day:',
    '• Night: the Demon and others act in secret. Mark who died.',
    '• Day: the town talks, nominates, and votes. A nominee with votes ≥ half the',
    '  living can go to the block; the most-voted above that line is executed.',
    '',
    'Death & the ghost vote: a dead player stays in the game and keeps ONE ghost',
    'vote for the rest of it — mark it used once they spend it.',
    '',
    'Winning (character abilities can bend these — your word is final):',
    '• Good wins when the Demon dies.',
    '• Evil wins when only two players are left alive, or Good can no longer win.',
    '',
    'When it’s over, tap Good or Evil to record the winning team, then',
    'Finish & record winner.',
  ].join('\n'),

  stats: botcStats,

  RoundEditor: Editor,
};
