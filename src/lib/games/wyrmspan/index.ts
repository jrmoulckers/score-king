import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './WyrmspanEditor.svelte';
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
  return { scoreLeftover: config.scoreLeftover !== false };
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
    'category, and the highest total reigns. 🐉',
    '',
    'Enter each player’s end-game totals:',
    ...activeCategories({ scoreLeftover: true }).map((c) => `${c.emoji} ${c.label} — ${c.help}`),
    '',
    'Tiebreaker: most visible dragons on your mat (not tucked). Still tied? Share the crown.',
  ].join('\n'),

  stats: wyrmspanStats,

  RoundEditor: Editor,
};
