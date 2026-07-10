import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { explodingKittensStats } from './stats';
import {
  emptyInput,
  defuseTotal,
  matchLimit,
  pickMatchLeaders,
  scoreMatch,
  validateMatch,
  type EKInput,
} from './logic';

export type { EKInput } from './logic';

const trackOrderOn = (config: Record<string, unknown>): boolean => config.trackOrder !== false;

export const explodingkittens: GameModule = {
  id: 'explodingkittens',
  name: 'Exploding Kittens',
  tagline: 'Draw til you blow up — last kitten standing wins 💥🐱',
  emoji: '💥',
  keywords: ['exploding', 'imploding', 'kittens', 'party', 'elimination', 'cards', 'defuse'],
  // Base game is 2–5; the Imploding Kittens expansion adds a 6th seat, and two
  // combined decks stretch to a full party — so the tracker is generous by design.
  minPlayers: 2,
  maxPlayers: 10,
  configFields: [
    {
      key: 'imploding',
      label: 'Imploding Kittens expansion (☠️ can’t be defused)',
      type: 'boolean',
      default: false,
      help: 'Adds the face-up/face-down Imploding Kitten, streaking and targeted attacks — a reminder in the tracker; the last kitten standing still wins the match.',
    },
    {
      key: 'trackOrder',
      label: 'Track elimination order (who exploded when)',
      type: 'boolean',
      default: true,
      help: 'On: tap each kitten as they explode and the survivor is crowned automatically — unlocks first-to-explode and finish stats. Off: just tap who survived.',
    },
    {
      key: 'trackDefuses',
      label: 'Track defuses (who cheated death 🛡)',
      type: 'boolean',
      default: false,
      help: 'On: tap 🛡 whenever someone Defuses an Exploding Kitten — a per-match tally that unlocks the “deaths cheated / most defuses” stat. Off (default): keeps entry to pure single taps.',
    },
    {
      key: 'matches',
      label: 'Number of matches (0 = open-ended)',
      type: 'number',
      default: 0,
      min: 0,
      max: 50,
      help: 'Play a set number of matches then crown the leaderboard, or leave at 0 to keep dealing all night.',
    },
  ],

  // Higher match-win total leads (default win direction).

  maxRounds: (config) => matchLimit(config),

  createRoundInput: (): EKInput => emptyInput(),

  validateRound: (input: EKInput, ctx: RoundContext): string | null =>
    validateMatch(input, ctx.players.map((p) => p.id), trackOrderOn(ctx.config)),

  scoreRound: (input: EKInput, ctx: RoundContext): Record<ID, number> =>
    scoreMatch(input, ctx.players.map((p) => p.id)),

  pickWinners: (totals): ID[] => pickMatchLeaders(totals),

  describeRound: (round: Round, players): string => {
    const input = round.input as EKInput;
    const name = (id: ID | null | undefined) => players.find((p) => p.id === id)?.name ?? '?';
    if (!input?.winner && (!input?.order || input.order.length === 0)) return 'no result';
    const head = input.winner ? `👑 ${name(input.winner)} survived` : 'no survivor';
    const parts = [head];
    if (input.order && input.order.length) {
      parts.push(`💥 ${name(input.order[0])} out first`);
    }
    const defused = defuseTotal(input);
    if (defused) parts.push(`🛡 ${defused} defused`);
    return parts.join(' · ');
  },

  help: [
    '💥🐱 Exploding Kittens — a match tracker.',
    '',
    'Play a match: draw cards until someone flips an Exploding Kitten they can’t',
    'Defuse — they’re OUT. Keep going until ONE player remains: the last kitten',
    'standing wins the match and banks +1 on the leaderboard. Most match wins leads.',
    '',
    'Each round here = one match. With “Track elimination order” on, tap each player',
    'as they explode and the survivor is crowned for you; turn it off to just tap the',
    'winner. Turn on “Track defuses” to tap 🛡 whenever someone cheats death — it feeds',
    'the deaths-cheated stat. Imploding Kittens on? The ☠️ Imploding Kitten can’t be',
    'defused — flip it and you’re out on the spot.',
  ].join('\n'),

  stats: explodingKittensStats,

  RoundEditor,
  editorLoader: () => import('./ExplodingKittensEditor.svelte'),
};
