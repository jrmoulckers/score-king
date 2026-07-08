import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './CodenamesEditor.svelte';
import { codenamesStats } from './stats';
import {
  createInput,
  describe,
  matchOver,
  pickWinners,
  score,
  validate,
  type CodenamesInput,
} from './logic';

export type { CodenamesInput, Team, Ending } from './logic';

const playerIdsOf = (ctx: RoundContext): ID[] => ctx.players.map((p) => p.id);

/**
 * Codenames — a Red vs Blue **tracker** rather than a point counter. Each round
 * is one game: tap the winning team (and, optionally, whether the losers hit the
 * assassin). The winning team's players each bank +1, so standings read as
 * "games won", the crown sits with the leading team, and `pickWinners` resolves
 * the match to that team. See `logic.ts` for the full modelling note.
 */
export const codenames: GameModule = {
  id: 'codenames',
  name: 'Codenames',
  tagline: 'Red vs Blue — track who cracks the grid',
  emoji: '🕵️',
  keywords: [
    'party',
    'word game',
    'spymaster',
    'agents',
    'assassin',
    'team',
    'red vs blue',
    'head to head',
  ],
  minPlayers: 2,
  maxPlayers: 12,
  teams: true,
  configFields: [
    {
      key: 'trackAssassin',
      label: 'Track assassin losses',
      type: 'boolean',
      default: true,
      help: 'Record when a game ends by the losing team revealing the assassin.',
    },
    {
      key: 'winTarget',
      label: 'Games to win the match (0 = open-ended)',
      type: 'number',
      default: 0,
      min: 0,
      help: 'Play a best-of series: the match ends when a team reaches this many wins.',
    },
  ],

  createRoundInput: (ctx: RoundContext): CodenamesInput => createInput(ctx),

  validateRound: (input: CodenamesInput, ctx: RoundContext): string | null =>
    validate(input, playerIdsOf(ctx)),

  scoreRound: (input: CodenamesInput, ctx: RoundContext): Record<ID, number> =>
    score(input, playerIdsOf(ctx)),

  isFinished: (totals, { config }) => matchOver(totals, Number(config.winTarget) || 0),

  pickWinners: (totals): ID[] => pickWinners(totals),

  describeRound: (round: Round): string => describe(round.input as CodenamesInput),

  help: [
    'A tracker for the team word game — record who won each game, not points.',
    '',
    'Two teams, 🔴 Red and 🔵 Blue, each with a spymaster giving one-word clues so',
    'their operatives find their agents on the grid — while dodging the 💀 assassin.',
    '',
    'Each round is one game:',
    '• Assign every player to a team (set once — it carries to the next game).',
    '• Tap the team that won.',
    '• Optionally mark whether the losers tripped the assassin (an instant loss).',
    '',
    'The winning team banks a game; the team ahead wears the crown. Finish the match',
    'to record the leading team — or set a “games to win” target for a best-of series.',
  ].join('\n'),

  stats: codenamesStats,

  RoundEditor: Editor,
};
