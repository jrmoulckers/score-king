import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { presidentsStats } from './stats';
import {
  describeRound as describePresidentsRound,
  freshPositions,
  isFinished as presidentsFinished,
  maxRounds as presidentsMaxRounds,
  scoreRound as scorePresidents,
  validateRound as validatePresidents,
  type PresidentsInput,
} from './logic';

export type { PresidentsInput, PresidentsConfig, SchemeId, TitleInfo, TitleTier } from './logic';
export { pointsForPosition, titleFor, SCHEME_META } from './logic';

export const presidents: GameModule = {
  id: 'presidents',
  name: 'Presidents',
  tagline: 'Climb the ranks — crown a President, crown a Scum 👑',
  emoji: '👑',
  keywords: ['president', 'scum', 'asshole', 'landlord', 'cards', 'climbing', 'party'],
  minPlayers: 3,
  maxPlayers: 8,
  configFields: [
    {
      key: 'scheme',
      label: 'Scoring scheme',
      type: 'select',
      default: 'rankPoints',
      options: [
        { value: 'rankPoints', label: 'Rank points (default)' },
        { value: 'tieredTitles', label: 'Tiered titles (+3 / +1 / 0 / −1 / −3)' },
        { value: 'winsOnly', label: 'Presidencies only (+1 for President)' },
      ],
      help: 'How a finishing spot converts to points. Rank points scale with the table; tiered titles are fixed regardless of table size; presidencies-only just counts wins.',
    },
    {
      key: 'targetScore',
      label: 'End the game when a player reaches',
      type: 'number',
      default: 15,
      min: 0,
      help: 'First to this total wins outright. Set to 0 to disable and rely on a fixed round count instead.',
    },
    {
      key: 'roundCount',
      label: 'Play a fixed number of rounds',
      type: 'number',
      default: 0,
      min: 0,
      max: 500,
      help: '0 = keep dealing until someone reaches the target score above. Set both for whichever comes first.',
    },
  ],

  maxRounds: (config) => presidentsMaxRounds(config),

  createRoundInput: (ctx: RoundContext): PresidentsInput => freshPositions(ctx.players),

  validateRound: (input: PresidentsInput, ctx: RoundContext): string | null =>
    validatePresidents(input, ctx.players, ctx.config),

  scoreRound: (input: PresidentsInput, ctx: RoundContext): Record<ID, number> =>
    scorePresidents(input, ctx.config),

  isFinished: (totals, { config }) => presidentsFinished(totals, config),

  describeRound: (round: Round, players): string =>
    describePresidentsRound(round.input as PresidentsInput, players),

  help: [
    '👑 Presidents (a.k.a. President, Scum, Asshole, Landlord) — climb the ranks!',
    '',
    'Deal out the whole deck. Players take turns playing a single card or a set of',
    'equal-rank cards that beats the last play (higher rank, same count), or pass.',
    'When everyone passes, the pile clears and whoever played last leads again.',
    '',
    'The moment you play your last card, you\'re OUT for the round and lock in your',
    'finishing spot: first out is President, last one holding cards is Scum.',
    'Everyone else lands somewhere in between (Vice President / Citizen / Vice Scum',
    'once the table is big enough to tell them apart).',
    '',
    'Enter each player\'s finishing spot below — the module maps it to points using',
    'whichever scoring scheme you picked in setup. Highest total wins the game.',
    '',
    '🃏 Card passing (physical rule, not scored here): before the next deal, Scum',
    'hands their best 1–2 cards to the President, who hands back any 1–2 cards in',
    'return. Vice Scum/Vice President swap one card the same way at bigger tables.',
    'Play this at the table — this app only tracks the score.',
  ].join('\n'),

  stats: presidentsStats,

  RoundEditor,
  editorLoader: () => import('./PresidentsEditor.svelte'),
};
