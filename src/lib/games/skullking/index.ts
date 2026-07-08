import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './SkullKingEditor.svelte';
import { skullkingStats } from './stats';

export interface SKRow {
  bid: number;
  actual: number;
  bonus: number;
}
export interface SKInput {
  rows: Record<ID, SKRow>;
}

/** Score a single player's row. Round n has n tricks. */
export function scoreRow(row: SKRow, n: number, bonusesRequireBid: boolean): number {
  const bid = Number(row.bid) || 0;
  const actual = Number(row.actual) || 0;
  const made = actual === bid;
  let pts: number;
  if (bid === 0) {
    pts = made ? 10 * n : -10 * n;
  } else {
    pts = made ? 20 * bid : -10 * Math.abs(actual - bid);
  }
  const bonus = Number(row.bonus) || 0;
  if (bonus && (!bonusesRequireBid || made)) pts += bonus;
  return pts;
}

export const skullking: GameModule = {
  id: 'skullking',
  name: 'Skull King',
  tagline: 'Bid your tricks. Hunt the bonuses.',
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

  maxRounds: (config) => Number(config.rounds) || 10,

  createRoundInput: (ctx: RoundContext): SKInput => ({
    rows: Object.fromEntries(ctx.players.map((p) => [p.id, { bid: 0, actual: 0, bonus: 0 }])),
  }),

  validateRound: (input: SKInput, ctx: RoundContext): string | null => {
    const n = ctx.roundIndex + 1;
    let won = 0;
    for (const p of ctx.players) {
      const row = input.rows[p.id];
      if (row.bid < 0 || row.bid > n) return `${p.name}: bid must be between 0 and ${n}.`;
      if (row.actual < 0 || row.actual > n) return `${p.name}: tricks won must be between 0 and ${n}.`;
      won += Number(row.actual) || 0;
    }
    if (won > n) return `Total tricks won (${won}) can't exceed the ${n} available this round.`;
    return null;
  },

  scoreRound: (input: SKInput, ctx: RoundContext): Record<ID, number> => {
    const n = ctx.roundIndex + 1;
    const requireBid = ctx.config.bonusesRequireBid !== false;
    const out: Record<ID, number> = {};
    for (const p of ctx.players) out[p.id] = scoreRow(input.rows[p.id], n, requireBid);
    return out;
  },

  describeRound: (round: Round, players): string => {
    const input = round.input as SKInput;
    return players
      .map((p) => {
        const r = input.rows[p.id];
        return r ? `${p.name} ${r.bid}/${r.actual}` : '';
      })
      .filter(Boolean)
      .join(' · ');
  },

  help: [
    'Bid how many tricks you will win each round.',
    'Hit your bid: 20 × bid. Bid 0 and succeed: 10 × round number.',
    'Miss a bid of 1+: −10 per trick over/under. Miss a 0 bid: −10 × round number.',
    '',
    'Typical bonuses (enter in the Bonus field):',
    '• +10 for each 14 you capture (yellow/purple/green/black)',
    '• +20 for capturing the black 14 (Jolly Roger)',
    '• +30 Skull King captures each Pirate',
    '• +40 each Mermaid captures the Skull King',
    '• +50 Skull King over Mermaid',
    'Bonuses vary by edition — confirm your set.',
  ].join('\n'),

  stats: skullkingStats,

  RoundEditor: Editor,
};
