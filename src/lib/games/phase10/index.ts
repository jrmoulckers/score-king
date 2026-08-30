import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { phase10Stats } from './stats';
import {
  PHASE10_HELP,
  createPhase10Input,
  isPhase10Finished,
  pickPhase10Winners,
  scorePhase10,
  validatePhase10,
  type Phase10Input,
} from './logic';

export type { Phase10Input, Phase10Hand, PhaseDef } from './logic';
export { PHASES, PHASE_COUNT, CARD_VALUE, phaseLabel, phasesAfter, hasWon } from './logic';

export const phase10: GameModule = {
  id: 'phase10',
  name: 'Phase 10',
  tagline: 'Climb ten phases before anyone else clears the ladder',
  emoji: '🔟',
  keywords: ['phase 10', 'phase ten', 'rummy', 'shedding', 'sets', 'runs', 'cards'],
  minPlayers: 2,
  maxPlayers: 6,
  lowerIsBetter: true,

  createRoundInput: (ctx: RoundContext): Phase10Input =>
    createPhase10Input(ctx.players.map((p) => p.id)),

  validateRound: (input: Phase10Input, ctx: RoundContext): string | null =>
    validatePhase10(input, ctx.players),

  scoreRound: (input: Phase10Input, ctx: RoundContext): Record<ID, number> =>
    scorePhase10(
      input,
      ctx.players.map((p) => p.id),
    ),

  // Phase 10's finish line is "someone cleared Phase 10", not a points threshold —
  // it needs the recorded hand history, not just cumulative totals. See types.ts.
  isFinished: (totals, { rounds }) => isPhase10Finished(rounds, Object.keys(totals)),

  // The primary criterion is phase progress (who cleared Phase 10 first), not points —
  // `totals` only breaks a tie between players who finish in the very same hand.
  pickWinners: (totals, _config, rounds) => pickPhase10Winners(totals, rounds),

  describeRound: (round: Round, players): string => {
    const input = round.input as Phase10Input;
    if (!input?.completed) return 'no result';
    const cleared = players.filter((p) => input.completed[p.id]);
    const points = players.reduce((sum, p) => sum + (Number(input.penalty?.[p.id]) || 0), 0);
    const names = cleared.map((p) => p.name).join(', ');
    if (!cleared.length) return points > 0 ? `nobody advanced · ${points} pts on the table` : 'nobody advanced';
    return points > 0 ? `✅ ${names} advanced · ${points} pts on the table` : `✅ ${names} advanced · clean hand`;
  },

  help: PHASE10_HELP,

  stats: phase10Stats,

  RoundEditor,
  editorLoader: () => import('./Phase10Editor.svelte'),
};
