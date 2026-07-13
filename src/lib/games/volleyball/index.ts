import type { GameModule, ID, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { volleyballStats } from './stats';
import {
  cloneTeams,
  defaultTeams,
  readConfig,
  type Team,
  validateSetScore,
  type VolleyballInput,
  winningTeamId,
} from './logic';

export type { VolleyballInput } from './logic';

/** Recorded sets from prior rounds, in play order. */
function recordedSets(ctx: RoundContext): VolleyballInput[] {
  return [...ctx.rounds]
    .sort((a, b) => a.index - b.index)
    .map((r) => r.input as VolleyballInput)
    .filter((i): i is VolleyballInput => !!i && Array.isArray(i.teams));
}

/** The team lineup for the next set: carry the last set's teams forward, else seed fresh. */
function carryTeams(ctx: RoundContext): Team[] {
  const sets = recordedSets(ctx);
  const last = sets[sets.length - 1];
  if (last?.teams?.length) return cloneTeams(last.teams);
  return defaultTeams(readConfig(ctx.config), ctx.players.map((p) => p.id));
}

export const volleyball: GameModule = {
  id: 'volleyball',
  name: 'Volleyball',
  tagline: 'Build teams, rally to the set, climb the standings',
  emoji: '🏐',
  keywords: ['volleyball', 'sets', 'rally', 'net', 'sport', 'beach', 'indoor', 'spike', 'teams', 'match'],
  // A shared pool of players you split into teams — from a 2s beach duel up to several
  // indoor sixes rotating through the court.
  minPlayers: 2,
  maxPlayers: 24,
  teams: true,
  configFields: [
    {
      key: 'format',
      label: 'Style of play',
      type: 'select',
      default: 'indoor',
      options: [
        { value: 'beach', label: 'Beach — 2s' },
        { value: 'fours', label: 'Fours — 4s' },
        { value: 'indoor', label: 'Indoor — 6s' },
        { value: 'custom', label: 'Custom — any size' },
      ],
      help: 'Sets the suggested roster size per team. You can still put anyone anywhere.',
    },
    { key: 'numberOfTeams', label: 'Teams to start with', type: 'number', default: 2, min: 2, max: 8, help: 'Seed this many teams from your player pool. Add, remove or rebrand them any time during play.' },
    { key: 'pointsPerSet', label: 'Points to win a set', type: 'number', default: 25, min: 1, help: 'Rally scoring. Beach is usually 21, indoor 25.' },
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

  createRoundInput: (ctx: RoundContext): VolleyballInput => {
    const teams = carryTeams(ctx);
    const ids = teams.map((t) => t.id);
    const sets = recordedSets(ctx);
    const last = sets[sets.length - 1];
    const home = last?.home && ids.includes(last.home) ? last.home : ids[0] ?? '';
    const away =
      last?.away && ids.includes(last.away) && last.away !== home
        ? last.away
        : ids.find((id) => id !== home) ?? '';
    return { teams, home, away, points: { home: 0, away: 0 }, rallies: [] };
  },

  validateRound: (input: VolleyballInput, ctx: RoundContext): string | null => {
    if (!input?.teams?.length) return 'Set up your teams first.';
    if (!input.home || !input.away) return 'Pick the two teams playing this set.';
    if (input.home === input.away) return 'A team can’t play itself — pick two different teams.';
    const cfg = readConfig(ctx.config);
    return validateSetScore(
      Number(input.points?.home) || 0,
      Number(input.points?.away) || 0,
      cfg.pointsPerSet,
      cfg.winBy2,
      cfg.hardCap,
    );
  },

  scoreRound: (input: VolleyballInput, ctx: RoundContext): Record<ID, number> => {
    const cfg = readConfig(ctx.config);
    const deltas: Record<ID, number> = {};
    for (const p of ctx.players) deltas[p.id] = 0;
    const winId = winningTeamId(input, cfg);
    if (!winId) return deltas;
    const team = input.teams.find((t) => t.id === winId);
    for (const m of team?.memberIds ?? []) {
      if (m in deltas) deltas[m] += 1;
    }
    return deltas;
  },

  // Open-ended: play as many sets as you like, finish when you're done.
  isFinished: () => false,

  describeRound: (round: Round): string => {
    const input = round.input as VolleyballInput;
    if (!input?.teams) return '🏐 —';
    const home = input.teams.find((t) => t.id === input.home);
    const away = input.teams.find((t) => t.id === input.away);
    const a = Number(input.points?.home) || 0;
    const b = Number(input.points?.away) || 0;
    const hn = home ? `${home.emoji} ${home.name}` : 'Home';
    const an = away ? `${away.emoji} ${away.name}` : 'Away';
    if (a === b) return `🏐 ${hn} ${a}–${b} ${an}`;
    const win = a > b ? home : away;
    const wn = win ? `${win.emoji} ${win.name}` : 'Winner';
    return `🏐 ${wn} won ${Math.max(a, b)}–${Math.min(a, b)}`;
  },

  help: [
    'Volleyball is an open, team-based session — no fixed match length.',
    '',
    'Build any number of teams from your player pool, give each a name, emoji and',
    'colour, and drop players onto whichever team you like. You can reshuffle',
    'rosters or rebrand teams freely — set to set, or game to game.',
    '',
    'Each round is one set between the two teams you pick. Rally scoring: a point',
    'on every serve, first to 25 (21 for beach), win by two — so a tight set runs',
    'on (25–23, 26–24, 30–28…) until a side leads by two. Optional hard cap ends',
    'the two-point chase at a ceiling you set (e.g. 27).',
    '',
    'A team’s standing is the sets it has won. Each player banks a set win when the',
    'team they’re on takes a set, so the board tracks who’s racking up sets. Finish',
    'the game whenever you’ve played enough.',
  ].join('\n'),

  stats: volleyballStats,

  RoundEditor,
  editorLoader: () => import('./VolleyballEditor.svelte'),
};
