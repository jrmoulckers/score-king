import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './UnoGolfEditor.svelte';
import { unogolfStats } from './stats';
import {
  DEFAULTS,
  emptyHand,
  resolveConfig,
  scoreHole,
  validateHole,
  type UnoGolfInput,
} from './logic';

export type { UnoGolfInput, UnoGolfHand, UnoGolfConfig, UnoGolfFormat } from './logic';

const ids = (ctx: RoundContext): ID[] => ctx.players.map((p) => p.id);
const nameOf = (ctx: RoundContext) => (id: ID) =>
  ctx.players.find((p) => p.id === id)?.name ?? '?';

export const unogolf: GameModule = {
  id: 'unogolf',
  name: 'Uno Golf',
  tagline: 'Nine holes of Uno — lowest score wins',
  emoji: '⛳',
  keywords: ['uno', 'golf', 'holes', 'party', 'cards', 'lowest wins', 'nine holes', 'links'],
  minPlayers: 2,
  maxPlayers: 10,
  lowerIsBetter: true,
  configFields: [
    {
      key: 'format',
      label: 'Round format',
      type: 'select',
      default: DEFAULTS.format,
      options: [
        { value: 'holes', label: 'Fixed holes' },
        { value: 'target', label: 'Play to a target' },
      ],
      help: 'Fixed plays a set number of holes; Target plays until someone reaches the score cap. Lowest total always wins.',
    },
    {
      key: 'holes',
      label: 'Holes to play',
      type: 'number',
      default: DEFAULTS.holes,
      min: 1,
      max: 18,
      help: 'A round of golf is 9 holes — go 18 for the full course. (Used in Fixed-holes format.)',
    },
    {
      key: 'target',
      label: 'Target score (Target format)',
      type: 'number',
      default: DEFAULTS.target,
      min: 10,
      help: 'In Target format the game ends once any player reaches this — lowest total still wins.',
    },
    {
      key: 'actionValue',
      label: 'Action card value (Skip / Reverse / Draw Two)',
      type: 'number',
      default: DEFAULTS.actionValue,
      min: 0,
      step: 5,
    },
    {
      key: 'wildValue',
      label: 'Wild card value (Wild / Wild Draw Four)',
      type: 'number',
      default: DEFAULTS.wildValue,
      min: 0,
      step: 5,
    },
  ],

  maxRounds: (config) => {
    const cfg = resolveConfig(config);
    return cfg.format === 'holes' ? cfg.holes : null;
  },

  isFinished: (totals, { config }) => {
    const cfg = resolveConfig(config);
    if (cfg.format !== 'target') return false;
    return Object.values(totals).some((t) => t >= cfg.target);
  },

  createRoundInput: (ctx: RoundContext): UnoGolfInput => ({
    hands: Object.fromEntries(ctx.players.map((p) => [p.id, emptyHand()])),
    out: null,
  }),

  validateRound: (input: UnoGolfInput, ctx: RoundContext): string | null =>
    validateHole(input, ids(ctx), nameOf(ctx)),

  scoreRound: (input: UnoGolfInput, ctx: RoundContext): Record<ID, number> =>
    scoreHole(input, ids(ctx), resolveConfig(ctx.config)),

  describeRound: (round: Round, players): string => {
    const input = round.input as UnoGolfInput | undefined;
    if (!input) return '';
    const name = (id: ID | null) => players.find((p) => p.id === id)?.name ?? '?';
    const parts: string[] = [];
    if (input.out) parts.push(`⛳ ${name(input.out)} sank it`);
    for (const p of players) {
      if (input.out === p.id) continue;
      if (!input.hands?.[p.id]) continue;
      parts.push(`${p.name} +${Number(round.deltas?.[p.id]) || 0}`);
    }
    return parts.join(' · ');
  },

  help: [
    'Golf, but with Uno. Play a fixed number of holes (hands) — 9 by default, like a real round of golf. Lowest total after every hole wins.',
    '',
    'Each hole, one player goes out (empties their hand) and sinks the hole for 0 strokes. Everyone else counts the cards left in their own hand as strokes:',
    '• Number cards (0–9): face value',
    '• Action cards (Skip / Reverse / Draw Two): 20 each (default)',
    '• Wild / Wild Draw Four: 50 each (default)',
    '',
    'Mark who sank the hole with ⛳, then tally each other player’s leftover cards. Prefer a marathon? Switch to Target format and race to a score cap instead of fixed holes — lowest still wins.',
  ].join('\n'),

  stats: unogolfStats,

  RoundEditor: Editor,
};
