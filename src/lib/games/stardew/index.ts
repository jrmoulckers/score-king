import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { stardewStats } from './stats';
import {
  MAX_CANDLES,
  MAX_YEARS,
  STARDEW_HELP,
  describeSeason,
  emptySeason,
  evaluationScore,
  groupWon,
  maxSeasons,
  priorCategoryTotals,
  seasonPoints,
  validateSeason,
  type StardewSeasonInput,
} from './logic';

export type { StardewSeasonInput } from './logic';

/**
 * Stardew Valley: The Board Game — the app's first fully *cooperative* tracker.
 *
 * The table plays as one farm against the game: every season you log the
 * evaluation points the group earned together (bundles restored, Grandpa's
 * Goals, Legendary Fish, gold prosperity). `scoreRound` hands that season's
 * points to *every* seat, so all totals move as one shared evaluation score —
 * the scoreboard reads the same by everyone's name because you're all in it
 * together. At the end, Grandpa lights candles for the final score; the group
 * wins by reaching its target candle tier, and `pickWinners` crowns everyone
 * (or no one) accordingly.
 */
export const stardew: GameModule = {
  id: 'stardew',
  name: 'Stardew Valley',
  tagline: 'Restore the farm together. Make Grandpa proud.',
  emoji: '🌾',
  keywords: [
    'stardew',
    'cooperative',
    'co-op',
    'coop',
    'farming',
    'grandpa',
    'community center',
    'candles',
    'board game',
  ],
  // Cooperative 1–4 player game — the whole table shares one farm.
  minPlayers: 1,
  maxPlayers: 4,
  // Every seat carries the identical total by design, so the shell must not read
  // that permanent all-tie as "nobody has pulled ahead yet" drama, nor narrate a
  // shared victory as a tie. See GameModule.coop.
  coop: true,
  configFields: [
    {
      key: 'years',
      label: 'Years to farm',
      type: 'number',
      default: 1,
      min: 1,
      max: MAX_YEARS,
      help: 'Base game is one year (4 seasons). Add years for a longer harvest.',
    },
    {
      key: 'targetCandles',
      label: 'Candles to make Grandpa proud',
      type: 'number',
      default: MAX_CANDLES,
      min: 1,
      max: MAX_CANDLES,
      help: 'The group wins by lighting at least this many candles (4 is the top result).',
    },
  ],

  // Seasons are the rounds: 4 per year.
  maxRounds: (config) => maxSeasons(config),

  createRoundInput: (): StardewSeasonInput => emptySeason(),

  validateRound: (input: StardewSeasonInput, ctx: RoundContext): string | null =>
    validateSeason(input, priorCategoryTotals(ctx.rounds, ctx.roundIndex)),

  // Co-op: the season's evaluation points are shared — every seat gets the same
  // delta, so all totals stay equal and read as the farm's collective score.
  scoreRound: (input: StardewSeasonInput, ctx: RoundContext): Record<ID, number> => {
    const pts = seasonPoints(input);
    const out: Record<ID, number> = {};
    for (const p of ctx.players) out[p.id] = pts;
    return out;
  },

  // Nudge "looks complete" the moment the group secures its target tier — a soft
  // offer, never a forced finish, so a table can keep farming the calendar out.
  isFinished: (totals, { config }) => groupWon(evaluationScore(totals), config),

  // Everyone shares the win, or no one does.
  pickWinners: (totals, config): ID[] => {
    const ids = Object.keys(totals);
    return groupWon(evaluationScore(totals), config) ? ids : [];
  },

  describeRound: (round: Round): string => describeSeason(round),

  help: STARDEW_HELP,

  stats: stardewStats,

  RoundEditor,
  editorLoader: () => import('./StardewEditor.svelte'),
};
