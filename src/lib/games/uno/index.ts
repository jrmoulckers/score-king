import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { unoStats } from './stats';
import {
  createUnoInput,
  isUnoFinished,
  opponentsTotal,
  scoreUno,
  validateUno,
  type UnoInput,
} from './logic';

export type { UnoInput, UnoConfig, UnoMode, UnoHand } from './logic';

export const uno: GameModule = {
  id: 'uno',
  name: 'Uno',
  tagline: 'Ditch your cards, stick everyone else with theirs',
  emoji: '🃏',
  keywords: ['uno', 'shedding', 'crazy eights', 'wild', 'draw four', 'cards'],
  minPlayers: 2,
  maxPlayers: 10,
  // Standard: the scooper climbs, highest wins. Golf: you dread points, lowest wins.
  resolveLowerIsBetter: (c) => c.mode === 'golf',
  configFields: [
    { key: 'target', label: 'Play to (points)', type: 'number', default: 500, min: 1, step: 50 },
    {
      key: 'mode',
      label: 'Scoring',
      type: 'select',
      default: 'winner',
      options: [
        { value: 'winner', label: 'Winner scoops opponents’ cards' },
        { value: 'golf', label: 'Everyone counts their own — low wins' },
      ],
      help: 'Standard Uno banks leftover cards to the player who went out. Golf makes every player carry the cards left in their own hand.',
    },
    {
      key: 'actionValue',
      label: 'Action card value (Skip · Reverse · Draw Two)',
      type: 'number',
      default: 20,
      min: 0,
      step: 5,
    },
    {
      key: 'wildValue',
      label: 'Wild card value (Wild · Wild Draw Four)',
      type: 'number',
      default: 50,
      min: 0,
      step: 5,
    },
  ],

  createRoundInput: (ctx: RoundContext): UnoInput =>
    createUnoInput(ctx.players.map((p) => p.id)),

  validateRound: (input: UnoInput, ctx: RoundContext): string | null =>
    validateUno(input, ctx.players),

  scoreRound: (input: UnoInput, ctx: RoundContext): Record<ID, number> =>
    scoreUno(input, ctx.players.map((p) => p.id), ctx.config),

  isFinished: (totals, { config }) => isUnoFinished(totals, config),

  describeRound: (round: Round, players): string => {
    const input = round.input as UnoInput;
    if (!input?.out) return 'no result';
    const winner = players.find((p) => p.id === input.out)?.name ?? '?';
    // Mode isn't available here, so stay mode-neutral: the count of leftover points on the
    // table reads right whether the winner scooped it (standard) or each player banked their
    // own (golf) — never the misleading "+pot" that only makes sense in standard.
    const onTable = opponentsTotal(input, players.map((p) => p.id));
    return onTable > 0 ? `🎉 ${winner} out · ${onTable} left in hands` : `🎉 ${winner} out · clean sweep`;
  },

  help: [
    'Empty your hand to end the round and shout “Uno!”.',
    '',
    'When you go out, you score the cards left in everyone else’s hands:',
    '• Number cards 0–9 — face value',
    '• Skip, Reverse, Draw Two — 20 each',
    '• Wild, Wild Draw Four — 50 each',
    '',
    'First player to the target score (default 500) wins.',
    '',
    'Golf mode: nobody scoops. Instead, every player banks the value of the',
    'cards left in their own hand each round — and the lowest total wins.',
  ].join('\n'),

  stats: unoStats,

  RoundEditor,
  editorLoader: () => import('./UnoEditor.svelte'),
};
