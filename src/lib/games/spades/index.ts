import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { spadesStats } from './stats';
import {
  emptyRow,
  readConfig,
  scoreLatest,
  validateHand,
  type SpadesInput,
} from './logic';

export type { SpadesInput, SpadesRow, NilKind } from './logic';

/** Prior hands, oldest first — everything strictly before the hand being scored. */
function priorInputs(ctx: RoundContext): SpadesInput[] {
  return ctx.rounds
    .filter((r) => r.index < ctx.roundIndex)
    .sort((a, b) => a.index - b.index)
    .map((r) => r.input as SpadesInput);
}

export const spades: GameModule = {
  id: 'spades',
  name: 'Spades',
  tagline: 'Bid your tricks. Mind the bags.',
  emoji: '♠️',
  keywords: ['trick taking', 'partnership', 'bidding', 'nil', 'bags', 'cards'],
  minPlayers: 3,
  maxPlayers: 4,
  teams: true,

  configFields: [
    {
      key: 'mode',
      label: 'Play style',
      type: 'select',
      default: 'partners',
      options: [
        { value: 'partners', label: 'Partnerships · 2 teams of 2' },
        { value: 'solo', label: 'Cutthroat · every player solo' },
      ],
      help: 'Partnerships need exactly 4 players — otherwise everyone scores solo.',
    },
    {
      key: 'target',
      label: 'Winning score',
      type: 'number',
      default: 500,
      min: 100,
      step: 50,
      help: 'First to reach this wins; the highest total breaks a tie.',
    },
    { key: 'nil', label: 'Allow Nil bids (±100)', type: 'boolean', default: true },
    { key: 'blindNil', label: 'Allow Blind Nil (±200)', type: 'boolean', default: true },
    {
      key: 'sandbagging',
      label: 'Bag penalty',
      type: 'boolean',
      default: true,
      help: 'Overtricks are “bags”. Collect a threshold of them and they cost 100 points.',
    },
    { key: 'bagThreshold', label: 'Bags before the −100 hit', type: 'number', default: 10, min: 2, max: 20 },
  ],

  createRoundInput: (ctx: RoundContext): SpadesInput => ({
    rows: Object.fromEntries(ctx.players.map((p) => [p.id, emptyRow()])),
  }),

  validateRound: (input: SpadesInput, ctx: RoundContext): string | null =>
    validateHand(input, ctx.players, ctx.config),

  scoreRound: (input: SpadesInput, ctx: RoundContext): Record<ID, number> =>
    scoreLatest(priorInputs(ctx), input, ctx.players, ctx.config),

  isFinished: (totals, { config }) => {
    const target = readConfig(config).target;
    if (target <= 0) return false;
    return Object.values(totals).some((t) => t >= target);
  },

  describeRound: (round: Round, players): string => {
    const input = round.input as SpadesInput;
    return players
      .map((p) => {
        const r = input?.rows?.[p.id];
        if (!r) return '';
        const hit = (Number(r.tricks) || 0) === 0;
        if (r.nil === 'blind') return `${p.name} 🙈${hit ? '✓' : '✗'}`;
        if (r.nil === 'nil') return `${p.name} 🚫${hit ? '✓' : '✗'}`;
        return `${p.name} ${r.bid}/${r.tricks}`;
      })
      .filter(Boolean)
      .join(' · ');
  },

  help: [
    'Everyone bids the tricks they’ll take; partners’ bids add up to one team contract.',
    '',
    'Make the contract: +10 per bid, +1 for each extra trick (a “bag”).',
    'Miss it (get “set”): −10 per bid, and no bags that hand.',
    '',
    'Bags are sticky. Each 10 your team piles up costs a flat −100 (sandbagging),',
    'so overtricks you didn’t need come back to bite. Turn it off in setup for a looser game.',
    '',
    'Nil: bid zero tricks. Take none → +100; take any → −100.',
    'Blind Nil: call it before you look → ±200.',
    '',
    'Partnerships: the 1st + 2nd players you picked are Team 1, the 3rd + 4th are Team 2;',
    'both partners share the team’s total. First to the target (500 by default) wins.',
  ].join('\n'),

  stats: spadesStats,

  RoundEditor,
  editorLoader: () => import('./SpadesEditor.svelte'),
};
