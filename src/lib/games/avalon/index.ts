import type { GameModule, RoundContext } from '../../types';
import Editor from './AvalonEditor.svelte';
import { avalonStats } from './stats';
import {
  MAX_PLAYERS,
  MAX_QUESTS,
  MIN_PLAYERS,
  describeAvalon,
  isResolved,
  pickAvalonWinners,
  roleSetup,
  scoreAvalon,
  validateAvalon,
  type AvalonInput,
} from './logic';

export type { AvalonInput } from './logic';

const seatIds = (ctx: RoundContext) => ctx.players.map((p) => p.id);

export const avalon: GameModule = {
  id: 'avalon',
  name: 'Avalon',
  tagline: 'Loyal servants vs. minions of Mordred',
  emoji: '⚔️',
  keywords: [
    'the resistance',
    'social deduction',
    'hidden roles',
    'merlin',
    'assassin',
    'teams',
    'party',
  ],
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  teams: true,
  configFields: [
    {
      key: 'percival',
      label: 'Percival (Good)',
      type: 'boolean',
      default: false,
      help: 'Sees Merlin & Morgana — but can’t tell them apart.',
    },
    {
      key: 'morgana',
      label: 'Morgana (Evil)',
      type: 'boolean',
      default: false,
      help: 'Appears as Merlin to Percival.',
    },
    {
      key: 'mordred',
      label: 'Mordred (Evil)',
      type: 'boolean',
      default: false,
      help: 'Hidden from Merlin — Good flies blind on one minion.',
    },
    {
      key: 'oberon',
      label: 'Oberon (Evil)',
      type: 'boolean',
      default: false,
      help: 'Unknown even to his fellow minions.',
    },
  ],

  maxRounds: () => MAX_QUESTS,

  createRoundInput: (ctx: RoundContext): AvalonInput => {
    const setup = roleSetup(ctx.players.length);
    const teamSize = setup.questTeams[ctx.roundIndex] ?? setup.questTeams[MAX_QUESTS - 1] ?? 3;
    return { fails: 0, teamSize, assassinFoundMerlin: null, winners: [] };
  },

  validateRound: (input: AvalonInput, ctx: RoundContext) =>
    validateAvalon(input, ctx.rounds, ctx.roundIndex, seatIds(ctx)),

  scoreRound: (input: AvalonInput, ctx: RoundContext) =>
    scoreAvalon(input, ctx.rounds, ctx.roundIndex, seatIds(ctx)),

  isFinished: (totals) => isResolved(totals),

  pickWinners: (totals) => pickAvalonWinners(totals),

  describeRound: (round, players) => describeAvalon(round, players.length),

  help: [
    'A hidden-role duel: 🛡️ Good (Loyal Servants of Arthur, incl. Merlin & Percival) vs.',
    '🗡️ Evil (Minions of Mordred, incl. Morgana, Mordred, Oberon & the Assassin).',
    '',
    'Each round a leader sends a team on a QUEST. On its mission the team plays secret',
    'Success/Fail cards — any single Fail sinks the quest (Quest 4 needs TWO Fails at 7+ players).',
    'Record how many Fails were revealed; the tracker marks the quest ✓ or ✗.',
    '',
    '🛡️ Good wins by succeeding 3 quests — then the Assassin may name Merlin: if correct,',
    '🗡️ Evil steals the win. Evil wins outright by failing 3 quests.',
    '',
    'At the clinch, tap everyone on the winning side to record the result.',
  ].join('\n'),

  stats: avalonStats,

  RoundEditor: Editor,
};
