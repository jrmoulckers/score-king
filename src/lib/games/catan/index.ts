import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { catanStats } from './stats';
import {
  carryForward,
  describeRound as describeCatanRound,
  isFinished as catanFinished,
  scoreRound as scoreCatan,
  validateRound as validateCatan,
  type CatanInput,
} from './logic';

export type { CatanInput, CatanConfig } from './logic';

export const catan: GameModule = {
  id: 'catan',
  name: 'Catan',
  tagline: 'Settle, build, and race to the target — first to the crown wins 🏝️',
  emoji: '🏝️',
  keywords: [
    'settlers of catan',
    'settlements',
    'cities',
    'longest road',
    'largest army',
    'victory points',
    'board game',
  ],
  minPlayers: 3,
  maxPlayers: 6,
  configFields: [
    {
      key: 'targetVP',
      label: 'Victory points to win',
      type: 'number',
      default: 10,
      min: 5,
      max: 20,
      help: '10 is standard for 3–4 players. Playing with the 5–6 Player Expansion? Most groups raise it to 13.',
    },
  ],

  // Catan isn't played in discrete rounds — every saved update is a checkpoint of the current
  // board. Each checkpoint starts from the last one so you're only editing what changed.
  createRoundInput: (ctx: RoundContext): CatanInput =>
    carryForward(
      ctx.players.map((p) => p.id),
      ctx.rounds[ctx.rounds.length - 1]?.input as CatanInput | undefined,
    ),

  validateRound: (input: CatanInput, ctx: RoundContext): string | null =>
    validateCatan(input, ctx.players),

  scoreRound: (input: CatanInput, ctx: RoundContext): Record<ID, number> =>
    scoreCatan(
      input,
      ctx.players.map((p) => p.id),
      ctx.totals,
    ),

  isFinished: (totals, { config }) => catanFinished(totals, config),

  describeRound: (round: Round, players): string =>
    describeCatanRound(round.input as CatanInput | undefined, players),

  help: [
    'Catan is a race to victory points (VP) — first to the target wins immediately, even mid-turn.',
    '',
    'Where VP come from:',
    '🏠 Settlement — 1 VP each (up to 5 on the board)',
    '🏰 City — 2 VP each (up to 4; a city replaces a settlement)',
    '🛣️ Longest Road — 2 VP to whoever holds the longest continuous road (5+ segments).',
    '   Can change hands if someone builds a longer one.',
    '⚔️ Largest Army — 2 VP to whoever has played the most Knight cards (3+ minimum).',
    '   Can also change hands.',
    '🃏 Victory Point cards — 1 VP each, from the development deck (5 exist in the base game).',
    '   These are usually kept secret until revealing one wins the game.',
    '',
    'This tracker works as a live checkpoint: update everyone\'s current settlements, cities,',
    'and revealed VP cards, and toggle who holds each award. Score King works out each',
    'player\'s point change since the last update automatically.',
    '',
    'Standard target is 10 VP. Playing 5–6 players with the expansion? Raise the target to 13.',
  ].join('\n'),

  stats: catanStats,

  RoundEditor,
  editorLoader: () => import('./CatanEditor.svelte'),
};
