import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { wizardStats } from './stats';
import {
  describeRound as describeWizardRound,
  emptyRow,
  roundsForPlayerCount,
  scoreRound as scoreWizard,
  validateRound as validateWizard,
  type WizardInput,
} from './logic';

export type { WizardInput, WizardRow } from './logic';

export const wizard: GameModule = {
  id: 'wizard',
  name: 'Wizard',
  tagline: 'Bid the exact tricks, or pay for the miss.',
  emoji: '🧙',
  keywords: ['trick taking', 'bidding', 'cards', 'trump'],
  minPlayers: 3,
  maxPlayers: 6,

  createRoundInput: (ctx: RoundContext): WizardInput => ({
    rows: Object.fromEntries(ctx.players.map((p) => [p.id, emptyRow()])),
  }),

  validateRound: (input: WizardInput, ctx: RoundContext): string | null =>
    validateWizard(input, ctx.players, ctx.roundIndex),

  scoreRound: (input: WizardInput, ctx: RoundContext): Record<ID, number> =>
    scoreWizard(input, ctx.players),

  maxRounds: (_config, playerCount) => roundsForPlayerCount(playerCount),

  describeRound: (round: Round, players): string =>
    describeWizardRound(round.input as WizardInput | undefined, players),

  help: [
    'A 60-card deck (the standard 52 plus 4 Wizards and 4 Jesters) deals 1 card',
    'in round 1, growing by one card every round — 20 rounds at 3 players,',
    '15 at 4, 12 at 5, 10 at 6.',
    '',
    'Every round, everyone bids the exact number of tricks they’ll take.',
    '',
    'Hit your bid exactly: 20 + 10 × bid.',
    'Miss it: −10 for every trick over or under.',
    '',
    'Because every trick goes to exactly one player, the tricks recorded across',
    'the table must add up to the round number — the editor checks this for you.',
    '',
    'Highest total after the last round wins.',
  ].join('\n'),

  stats: wizardStats,

  RoundEditor,
  editorLoader: () => import('./WizardEditor.svelte'),
};
