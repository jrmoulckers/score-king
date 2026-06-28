import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './TallyEditor.svelte';

export interface TallyInput {
  deltas: Record<ID, number>;
}

export const tally: GameModule = {
  id: 'tally',
  name: 'Tally',
  tagline: 'Universal point counter for any game',
  emoji: '🎯',
  minPlayers: 1,
  maxPlayers: 12,
  configFields: [
    {
      key: 'direction',
      label: 'Who wins',
      type: 'select',
      default: 'high',
      options: [
        { value: 'high', label: 'Highest score' },
        { value: 'low', label: 'Lowest score' },
      ],
    },
    { key: 'target', label: 'Target score to win (0 = no limit)', type: 'number', default: 0, min: 0 },
  ],
  resolveLowerIsBetter: (c) => c.direction === 'low',

  createRoundInput: (ctx: RoundContext): TallyInput => ({
    deltas: Object.fromEntries(ctx.players.map((p) => [p.id, 0])),
  }),

  validateRound: () => null,

  scoreRound: (input: TallyInput): Record<ID, number> => {
    const out: Record<ID, number> = {};
    for (const [id, v] of Object.entries(input.deltas)) out[id] = Number(v) || 0;
    return out;
  },

  isFinished: (totals, { config }) => {
    const target = Number(config.target) || 0;
    if (target <= 0 || config.direction === 'low') return false;
    return Object.values(totals).some((t) => t >= target);
  },

  describeRound: (round: Round) => {
    const input = round.input as TallyInput;
    const parts = Object.entries(input.deltas)
      .filter(([, v]) => v)
      .map(([, v]) => (v > 0 ? `+${v}` : `${v}`));
    return parts.length ? parts.join(' / ') : 'no change';
  },

  RoundEditor: Editor,
};
