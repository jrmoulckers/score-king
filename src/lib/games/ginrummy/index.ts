import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { ginRummyStats } from './stats';
import {
  DEFAULT_CONFIG,
  describeHand,
  emptyInput,
  isFinished as ginFinished,
  scoreRound as scoreGin,
  validateRound as validateGin,
  type GinRummyInput,
} from './logic';

export type { GinRummyConfig, GinRummyInput, HandResult, Outcome } from './logic';
export { DEFAULT_CONFIG, boxCounts, opponentOf, scoreHand } from './logic';

/** This game's rounds already recorded, strictly before the one being scored. */
function priorRounds(ctx: RoundContext): Round[] {
  return ctx.rounds.filter((r) => r.index < ctx.roundIndex).sort((a, b) => a.index - b.index);
}

export const ginRummy: GameModule = {
  id: 'ginrummy',
  name: 'Gin Rummy',
  tagline: 'Knock, go gin, or get undercut — race to 100.',
  emoji: '🍸',
  keywords: ['gin', 'rummy', 'knock', 'deadwood', 'cards', 'two player', 'melds'],
  minPlayers: 2,
  maxPlayers: 2,

  configFields: [
    {
      key: 'target',
      label: 'Points to win',
      type: 'number',
      default: DEFAULT_CONFIG.target,
      min: 25,
      step: 25,
      help: 'First to this many hand-score points ends the game — settlement bonuses land on that hand.',
    },
    {
      key: 'ginBonus',
      label: 'Gin bonus',
      type: 'number',
      default: DEFAULT_CONFIG.ginBonus,
      min: 0,
      step: 5,
      help: 'Extra points for going gin (zero deadwood), on top of the opponent\u2019s deadwood.',
      advanced: true,
    },
    {
      key: 'undercutBonus',
      label: 'Undercut bonus',
      type: 'number',
      default: DEFAULT_CONFIG.undercutBonus,
      min: 0,
      step: 5,
      help: 'Extra points for undercutting a knock (matching or beating the knocker\u2019s deadwood).',
      advanced: true,
    },
    {
      key: 'maxKnockDeadwood',
      label: 'Max deadwood to knock',
      type: 'number',
      default: DEFAULT_CONFIG.maxKnockDeadwood,
      min: 0,
      max: 20,
      help: 'The classic limit is 10 — knock with more than this and it isn\u2019t a legal knock.',
      advanced: true,
    },
    {
      key: 'gameBonus',
      label: 'Game-winner bonus',
      type: 'number',
      default: DEFAULT_CONFIG.gameBonus,
      min: 0,
      step: 25,
      help: 'Settled onto whoever wins the whole game, the hand it\u2019s won.',
      advanced: true,
    },
    {
      key: 'lineBonus',
      label: 'Per-hand "line" bonus',
      type: 'number',
      default: DEFAULT_CONFIG.lineBonus,
      min: 0,
      step: 5,
      help: 'Added for every hand a player has won across the game, settled at the finish.',
      advanced: true,
    },
    {
      key: 'shutoutDoubling',
      label: 'Double the game bonus on a shutout',
      type: 'boolean',
      default: DEFAULT_CONFIG.shutoutDoubling,
      help: 'If the loser never scored a single hand-point all game, the game bonus doubles.',
      advanced: true,
    },
  ],

  createRoundInput: (ctx: RoundContext): GinRummyInput => emptyInput(ctx.players),

  validateRound: (input: GinRummyInput, ctx: RoundContext): string | null =>
    validateGin(input, ctx.players, ctx.config),

  scoreRound: (input: GinRummyInput, ctx: RoundContext): Record<ID, number> =>
    scoreGin(input, ctx.players, ctx.config, ctx.totals, priorRounds(ctx)),

  isFinished: (totals, { config }) => ginFinished(totals, config),

  describeRound: (round: Round, players): string =>
    describeHand(round.input as GinRummyInput | undefined, players, round.deltas ?? {}),

  roundCellTone: (round: Round, playerId: ID) => {
    const input = round.input as GinRummyInput | undefined;
    const delta = round.deltas?.[playerId];
    if (!input?.knockerId || delta == null || delta <= 0) return null;
    if (input.gin && input.knockerId === playerId) return { tone: 'good', label: 'Gin!' };
    if (input.knockerId !== playerId) return { tone: 'warn', label: 'Undercut!' };
    return null;
  },

  help: [
    'Gin Rummy is a two-handed race to meld all ten cards into sets and runs,',
    'leaving as little "deadwood" (unmelded points) as possible.',
    '',
    'Card values: face cards are 10, the ace is 1, everything else is its pip value.',
    '',
    '\u{1F6AA} KNOCK: with 10 or fewer deadwood points, end the hand. You score the',
    '   difference between your deadwood and your opponent\u2019s.',
    '\u{1F485} GIN: end the hand with zero deadwood. You score your opponent\u2019s full',
    '   deadwood, plus a gin bonus (25 by default).',
    '\u{1F501} UNDERCUT: if your opponent\u2019s deadwood is equal to or less than yours',
    '   after you knock, *they* score the difference plus an undercut bonus (20 by',
    '   default) \u2014 and you get nothing. Ouch.',
    '',
    'First to the target (100 by default) wins the game. At that point, settlement',
    'bonuses land on the last hand: +25 for every hand each side has won (the',
    '"line"), and +100 to the game winner \u2014 doubled if the loser never scored a',
    'single hand-point all game (a shutout).',
  ].join('\n'),

  stats: ginRummyStats,

  RoundEditor,
  editorLoader: () => import('./GinRummyEditor.svelte'),
};
