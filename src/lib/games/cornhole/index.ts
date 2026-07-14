import type { GameModule, ID, Player, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { cornholeStats } from './stats';
import {
  BAGS_PER_SIDE,
  cancel,
  cloneTeams,
  type CornholeInput,
  type CornholeTeam,
  defaultTeams,
  emptyThrow,
  isWon,
  MAX_PER_SIDE,
  normalizeInput,
  readConfig,
  scoreCornhole,
  sideRaw,
} from './logic';

/** Recorded rounds in play order that carry a team lineup. */
function teamedRounds(ctx: RoundContext): CornholeInput[] {
  return [...ctx.rounds]
    .sort((a, b) => a.index - b.index)
    .map((r) => r.input as CornholeInput)
    .filter((i): i is CornholeInput => !!i && Array.isArray(i.teams) && i.teams.length >= 2);
}

/** The two sides for the next round: carry the last round's teams forward, else seed fresh. */
function carryTeams(ctx: RoundContext): CornholeTeam[] {
  const rounds = teamedRounds(ctx);
  const last = rounds[rounds.length - 1];
  if (last?.teams?.length) return cloneTeams(last.teams);
  return defaultTeams(ctx.players.map((p) => p.id));
}

export const cornhole: GameModule = {
  id: 'cornhole',
  name: 'Cornhole',
  tagline: 'Toss the bags. Cancel & climb to 21.',
  emoji: '🌽',
  keywords: ['bags', 'bag toss', 'corn toss', 'baggo', 'cornhole', 'tailgate', 'backyard', '2v2', 'doubles', 'teams'],
  // Two sides, each a team of one or two players — a solo duel (1v1) or partners (2v2).
  // Build the sides from the player pool; the board shows two scores racing to 21.
  minPlayers: 2,
  maxPlayers: 4,
  teams: true,
  configFields: [
    { key: 'target', label: 'Play to', type: 'number', default: 21, min: 11, max: 51, help: 'First side to reach this wins. Backyard standard is 21.' },
    { key: 'bust', label: 'Bust — overshoot and you drop to 15', type: 'boolean', default: false, help: 'Blow past the target and your side tumbles back to 15. Land it exactly to win.' },
    { key: 'winBy', label: 'Win by', type: 'number', default: 1, min: 1, max: 5, help: 'Margin needed to close it out. 1 = first side to the target takes it.' },
  ],

  createRoundInput: (ctx: RoundContext): CornholeInput => {
    const teams = carryTeams(ctx);
    const throws = Object.fromEntries(teams.map((t) => [t.id, emptyThrow()]));
    return { teams, throws };
  },

  validateRound: (input: CornholeInput, ctx: RoundContext): string | null => {
    const { teams, throws } = normalizeInput(input, ctx.players);
    if (teams.length !== 2) return 'Cornhole is played by exactly two sides.';

    const assigned = teams.flatMap((t) => t.memberIds);
    if (new Set(assigned).size !== assigned.length) return 'A player can only be on one side.';

    const byId = new Map(ctx.players.map((p) => [p.id, p]));
    for (const [i, t] of teams.entries()) {
      const label = t.name || `Side ${i === 0 ? 'A' : 'B'}`;
      if (t.memberIds.length === 0) return `${label} needs at least one player.`;
      if (t.memberIds.length > MAX_PER_SIDE) return `${label}: up to ${MAX_PER_SIDE} players a side (got ${t.memberIds.length}).`;

      const bag = throws[t.id];
      const inHole = Math.trunc(Number(bag?.inHole) || 0);
      const onBoard = Math.trunc(Number(bag?.onBoard) || 0);
      if (inHole < 0 || onBoard < 0) return `${label}: bag counts can't be negative.`;
      if (inHole + onBoard > BAGS_PER_SIDE) {
        return `${label}: only ${BAGS_PER_SIDE} bags per round (got ${inHole + onBoard}).`;
      }
    }

    // Every selected player must be on a side (nobody benched — everyone tosses).
    for (const p of ctx.players) {
      if (!assigned.includes(p.id)) return `${byId.get(p.id)?.name ?? 'A player'} isn't on a side yet.`;
    }
    return null;
  },

  scoreRound: (input: CornholeInput, ctx: RoundContext): Record<ID, number> => {
    const { teams, throws } = normalizeInput(input, ctx.players);
    return scoreCornhole(teams, throws, ctx.totals, readConfig(ctx.config)).deltas;
  },

  isFinished: (totals, { config }) => isWon(totals, readConfig(config)),

  describeRound: (round: Round, players: Player[]): string => {
    const input = round.input as CornholeInput;
    const { teams, throws } = normalizeInput(input, players);
    const [a, b] = teams;
    if (!a || !b) return '🌽 —';
    const aRaw = sideRaw(throws[a.id]);
    const bRaw = sideRaw(throws[b.id]);
    const { gainer, net } = cancel(aRaw, bRaw);
    const label = (t: CornholeTeam): string => `${t.emoji} ${t.name}`;
    if (!gainer) return `🌽 Wash · ${aRaw}–${bRaw}`;
    const win = gainer === 'a' ? a : b;
    return `🌽 ${label(win)} +${net} · ${aRaw}–${bRaw}`;
  },

  help: [
    'Cornhole — cancellation scoring, two sides, first to 21.',
    '',
    'Build your two sides from the player pool: a solo duel (1v1) or partners (2v2).',
    'Give each side a name, emoji and colour, then drag players onto Side A or Side B.',
    '',
    'Each round both sides toss their 4 bags:',
    '• In the hole (a "drano") = 3 points',
    '• On the board (a "woody") = 1 point',
    '• On the ground = nothing',
    '',
    'The two sides then CANCEL: only the higher side scores, and only the',
    'difference. Side A gets 7, Side B gets 4 → A scores +3, B scores 0. A tie',
    'is a "wash" — nobody scores. In doubles the whole side banks the net together.',
    '',
    'First side to the target (21 by default) wins. Land it exactly for the',
    'cleanest finish.',
    '',
    'Bust variant (optional): overshoot the target and your side drops back to',
    '15 — so a four-bagger at the wrong moment can undo you.',
  ].join('\n'),

  stats: cornholeStats,

  RoundEditor,
  editorLoader: () => import('./CornholeEditor.svelte'),
};
