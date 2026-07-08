import type { GameModule, ID, Player, Round, RoundContext } from '../../types';
import Editor from './CornholeEditor.svelte';
import { cornholeStats } from './stats';
import {
  BAGS_PER_SIDE,
  cancel,
  type CornholeInput,
  emptyThrow,
  isWon,
  readConfig,
  scoreCornhole,
  sideRaw,
} from './logic';

/** The two seats are the two sides — first is Side A, second is Side B. */
function sideIds(ctx: RoundContext): [ID, ID] {
  return [ctx.players[0]?.id, ctx.players[1]?.id];
}

export const cornhole: GameModule = {
  id: 'cornhole',
  name: 'Cornhole',
  tagline: 'Toss the bags. Cancel & climb to 21.',
  emoji: '🌽',
  keywords: ['bags', 'bag toss', 'corn toss', 'baggo', 'cornhole', 'tailgate', 'backyard'],
  // Two sides — 1v1 or 2v2. Each seat is a side, so the board shows two scores to 21.
  minPlayers: 2,
  maxPlayers: 2,
  configFields: [
    { key: 'target', label: 'Play to', type: 'number', default: 21, min: 11, max: 51, help: 'First side to reach this wins. Backyard standard is 21.' },
    { key: 'bust', label: 'Bust — overshoot and you drop to 15', type: 'boolean', default: false, help: 'Blow past the target and your side tumbles back to 15. Land it exactly to win.' },
    { key: 'winBy', label: 'Win by', type: 'number', default: 1, min: 1, max: 5, help: 'Margin needed to close it out. 1 = first side to the target takes it.' },
    {
      key: 'format',
      label: 'Sides',
      type: 'select',
      default: '1v1',
      options: [
        { value: '1v1', label: 'Singles (1v1)' },
        { value: '2v2', label: 'Doubles (2v2)' },
      ],
      help: 'Flavor only — solo duel or partners, it is always two sides racing to the target.',
    },
  ],

  createRoundInput: (ctx: RoundContext): CornholeInput => ({
    sides: Object.fromEntries(ctx.players.map((p) => [p.id, emptyThrow()])),
  }),

  validateRound: (input: CornholeInput, ctx: RoundContext): string | null => {
    if (ctx.players.length !== 2) return 'Cornhole is played by exactly two sides.';
    for (const p of ctx.players) {
      const t = input.sides?.[p.id];
      const inHole = Math.trunc(Number(t?.inHole) || 0);
      const onBoard = Math.trunc(Number(t?.onBoard) || 0);
      if (inHole < 0 || onBoard < 0) return `${p.name}: bag counts can't be negative.`;
      if (inHole + onBoard > BAGS_PER_SIDE) {
        return `${p.name}: only ${BAGS_PER_SIDE} bags per round (got ${inHole + onBoard}).`;
      }
    }
    return null;
  },

  scoreRound: (input: CornholeInput, ctx: RoundContext): Record<ID, number> =>
    scoreCornhole(sideIds(ctx), input, ctx.totals, readConfig(ctx.config)).deltas,

  isFinished: (totals, { config }) => isWon(totals, readConfig(config)),

  describeRound: (round: Round, players: Player[]): string => {
    const input = round.input as CornholeInput;
    const [a, b] = players;
    if (!a || !b) return '🌽 —';
    const aRaw = sideRaw(input.sides?.[a.id]);
    const bRaw = sideRaw(input.sides?.[b.id]);
    const { gainer, net } = cancel(aRaw, bRaw);
    if (!gainer) return `🌽 Wash · ${aRaw}–${bRaw}`;
    const name = gainer === 'a' ? a.name : b.name;
    return `🌽 ${name} +${net} · ${aRaw}–${bRaw}`;
  },

  help: [
    'Cornhole — cancellation scoring, two sides, first to 21.',
    '',
    'Each round both sides toss their 4 bags:',
    '• In the hole (a "drano") = 3 points',
    '• On the board (a "woody") = 1 point',
    '• On the ground = nothing',
    '',
    'The two sides then CANCEL: only the higher side scores, and only the',
    'difference. Side A gets 7, Side B gets 4 → A scores +3, B scores 0. A tie',
    'is a "wash" — nobody scores.',
    '',
    'First side to the target (21 by default) wins. Land it exactly for the',
    'cleanest finish.',
    '',
    'Bust variant (optional): overshoot the target and your side drops back to',
    '15 — so a four-bagger at the wrong moment can undo you.',
  ].join('\n'),

  stats: cornholeStats,

  RoundEditor: Editor,
};
