import type { GameModule, ID, Round, RoundContext } from '../../types';
import { ordinal } from '../../stats/format';
import { RoundEditor } from '../editor';
import { mariokartStats } from './stats';
import {
  TABLE_META,
  freshPositions,
  normalizeRaces,
  normalizeTable,
  scoreRace,
  validateRace,
  type MarioKartInput,
} from './logic';

export type { MarioKartInput };
export { scoreRace, pointsForPosition } from './logic';

/** Medal for the podium, otherwise the ordinal — used in one-line round summaries. */
function place(pos: number): string {
  if (pos === 1) return '🥇';
  if (pos === 2) return '🥈';
  if (pos === 3) return '🥉';
  return `${ordinal(pos)} `;
}

export const mariokart: GameModule = {
  id: 'mariokart',
  name: 'Mario Kart',
  tagline: 'Grand Prix points across the cup 🏎️',
  emoji: '🏎️',
  keywords: ['grand prix', 'racing', 'kart', 'nintendo', 'cup', 'party', 'couch'],
  minPlayers: 2,
  maxPlayers: 12,
  configFields: [
    {
      key: 'pointsTable',
      label: 'Points table',
      type: 'select',
      default: 'modern12',
      options: [
        { value: 'modern12', label: `Modern · 12 racers (${TABLE_META.modern12.curve})` },
        { value: 'classic8', label: `Classic · 8 racers (${TABLE_META.classic8.curve})` },
        { value: 'retro4', label: `Retro · top 4 (${TABLE_META.retro4.curve})` },
        { value: 'party', label: 'Party · everyone scores (rank countdown)' },
      ],
      help: 'How each finishing spot pays out. Modern is Mario Kart 8 / Wii; Retro is the MK64 top-4.',
    },
    {
      key: 'racers',
      label: 'Racers on the track',
      type: 'number',
      default: 12,
      min: 2,
      max: 24,
      help: 'Total karts including CPUs — the furthest-back spot you can enter. Modern races run 12.',
    },
    {
      key: 'racesPerCup',
      label: 'Races per cup',
      type: 'number',
      default: 4,
      min: 0,
      max: 64,
      help: 'A cup is 4 races. Set 0 for an endless, play-all-night cup.',
    },
  ],

  maxRounds: (config) => {
    const n = normalizeRaces(config.racesPerCup);
    return n > 0 ? n : null;
  },

  createRoundInput: (ctx: RoundContext): MarioKartInput => freshPositions(ctx.players, ctx.config),

  validateRound: (input: MarioKartInput, ctx: RoundContext): string | null =>
    validateRace(input, ctx.players, ctx.config),

  scoreRound: (input: MarioKartInput, ctx: RoundContext): Record<ID, number> =>
    scoreRace(input, ctx.config),

  describeRound: (round: Round, players): string => {
    const input = round.input as MarioKartInput;
    const ranked = players
      .map((p) => ({ name: p.name, pos: Number(input?.positions?.[p.id]) || 0 }))
      .filter((r) => r.pos > 0)
      .sort((a, b) => a.pos - b.pos);
    if (!ranked.length) return 'no results yet';
    const head = ranked
      .slice(0, 3)
      .map((r) => `${place(r.pos)}${r.name}`)
      .join(' · ');
    return ranked.length > 3 ? `${head} · +${ranked.length - 3}` : head;
  },

  help: [
    '🏎️ Mario Kart Grand Prix — chase the cup! 🏆',
    '',
    'A cup is 4 races. After each race, enter where every racer finished; points are',
    'awarded by position and pile up across the cup. Most points at the end wins.',
    '',
    'Points tables (choose one when you start):',
    `• Modern · 12 — ${TABLE_META.modern12.curve}`,
    `• Classic · 8 — ${TABLE_META.classic8.curve}`,
    `• Retro · top 4 — ${TABLE_META.retro4.curve} (5th and back score nothing)`,
    '• Party — everyone scores: 1st gets one point per racer, last still gets 1',
    '',
    'Good to know:',
    '• Finishing spots count the CPUs — 3rd against a full grid still pays 3rd.',
    '• No two racers can share a spot.',
    '• 🍄 Tied on points at the finish? Share the crown.',
  ].join('\n'),

  stats: mariokartStats,

  RoundEditor,
  editorLoader: () => import('./MarioKartEditor.svelte'),
};
