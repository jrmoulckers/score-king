import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { holdemStats } from './stats';
import {
  investedByPlayer,
  readConfig,
  scoreEvent,
  toMoney,
  validateEvent,
  type HoldemConfig,
  type HoldemEvent,
} from './logic';

// One entry point for importers (editor, stats) even though the pure model lives
// in ./logic.
export {
  readConfig,
  scoreEvent,
  toMoney,
  validateEvent,
  type HoldemConfig,
  type HoldemEvent,
} from './logic';

/** Money-ish formatter for round summaries — a "$" prefix only in dollar modes. */
function fmtAmount(amount: number, cfg: HoldemConfig): string {
  const money = toMoney(amount, cfg);
  const rounded = Math.round(money * 100) / 100;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return cfg.unit === 'chips' ? body : `$${body}`;
}

export const holdem: GameModule = {
  id: 'holdem',
  name: "Texas Hold'em",
  tagline: 'Post the blinds. Rake the pot. Settle up.',
  emoji: '♠️',
  keywords: ['poker', 'holdem', "hold 'em", 'cards', 'chips', 'buy-in', 'cash game', 'tournament', 'betting'],
  minPlayers: 2,
  maxPlayers: 12,

  configFields: [
    {
      key: 'unit',
      label: 'Track in',
      type: 'select',
      default: 'dollars',
      options: [
        { value: 'dollars', label: 'Dollars ($)' },
        { value: 'chips', label: 'Chips only' },
        { value: 'chipsWithValue', label: 'Chips with a cash value' },
      ],
      help: 'How buy-ins and pots are entered — and how the final settle-up reads.',
    },
    {
      key: 'chipsPerUnit',
      label: 'Chips per $1',
      type: 'number',
      default: 100,
      min: 1,
      max: 100000,
      step: 1,
      help: 'Only used when tracking chips with a cash value.',
    },
    { key: 'defaultBuyin', label: 'Default buy-in', type: 'number', default: 20, min: 1, step: 1 },
    { key: 'rebuys', label: 'Allow rebuys', type: 'boolean', default: true },
    {
      key: 'depth',
      label: 'Track hands',
      type: 'select',
      default: 'ledger',
      options: [
        { value: 'ledger', label: 'Buy-ins only (settle at the end)' },
        { value: 'perhand', label: 'Per hand — tap the winner + pot' },
        { value: 'betting', label: 'Full betting — run every street' },
      ],
      help: 'The default flow for a new hand. You can still change it hand to hand.',
    },
    {
      key: 'mode',
      label: 'Format',
      type: 'select',
      default: 'cash',
      options: [
        { value: 'cash', label: 'Cash game' },
        { value: 'tournament', label: 'Tournament' },
      ],
    },
    {
      key: 'startingStack',
      label: 'Starting stack (chips)',
      type: 'number',
      default: 1000,
      min: 1,
      step: 50,
      help: 'Chips a player brings into a full-betting hand.',
    },
    { key: 'smallBlind', label: 'Small blind', type: 'number', default: 5, min: 0, step: 1 },
    { key: 'bigBlind', label: 'Big blind', type: 'number', default: 10, min: 0, step: 1 },
    { key: 'ante', label: 'Ante', type: 'number', default: 0, min: 0, step: 1 },
    {
      key: 'blindMinutes',
      label: 'Minutes per blind level',
      type: 'number',
      default: 15,
      min: 1,
      max: 120,
      step: 1,
      help: 'Tournament level timer length.',
    },
  ],

  // Open-ended: a poker night runs until the table cashes out and settles up.
  maxRounds: () => null,

  createRoundInput: (ctx: RoundContext): HoldemEvent => {
    // Default the next event to a buy-in for the first player still needing chips,
    // pre-filled with the table's default buy-in. The editor switches event kinds.
    const cfg = readConfig(ctx.config);
    const invested = investedByPlayer(ctx.rounds);
    const next = ctx.players.find((p) => !(invested[p.id] > 0)) ?? ctx.players[0];
    return { kind: 'buyin', playerId: next?.id ?? '', amount: cfg.defaultBuyin };
  },

  validateRound: (input: HoldemEvent, ctx: RoundContext): string | null => validateEvent(input, ctx),

  scoreRound: (input: HoldemEvent, ctx: RoundContext): Record<ID, number> => scoreEvent(input, ctx),

  describeRound: (round: Round, players): string => {
    const event = round.input as HoldemEvent | undefined;
    const name = (id: ID) => players.find((p) => p.id === id)?.name ?? '—';
    // describeRound has no config in scope; read amounts as raw units (no "$"
    // guess) so the summary stays correct in every mode.
    const amt = (n: number) => Math.round(n).toLocaleString();
    if (!event) return '';
    switch (event.kind) {
      case 'buyin':
        return `💰 ${name(event.playerId)} bought in ${amt(event.amount)}`;
      case 'hand': {
        const pot = event.pots.reduce((a, p) => a + (Number(p.amount) || 0), 0);
        const winners = Array.from(new Set(event.pots.flatMap((p) => p.winnerIds)))
          .map(name)
          .join(' & ');
        return `♠️ ${winners} won ${amt(pot)}`;
      }
      case 'cashout': {
        const parts = Object.keys(event.counts).map((id) => `${name(id)} ${amt(event.counts[id])}`);
        return `🧮 Cash out · ${parts.join(' · ')}`;
      }
    }
  },

  help: [
    "Texas Hold'em — the app is your dealer's ledger, not the cards. Keep the real",
    'cards and chips on the table; the phone tracks the money and settles up.',
    '',
    'Track at any granularity:',
    '• Buy-ins only — log each buy-in/rebuy, count chips at the end, get the settle-up.',
    '• Per hand — tap who won and the pot; standings update live.',
    '• Full betting — run preflop/flop/turn/river; calls, all-ins and side-pots are',
    '  worked out for you, then tap the winner of each pot.',
    '',
    'Buy-ins never change who is up or down — cash becomes chips at par. Chips only',
    'move when a hand is settled. At the end, "Cash out" counts everyone up and shows',
    'the shortest list of "who pays whom".',
    '',
    'Blinds, antes and a tournament level timer appear when you turn on full betting',
    'or tournament mode.',
  ].join('\n'),

  stats: holdemStats,

  RoundEditor,
  editorLoader: () => import('./HoldemEditor.svelte'),
};
