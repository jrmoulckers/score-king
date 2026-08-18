import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { secretHitlerStats } from './stats';
import { computeState, eventOf, previewAfter, validate, type SecretHitlerInput } from './logic';

export type { SecretHitlerInput } from './logic';

/** The recorded events entering the round at `ctx.roundIndex` (excludes the draft). */
function eventsBefore(ctx: RoundContext): SecretHitlerInput[] {
  return ctx.rounds.slice(0, ctx.roundIndex).map((r) => eventOf(r.input));
}

export const secrethitler: GameModule = {
  id: 'secrethitler',
  name: 'Secret Hitler',
  tagline: 'Liberals vs. Fascists — enact policies, hunt the truth',
  emoji: '🎩',
  keywords: [
    'social deduction',
    'hidden role',
    'hidden identity',
    'bluffing',
    'party',
    'liberals',
    'fascists',
    'policies',
    'werewolf',
    'mafia',
  ],
  minPlayers: 5,
  maxPlayers: 10,
  teams: true,

  configFields: [
    {
      key: 'reminders',
      label: 'Show board reminders (roles & Fascist powers)',
      type: 'boolean',
      default: true,
      help: 'Surfaces the role split and each Fascist board power as you enact policies.',
    },
    {
      key: 'hitlerHint',
      label: 'Hitler knows the Fascists',
      type: 'select',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto (5–6 players only)' },
        { value: 'on', label: 'Always remind' },
        { value: 'off', label: 'Never remind' },
      ],
      help: 'In official 5–6 player games Hitler knows the other Fascists.',
    },
  ],

  createRoundInput: (): SecretHitlerInput => ({
    event: 'liberal',
    hitlerKilled: false,
    target: null,
    winners: [],
  }),

  validateRound: (input: SecretHitlerInput, ctx: RoundContext): string | null => {
    const before = computeState(eventsBefore(ctx));
    const valid = (id: ID) => ctx.players.some((p) => p.id === id);
    return validate(before, eventOf(input), ctx.players.length, valid);
  },

  scoreRound: (input: SecretHitlerInput, ctx: RoundContext): Record<ID, number> => {
    const before = computeState(eventsBefore(ctx));
    const after = previewAfter(before, eventOf(input));
    const out: Record<ID, number> = {};
    for (const p of ctx.players) out[p.id] = 0;
    // Only the round that clinches the game carries the victory: award each recorded
    // winner a single point so `pickWinners`/`isFinished` can read the outcome.
    if (after.winner && !before.winner) {
      for (const id of input.winners ?? []) if (id in out) out[id] = 1;
    }
    return out;
  },

  // Scoreless: the game is over once a victory has been recorded (a winner has a point).
  isFinished: (totals) => Object.values(totals).some((t) => (Number(t) || 0) > 0),

  // The winning team = every member awarded a victory point on the deciding round.
  pickWinners: (totals) => Object.keys(totals).filter((id) => (Number(totals[id]) || 0) > 0),

  describeRound: (round: Round, players): string => {
    const input = eventOf(round.input);
    const nameOf = (id: ID | null | undefined) =>
      players.find((p) => p.id === id)?.name ?? 'someone';
    const decided = (input.winners?.length ?? 0) > 0;
    switch (input.event) {
      case 'liberal':
        return decided ? '📘 Liberal policy — Liberals win! 🏁' : '📘 Liberal policy enacted';
      case 'fascist':
        return decided ? '📕 Fascist policy — Fascists win! 🏁' : '📕 Fascist policy enacted';
      case 'electionFailed':
        return '🗳️ Government rejected — election tracker +1';
      case 'execution':
        if (input.hitlerKilled)
          return `🔫 ${nameOf(input.target)} executed — it was Hitler! Liberals win 🏁`;
        return input.target ? `🔫 ${nameOf(input.target)} executed` : '🔫 Player executed';
      case 'hitlerChancellor':
        return '🎩 Hitler elected Chancellor — Fascists win! 🏁';
      default:
        return 'Round recorded';
    }
  },

  help: [
    'Secret Hitler is a hidden-role game of Liberals vs. Fascists — one Fascist is secretly Hitler.',
    'This is a tracker: tap in each enacted policy and the board keeps score for you.',
    '',
    'Liberals win by:',
    '• enacting 5 Liberal policies 📘, or',
    '• assassinating Hitler 🔫 (a President’s execution power).',
    '',
    'Fascists win by:',
    '• enacting 6 Fascist policies 📕, or',
    '• electing Hitler Chancellor 🎩 once 3 Fascist policies are enacted.',
    '',
    'Each round, record what the government did: a Liberal or Fascist policy, a failed',
    'election (tracker +1; at 3 the top policy is force-enacted), an execution, or Hitler',
    'taking the Chancellorship. When a win triggers, reveal roles and tap the winning team.',
  ].join('\n'),

  stats: secretHitlerStats,

  RoundEditor,
  editorLoader: () => import('./SecretHitlerEditor.svelte'),
};
