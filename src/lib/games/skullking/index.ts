import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { skullkingStats } from './stats';
import {
  effectiveBonus,
  emptyBounty,
  readConfig,
  scoreRow,
  validateSkullKing,
  type SKInput,
  type SKRow,
} from './logic';

// Re-exported so existing importers (the editor, stats) keep a single entry point
// even though the pure model now lives in ./logic.
export { scoreRow, type SKInput, type SKRow };

export const skullking: GameModule = {
  id: 'skullking',
  name: 'Skull King',
  tagline: 'Bid your tricks. Hunt the bounty.',
  emoji: '🏴‍☠️',
  keywords: ['trick taking', 'pirate', 'bidding', 'cards'],
  minPlayers: 2,
  maxPlayers: 8,
  configFields: [
    { key: 'rounds', label: 'Number of rounds', type: 'number', default: 10, min: 1, max: 10 },
    {
      key: 'bonusesRequireBid',
      label: 'Bonus points only count if the bid is met',
      type: 'boolean',
      default: true,
    },
  ],

  maxRounds: (config) => readConfig(config).rounds,

  createRoundInput: (ctx: RoundContext): SKInput => ({
    rows: Object.fromEntries(
      ctx.players.map((p) => [p.id, { bid: 0, actual: 0, bonus: 0, bounty: emptyBounty() }]),
    ),
  }),

  validateRound: (input: SKInput, ctx: RoundContext): string | null =>
    validateSkullKing(input, ctx),

  scoreRound: (input: SKInput, ctx: RoundContext): Record<ID, number> => {
    const n = ctx.roundIndex + 1;
    const requireBid = readConfig(ctx.config).bonusesRequireBid;
    const out: Record<ID, number> = {};
    for (const p of ctx.players) out[p.id] = scoreRow(input.rows[p.id], n, requireBid);
    return out;
  },

  describeRound: (round: Round, players): string => {
    const input = round.input as SKInput;
    return players
      .map((p) => {
        const r = input.rows[p.id];
        if (!r) return '';
        const treasure = effectiveBonus(r) > 0 ? ' 🪙' : '';
        return `${p.name} ${r.bid}/${r.actual}${treasure}`;
      })
      .filter(Boolean)
      .join(' · ');
  },

  help: [
    'Bid how many tricks you will win each round.',
    'Hit your bid: 20 × bid. Bid 0 and succeed: 10 × round number.',
    'Miss a bid of 1+: −10 per trick over/under. Miss a 0 bid: −10 × round number.',
    '',
    'Bounty (tap the 🪙 builder — it does the math for you):',
    '• +10 for each 14 you capture (yellow/green/purple)',
    '• +20 for capturing the black 14 (Jolly Roger)',
    '• +30 Skull King captures each Pirate',
    '• +40 each Mermaid captures the Skull King',
    '• +50 Skull King over Mermaid',
    'Bounties vary by edition — the Other field covers house rules.',
  ].join('\n'),

  stats: skullkingStats,

  RoundEditor,
  editorLoader: () => import('./SkullKingEditor.svelte'),
};
