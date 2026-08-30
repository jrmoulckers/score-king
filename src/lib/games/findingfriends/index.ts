import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { findingFriendsStats } from './stats';
import {
  WINNING_LEVEL_INDEX,
  describeDeal,
  deckCountFromConfig,
  optionsFromConfig,
  scoreFindingFriends,
  sideLevelIndex,
  validateFindingFriends,
  type FindingFriendsInput,
} from './logic';

export type { FindingFriendsInput } from './logic';

/**
 * Carries the previous deal's side assignment forward (the bank usually stays with mostly
 * the same people), dropping anyone no longer in the lineup. With no usable history, seats
 * the first pick alone as the opening banker — an arbitrary but harmless starting point the
 * table immediately adjusts on the first deal via the editor's side toggles.
 */
function defaultSides(ctx: RoundContext): { declarers: ID[]; challengers: ID[] } {
  const ids = ctx.players.map((p) => p.id);
  const last = ctx.rounds[ctx.rounds.length - 1]?.input as FindingFriendsInput | undefined;
  if (last?.declarers?.length) {
    const stillDeclarers = last.declarers.filter((id) => ids.includes(id));
    if (stillDeclarers.length) {
      const rest = ids.filter((id) => !stillDeclarers.includes(id));
      return { declarers: stillDeclarers, challengers: rest };
    }
  }
  const [first, ...rest] = ids;
  return { declarers: first ? [first] : [], challengers: rest };
}

export const findingFriends: GameModule = {
  id: 'findingfriends',
  name: 'Finding Friends',
  tagline: 'Call a partner in secret, race the levels to Ace.',
  emoji: '🃏',
  keywords: ['zhao pengyou', 'tractor', 'sheng ji', 'tuo la ji', 'trick taking', 'levels'],
  minPlayers: 4,
  maxPlayers: 8,
  teams: true,
  configFields: [
    {
      key: 'deckCount',
      label: 'Decks in play',
      type: 'select',
      default: '2',
      options: [
        { value: '2', label: '2 decks — 4–6 players' },
        { value: '3', label: '3 decks — 7–8 players' },
        { value: '4', label: '4 decks — house rule for a big table' },
      ],
      help: 'More decks add more point cards (100 pts each); the level-jump table scales with it.',
    },
  ],

  createRoundInput: (ctx: RoundContext): FindingFriendsInput => ({
    ...defaultSides(ctx),
    pointsCaptured: null,
  }),

  validateRound: (input: FindingFriendsInput): string | null => validateFindingFriends(input),

  scoreRound: (input: FindingFriendsInput, ctx: RoundContext): Record<ID, number> =>
    scoreFindingFriends(input, optionsFromConfig(ctx.config)),

  isFinished: (totals) => {
    return Object.values(totals).some((t) => t >= WINNING_LEVEL_INDEX);
  },

  describeRound: (round: Round, players): string => {
    const input = round.input as FindingFriendsInput;
    return describeDeal(input, players, round.deltas);
  },

  roundCellTone: (round: Round, playerId: ID) => {
    const input = round.input as FindingFriendsInput;
    const delta = round.deltas?.[playerId] ?? 0;
    if (delta > 0) {
      const onDeclarers = input.declarers?.includes(playerId);
      return { tone: 'good', label: onDeclarers ? 'Held the bank' : 'Broke through' };
    }
    return null;
  },

  help: [
    'Finding Friends (Zhǎo Péngyou) — 4–8 players, 2+ decks, trick-taking with a level race.',
    '',
    'Each deal, the current banker ("declarers") calls a card to secretly recruit a partner;',
    'everyone else is that deal\u2019s "challengers". Point cards: 5s = 5, 10s = 10, Ks = 10.',
    '',
    'After the deal, tally points the challengers captured:',
    '• 0 points — declarers hold strong, +3 levels.',
    '• Under 20% of the pool — declarers +2.',
    '• 20–40% — declarers +1.',
    '• 40–60% — a wash, nobody advances.',
    '• 60–80% — challengers break through, +1.',
    '• 80–100% — challengers +2.',
    '• 100%+ (a full sweep) — challengers +3.',
    '',
    'The side that just won keeps (or takes over) the bank for the next deal.',
    'Levels run 2 → 3 → … → K → A. First side to reach Ace wins the game!',
  ].join('\n'),

  stats: findingFriendsStats,

  RoundEditor,
  editorLoader: () => import('./FindingFriendsEditor.svelte'),
};

export { deckCountFromConfig, optionsFromConfig, sideLevelIndex };
