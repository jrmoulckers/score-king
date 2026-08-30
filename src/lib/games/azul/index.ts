import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { azulStats } from './stats';
import {
  describeRound as describeAzulRound,
  emptyInput,
  scoreRound as scoreAzul,
  validateRound as validateAzul,
  type AzulInput,
} from './logic';

export type { AzulBonus, AzulEntry, AzulInput } from './logic';

export const azul: GameModule = {
  id: 'azul',
  name: 'Azul',
  tagline: 'Tile the wall, dodge the floor line, chase the end-game bonus.',
  emoji: '🧱',
  keywords: ['tiles', 'wall', 'mosaic', 'tessellate', 'floor line', 'abstract'],
  minPlayers: 2,
  maxPlayers: 4,

  createRoundInput: (ctx: RoundContext): AzulInput => emptyInput(ctx.players),

  validateRound: (input: AzulInput, ctx: RoundContext): string | null =>
    validateAzul(input, ctx.players),

  scoreRound: (input: AzulInput, ctx: RoundContext): Record<ID, number> =>
    scoreAzul(input, ctx.players, ctx.totals),

  describeRound: (round: Round, players): string =>
    describeAzulRound(round.input as AzulInput | undefined, players, round.deltas ?? {}),

  // The scorecard flags the final round — the one that closes out the game and
  // carries everyone's end-game bonus — so it reads apart from ordinary rounds.
  roundCellTone: (round: Round, playerId: ID) => {
    const input = round.input as AzulInput | undefined;
    if (!input?.final || round.deltas?.[playerId] == null) return null;
    return { tone: 'good', label: 'Final round — end-game bonus counted' };
  },

  help: [
    'Azul is a tile-drafting game where every round you tile part of your wall —',
    'this app just tracks the score, not the drafting itself.',
    '',
    'Each round, enter for every player:',
    '• Wall points scored — a tile placed alone is worth 1; otherwise it scores the',
    '  length of every contiguous line (horizontal AND vertical) it completes.',
    '• Floor tiles — how many spilled onto the floor line (0–7). The penalty for',
    '  each is built in: −1, −1, −2, −2, −2, −3, −3. A score can never drop below',
    '  zero from floor penalties.',
    '',
    '🏁 The game ends the round someone completes a full horizontal row of five.',
    'Mark that round "Final round" and enter each player\'s end-game bonus:',
    '• +2 for each complete horizontal row',
    '• +7 for each complete vertical column',
    '• +10 for each color with all 5 tiles placed',
    '',
    'Highest total wins. A tie is normally broken by whoever completed more',
    "rows — since this app doesn't track the wall grid, settle that one at the",
    'table and record it as a shared win here.',
  ].join('\n'),

  stats: azulStats,

  RoundEditor,
  editorLoader: () => import('./AzulEditor.svelte'),
};
