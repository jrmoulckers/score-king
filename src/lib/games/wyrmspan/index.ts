import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { wyrmspanStats } from './stats';
import {
  activeCategories,
  emptyRow,
  scoreWyrmspan,
  validateRow,
  type WyrmspanConfig,
  type WyrmspanInput,
} from './logic';

export type { WyrmspanConfig, WyrmspanInput, WyrmspanRow } from './logic';

function cfg(config: Record<string, unknown>): Partial<WyrmspanConfig> {
  return {
    scoreLeftover: config.scoreLeftover !== false,
    trackDragons: config.trackDragons !== false,
  };
}

export const wyrmspan: GameModule = {
  id: 'wyrmspan',
  name: 'Wyrmspan',
  tagline: 'Hoard the most VP across your caves 🐉',
  emoji: '🐉',
  keywords: ['wingspan', 'dragon', 'engine builder', 'stonemaier', 'end game', 'categories', 'eggs'],
  minPlayers: 1,
  maxPlayers: 5,

  // One game = one final scoresheet: tally every category once, then it's done.
  maxRounds: () => 1,

  configFields: [
    {
      key: 'scoreLeftover',
      label: 'Score leftover items (+1 VP per 4 spare resources/cards)',
      type: 'boolean',
      default: true,
      help: 'The final "excess items" step. Coins always score 1 VP each; turn this off to skip counting the odds and ends.',
    },
    {
      key: 'trackDragons',
      label: 'Track visible dragons (tiebreaker)',
      type: 'boolean',
      default: true,
      help: 'Wyrmspan breaks ties by the most visible dragons on your mat. Capture each player’s dragon count — it settles ties but never adds to the score.',
    },
  ],

  createRoundInput: (ctx: RoundContext): WyrmspanInput => ({
    rows: Object.fromEntries(ctx.players.map((p) => [p.id, emptyRow()])),
  }),

  validateRound: (input: WyrmspanInput, ctx: RoundContext): string | null => {
    for (const p of ctx.players) {
      const err = validateRow(input.rows[p.id], p.name);
      if (err) return err;
    }
    return null;
  },

  scoreRound: (input: WyrmspanInput, ctx: RoundContext): Record<ID, number> =>
    scoreWyrmspan(
      input,
      ctx.players.map((p) => p.id),
      cfg(ctx.config),
    ),

  describeRound: (round: Round, players): string => {
    // The recorded deltas already hold each player's config-correct final total.
    const deltas = round.deltas ?? {};
    return players
      .map((p) => (p.id in deltas ? `${p.name} ${deltas[p.id]}` : ''))
      .filter(Boolean)
      .join(' · ');
  },

  help: [
    'Wyrmspan — the dragon-hoard cousin of Wingspan. One final scoresheet: add up every',
    'category, and the biggest hoard reigns. 🐉',
    '',
    'Tally each player’s end-game hoard:',
    ...activeCategories({ scoreLeftover: true }).map((c) => `${c.emoji} ${c.label} — ${c.help}`),
    '',
    'Tiebreaker: most visible dragons on your mat (not tucked). Tied totals show as co-leaders,',
    'so settle a dead heat at the table with the dragon count. Still tied? Share the crown. 👑',
  ].join('\n'),

  stats: wyrmspanStats,

  RoundEditor,
  editorLoader: () => import('./WyrmspanEditor.svelte'),
};
