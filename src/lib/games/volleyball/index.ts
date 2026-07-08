import type { GameModule, ID, Round, RoundContext } from '../../types';
import Editor from './VolleyballEditor.svelte';
import { volleyballStats } from './stats';
import {
  maxSets,
  readConfig,
  setWinner,
  targetForSet,
  validateSetScore,
} from './logic';

/**
 * One set's final points, keyed by side (player) id. A volleyball match is
 * modelled as a sequence of sets: each round is a set, and the module banks a
 * "set won" (+1) to whoever took it, so a side's running total is its sets won —
 * exactly the number the big scoreboard should show. The match ends the moment a
 * side reaches the sets it needs (best-of-5 → 3, best-of-3 → 2).
 */
export interface VolleyballInput {
  points: Record<ID, number>;
}

/** The two sides, in board order. Volleyball is always exactly two. */
function sides(ctx: RoundContext): [ID, ID] {
  return [ctx.players[0]?.id, ctx.players[1]?.id];
}

export const volleyball: GameModule = {
  id: 'volleyball',
  name: 'Volleyball',
  tagline: 'Rally scoring, win by two, best of five',
  emoji: '🏐',
  keywords: ['volleyball', 'sets', 'rally', 'net', 'sport', 'beach', 'indoor', 'spike', 'match'],
  minPlayers: 2,
  maxPlayers: 2,
  teams: true,
  configFields: [
    {
      key: 'format',
      label: 'Match length',
      type: 'select',
      default: 'bo5',
      options: [
        { value: 'bo5', label: 'Best of 5 (first to 3 sets)' },
        { value: 'bo3', label: 'Best of 3 (first to 2 sets)' },
      ],
    },
    { key: 'pointsPerSet', label: 'Points to win a set', type: 'number', default: 25, min: 1 },
    {
      key: 'decidingSetPoints',
      label: 'Points to win the deciding set',
      type: 'number',
      default: 15,
      min: 1,
      help: 'The final set (2–2 in a best-of-5, 1–1 in a best-of-3) is played to this shorter target.',
    },
    { key: 'winBy2', label: 'Win a set by two', type: 'boolean', default: true },
    {
      key: 'hardCap',
      label: 'Hard cap (0 = play it out)',
      type: 'number',
      default: 0,
      min: 0,
      help: 'Score where win-by-two stops and the first side to the cap takes the set (e.g. 27). 0 keeps playing until a two-point lead.',
    },
  ],

  createRoundInput: (ctx: RoundContext): VolleyballInput => ({
    points: Object.fromEntries(ctx.players.map((p) => [p.id, 0])),
  }),

  validateRound: (input: VolleyballInput, ctx: RoundContext): string | null => {
    if (ctx.players.length !== 2) return 'Volleyball is played by exactly two sides.';
    const cfg = readConfig(ctx.config);
    const [a, b] = sides(ctx);
    const setsA = Number(ctx.totals[a]) || 0;
    const setsB = Number(ctx.totals[b]) || 0;
    if (setsA >= cfg.setsToWin || setsB >= cfg.setsToWin) {
      return 'The match is already won — no more sets to play.';
    }
    const target = targetForSet(cfg, setsA, setsB);
    return validateSetScore(
      Number(input.points[a]) || 0,
      Number(input.points[b]) || 0,
      target,
      cfg.winBy2,
      cfg.hardCap,
    );
  },

  scoreRound: (input: VolleyballInput, ctx: RoundContext): Record<ID, number> => {
    const cfg = readConfig(ctx.config);
    const [a, b] = sides(ctx);
    const setsA = Number(ctx.totals[a]) || 0;
    const setsB = Number(ctx.totals[b]) || 0;
    const target = targetForSet(cfg, setsA, setsB);
    const winner = setWinner(
      Number(input.points[a]) || 0,
      Number(input.points[b]) || 0,
      target,
      cfg.winBy2,
      cfg.hardCap,
    );
    return { [a]: winner === 'a' ? 1 : 0, [b]: winner === 'b' ? 1 : 0 };
  },

  // A match can't run longer than best-of allows (5 sets in a best-of-5).
  maxRounds: (config) => maxSets(readConfig(config)),

  // Finished the instant a side has banked the sets it needs.
  isFinished: (totals, { config }) => {
    const cfg = readConfig(config);
    return Object.values(totals).some((t) => (Number(t) || 0) >= cfg.setsToWin);
  },

  describeRound: (round: Round, players): string => {
    const input = round.input as VolleyballInput;
    const [pa, pb] = players;
    if (!pa || !pb) return '';
    const a = Number(input.points[pa.id]) || 0;
    const b = Number(input.points[pb.id]) || 0;
    const winner = a > b ? pa : b > a ? pb : null;
    return `${a}–${b}${winner ? ` · ${winner.name}` : ''}`;
  },

  help: [
    'Rally scoring: every serve wins a point for one side.',
    'A set is played to 25 and must be won by two, so a tight set runs on',
    '(25–23, 26–24, 30–28…) until a side leads by two.',
    '',
    'The match is best of 5 — first side to win 3 sets takes it (or best of 3,',
    'first to 2). If it reaches a deciding set (2–2, or 1–1), that set is played',
    'to 15, still win by two.',
    '',
    'Optional hard cap: set a ceiling (e.g. 27) where win-by-two stops and the',
    'first side to the cap wins the set.',
    '',
    'Enter each set’s final score as it ends; the board tracks sets won and calls',
    'the match at set point.',
  ].join('\n'),

  stats: volleyballStats,

  RoundEditor: Editor,
};
