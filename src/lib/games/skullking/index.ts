import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './SkullKingEditor.svelte';
import { skullkingStats } from './stats';
import {
  scoreRound as scoreRoundLogic,
  validateRound as validateRoundLogic,
  type SKInput,
} from './logic';

export { scoreRow, BONUS_STEP, totalBid, totalTricks } from './logic';
export type { SKInput, SKRow } from './logic';

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

  validateRound: (input: SKInput, ctx: RoundContext): string | null =>
    validateRoundLogic(input, ctx.players, ctx.roundIndex + 1),

  scoreRound: (input: SKInput, ctx: RoundContext): Record<ID, number> =>
    scoreRoundLogic(input, ctx.players, ctx.roundIndex + 1, ctx.config.bonusesRequireBid !== false),

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
