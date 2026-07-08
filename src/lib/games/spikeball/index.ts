import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './SpikeballEditor.svelte';
import { spikeballStats } from './stats';
import {
  readConfig,
  splitTeams,
  gamesToWin,
  scoreDeltas,
  summarize,
  validate,
  type SpikeballInput,
} from './logic';

export type { SpikeballInput } from './logic';

const playerIds = (ctx: RoundContext): ID[] => ctx.players.map((p) => p.id);

/**
 * Spikeball / Roundnet — a live rally scorer. Each Score King "round" is one *game*
 * (rally scoring to a target, win by two); the module tallies games won, and a
 * best-of-N match finishes when a team wins the majority. Teams are the first half vs.
 * the second half of the selected roster, so 2 players play 1v1 and 4 players play 2v2.
 */
export const spikeball: GameModule = {
  id: 'spikeball',
  name: 'Spikeball',
  tagline: 'Rally scoring for Roundnet — first to 21, win by 2',
  emoji: '🔵',
  keywords: ['roundnet', 'spikeball', 'rally', 'net', 'doubles', '2v2', 'outdoor', 'beach'],
  minPlayers: 2,
  maxPlayers: 4,
  teams: true,
  configFields: [
    {
      key: 'format',
      label: 'Format',
      type: 'select',
      default: '2v2',
      options: [
        { value: '2v2', label: '2v2 (doubles)' },
        { value: '1v1', label: '1v1 (singles)' },
      ],
      help: '2v2 needs 4 players, 1v1 needs 2. Teams are the first half vs. the second half of your player list.',
    },
    {
      key: 'target',
      label: 'Game to',
      type: 'select',
      default: '21',
      options: [
        { value: '21', label: '21 points' },
        { value: '15', label: '15 points' },
        { value: '11', label: '11 points' },
      ],
      help: 'First team to reach this score takes the game.',
    },
    {
      key: 'winByTwo',
      label: 'Win by 2',
      type: 'boolean',
      default: true,
      help: 'Play on past the target until a team leads by two.',
    },
    {
      key: 'bestOf',
      label: 'Match length',
      type: 'select',
      default: '3',
      options: [
        { value: '1', label: 'Single game' },
        { value: '3', label: 'Best of 3' },
        { value: '5', label: 'Best of 5' },
      ],
      help: 'How many games decide the match.',
    },
  ],

  createRoundInput: (ctx: RoundContext): SpikeballInput => {
    const cfg = readConfig(ctx.config);
    return { teams: splitTeams(playerIds(ctx), cfg.format), a: 0, b: 0 };
  },

  validateRound: (input: SpikeballInput, ctx: RoundContext): string | null =>
    validate(input, playerIds(ctx), readConfig(ctx.config)),

  scoreRound: (input: SpikeballInput, ctx: RoundContext): Record<ID, number> =>
    scoreDeltas(input, playerIds(ctx), readConfig(ctx.config)),

  // Open-ended: a match is 2 or 3 games (best of 3), so end on games won, not a round cap.
  isFinished: (totals, { config }) => {
    const need = gamesToWin(readConfig(config).bestOf);
    return Object.values(totals).some((t) => t >= need);
  },

  describeRound: (round: Round, players): string => {
    const input = round.input as SpikeballInput;
    const nameOf = (id: ID) => players.find((p) => p.id === id)?.name ?? '?';
    return summarize(input, nameOf);
  },

  help:
    'Spikeball (Roundnet) is rally scoring: every rally is a point, whoever wins it. ' +
    'Games go to the target (21/15/11); with win-by-2 you play on until a team leads by two. ' +
    'Tap ＋1 for the team that won each rally. When a game ends, Save round to bank it — ' +
    'the first team to win the majority of a best-of-3 (or 5) takes the match.',

  stats: spikeballStats,

  RoundEditor: Editor,
};
