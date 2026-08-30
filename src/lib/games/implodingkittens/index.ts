import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { implodingKittensStats } from './stats';
import {
  emptyInput,
  isFinished as ikFinished,
  pickMatchLeaders,
  scoreMatch,
  validateMatch,
  type ImplodingKittensInput,
} from './logic';

export type { ImplodingKittensInput } from './logic';

const trackOrderOn = (config: Record<string, unknown>): boolean => config.trackOrder !== false;

export const implodingkittens: GameModule = {
  id: 'implodingkittens',
  name: 'Imploding Kittens',
  tagline: 'Draw til you cave in — last kitten standing wins 🕳️🐱',
  emoji: '🕳️',
  keywords: ['exploding', 'imploding', 'kittens', 'party', 'elimination', 'cards', 'expansion'],
  minPlayers: 2,
  maxPlayers: 6,
  configFields: [
    {
      key: 'targetWins',
      label: 'End the game when a player reaches ___ match wins (0 = open-ended)',
      type: 'number',
      default: 3,
      min: 0,
      max: 50,
      help: 'Play until someone banks this many match wins, then crown the leaderboard, or leave at 0 to keep dealing all night.',
    },
    {
      key: 'trackOrder',
      label: 'Track elimination order (who imploded when)',
      type: 'boolean',
      default: true,
      help: 'On: tap each kitten as they implode and the survivor is crowned automatically — unlocks first-to-implode and finish stats. Off: just tap who survived.',
    },
  ],

  // Higher match-win total leads (default win direction).

  isFinished: (totals, { config }) => ikFinished(totals, config),

  createRoundInput: (): ImplodingKittensInput => emptyInput(),

  validateRound: (input: ImplodingKittensInput, ctx: RoundContext): string | null =>
    validateMatch(
      input,
      ctx.players.map((p) => p.id),
      trackOrderOn(ctx.config),
    ),

  scoreRound: (input: ImplodingKittensInput, ctx: RoundContext): Record<ID, number> =>
    scoreMatch(
      input,
      ctx.players.map((p) => p.id),
    ),

  pickWinners: (totals): ID[] => pickMatchLeaders(totals),

  describeRound: (round: Round, players): string => {
    const input = round.input as ImplodingKittensInput;
    const name = (id: ID | null | undefined) => players.find((p) => p.id === id)?.name ?? '?';
    if (!input?.winner && (!input?.order || input.order.length === 0)) return 'no result';
    const head = input.winner ? `👑 ${name(input.winner)} survived` : 'no survivor';
    const parts = [head];
    if (input.order && input.order.length) {
      parts.push(`🕳️ ${name(input.order[0])} out first`);
    }
    return parts.join(' · ');
  },

  help: [
    '🕳️🐱 Imploding Kittens — the Exploding Kittens expansion, played as a match tracker.',
    '',
    'Play a match: draw cards until someone flips an Imploding Kitten they can’t',
    'Defuse — they’re OUT. Keep going until ONE player remains: the last kitten',
    'standing wins the match and banks +1 on the leaderboard. Most match wins leads.',
    '',
    '☠️ The Imploding Kitten twist: when it’s drawn face down, its drawer looks at it,',
    'then secretly slides it back into the draw pile face up, anywhere they like — no',
    'Defuse card can stop it. The next player to draw it (now face up) is eliminated',
    'on the spot; it can’t be Noped either.',
    '',
    'New cards in the expansion: Reverse (flips turn order — a Skip in 2-player),',
    'Draw From the Bottom (end your turn from the bottom of the deck), Feral Cat',
    '(a wild Cat Card for any combo), Alter the Future (peek & reorder the top 3',
    'cards), and Targeted Attack (force any one player to take two turns).',
    '',
    'Each round here = one match. With “Track elimination order” on, tap each player',
    'as they implode and the survivor is crowned for you; turn it off to just tap the',
    'winner.',
  ].join('\n'),

  stats: implodingKittensStats,

  RoundEditor,
  editorLoader: () => import('./ImplodingKittensEditor.svelte'),
};
