import type { ID } from '../types';
import type { MemberStats, StatsResult } from './types';
import type { StatsDelta } from './compare';
import type { Persona } from './personas';
import type { Badge } from './badges';
import { fmtInt, fmtPct, fmtSigned } from './format';

/**
 * Wrapped: the same engine + a date range, shaped into an ordered, swipeable
 * card story. Pure — takes a personal-lensed {@link StatsResult} and returns
 * ready-to-render cards. The page owns range math, theming and motion.
 */

export type WrappedKind =
  | 'cover'
  | 'numbers'
  | 'game'
  | 'record'
  | 'streak'
  | 'moment'
  | 'persona'
  | 'rivalry'
  | 'badges'
  | 'crown'
  | 'title'
  | 'toast'
  | 'lowdata';

export interface WrappedStat {
  label: string;
  value: string;
}

export interface WrappedCard {
  key: string;
  kind: WrappedKind;
  emoji: string;
  headline: string;
  lines?: string[];
  stats?: WrappedStat[];
  /** Crown Gold treatment — reserved for the crowned / title moments. */
  gold?: boolean;
}

export interface WrappedInput {
  meId: ID;
  me: MemberStats;
  /** Personal-lensed result for the window (records, totals, per-game highlights). */
  result: StatsResult;
  persona?: Persona;
  newBadges?: Badge[];
  earnedBadges?: Badge[];
  /** compareStats(current, prior, meId) — powers "vs last time" deltas. */
  prior?: StatsDelta;
  /** Human label for the window: "2026", "the last 12 months", "tonight". */
  label: string;
  nameOf: (id: ID) => string;
  gameName: (type: string) => string;
  gameEmoji: (type: string) => string;
  roast?: boolean;
}

const RARITY_RANK: Record<string, number> = { legendary: 4, epic: 3, rare: 2, common: 1 };

function favoriteGame(me: MemberStats): { type: string; played: number; wins: number } | undefined {
  let best: { type: string; played: number; wins: number } | undefined;
  for (const [type, bt] of Object.entries(me.byGameType)) {
    if (!best || bt.played > best.played) best = { type, played: bt.played, wins: bt.wins };
  }
  return best;
}

function favoriteRival(me: MemberStats): { id: ID; games: number; wins: number; losses: number } | undefined {
  let best: { id: ID; games: number; wins: number; losses: number } | undefined;
  for (const h of Object.values(me.headToHead)) {
    if (!best || h.games > best.games) best = { id: h.opponentId, games: h.games, wins: h.wins, losses: h.losses };
  }
  return best;
}

function nemesis(me: MemberStats, minGames = 3): { id: ID; wins: number; losses: number } | undefined {
  let worst: { id: ID; wins: number; losses: number; diff: number } | undefined;
  for (const h of Object.values(me.headToHead)) {
    if (h.games < minGames) continue;
    const diff = h.wins - h.losses;
    if (h.losses > h.wins && (!worst || diff < worst.diff)) {
      worst = { id: h.opponentId, wins: h.wins, losses: h.losses, diff };
    }
  }
  return worst;
}

function priorDelta(prior: StatsDelta | undefined, key: string): number | undefined {
  return prior?.metrics.find((m) => m.key === key)?.delta;
}

function coverCard(input: WrappedInput): WrappedCard {
  const { me, label } = input;
  return {
    key: 'cover',
    kind: 'cover',
    emoji: '👑',
    headline: `Your ${label}`,
    lines: [`${fmtInt(me.finished)} games · ${fmtInt(me.gameNights)} nights — let’s relive it.`],
  };
}

function numbersCard(input: WrappedInput): WrappedCard {
  const { me } = input;
  const opponents = Object.keys(me.headToHead).length;
  return {
    key: 'numbers',
    kind: 'numbers',
    emoji: '🧮',
    headline: 'By the numbers',
    stats: [
      { label: 'Games', value: fmtInt(me.finished) },
      { label: 'Rounds', value: fmtInt(me.rounds) },
      { label: 'Nights', value: fmtInt(me.gameNights) },
      { label: 'Points', value: fmtInt(me.points) },
      { label: 'Rivals', value: fmtInt(opponents) },
    ],
  };
}

function gameCard(input: WrappedInput): WrappedCard | undefined {
  const fav = favoriteGame(input.me);
  if (!fav) return undefined;
  const losses = fav.played - fav.wins;
  return {
    key: 'game',
    kind: 'game',
    emoji: input.gameEmoji(fav.type),
    headline: `Your game: ${input.gameName(fav.type)}`,
    lines: [`${fmtInt(fav.played)} games · ${fav.wins}–${losses} record`],
  };
}

function recordCard(input: WrappedInput): WrappedCard {
  const { me, prior } = input;
  const losses = me.finished - me.wins;
  const lines = [`${fmtPct(me.winRate)} win rate`];
  const dWins = priorDelta(prior, 'wins');
  if (dWins !== undefined && dWins !== 0) {
    lines.push(`${fmtSigned(dWins)} wins ${dWins > 0 ? '▲' : '▼'} vs last time`);
  }
  return {
    key: 'record',
    kind: 'record',
    emoji: '📊',
    headline: `${me.wins}–${losses}`,
    lines,
  };
}

function streakCard(input: WrappedInput): WrappedCard | undefined {
  if (input.me.longestStreak < 2) return undefined;
  return {
    key: 'streak',
    kind: 'streak',
    emoji: '🔥',
    headline: `${input.me.longestStreak}-game win streak`,
    lines: ['Your hottest run of the stretch.'],
  };
}

function momentCard(input: WrappedInput): WrappedCard | undefined {
  const { me } = input;
  if (me.comebackWins > 0) {
    return {
      key: 'moment',
      kind: 'moment',
      emoji: '🪦',
      headline: 'Signature moment',
      lines: [`${fmtInt(me.comebackWins)} comeback ${me.comebackWins === 1 ? 'win' : 'wins'} from behind.`],
    };
  }
  if (me.wireToWireWins > 0) {
    return {
      key: 'moment',
      kind: 'moment',
      emoji: '🐎',
      headline: 'Wire to wire',
      lines: [`${fmtInt(me.wireToWireWins)} ${me.wireToWireWins === 1 ? 'game' : 'games'} led start to finish.`],
    };
  }
  if (me.closeWins > 0) {
    return {
      key: 'moment',
      kind: 'moment',
      emoji: '⏱️',
      headline: 'Ice in the veins',
      lines: [`${fmtInt(me.closeWins)} nail-biter ${me.closeWins === 1 ? 'win' : 'wins'}.`],
    };
  }
  return undefined;
}

function personaCard(input: WrappedInput): WrappedCard | undefined {
  if (!input.persona) return undefined;
  return {
    key: 'persona',
    kind: 'persona',
    emoji: input.persona.emoji,
    headline: input.persona.name,
    lines: [input.persona.voice],
  };
}

function rivalryCard(input: WrappedInput): WrappedCard | undefined {
  const { me, nameOf, roast } = input;
  const fav = favoriteRival(me);
  if (!fav) return undefined;
  const lines = [`Most-played rival — ${fav.wins}–${fav.losses} against ${nameOf(fav.id)}.`];
  const nem = nemesis(me);
  if (nem && roast && nem.id !== fav.id) {
    lines.push(`😤 ${nameOf(nem.id)} has your number (${nem.losses}–${nem.wins}).`);
  }
  return {
    key: 'rivalry',
    kind: 'rivalry',
    emoji: '⚔️',
    headline: 'Rivalries',
    lines,
  };
}

function badgesCard(input: WrappedInput): WrappedCard | undefined {
  const badges = input.earnedBadges ?? [];
  if (badges.length === 0) return undefined;
  const rarest = [...badges].sort((a, b) => (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0))[0];
  const fresh = input.newBadges?.length ?? 0;
  const lines = [`${fmtInt(badges.length)} earned${fresh ? ` · ${fmtInt(fresh)} new` : ''}.`];
  if (rarest) lines.push(`Rarest: ${rarest.emoji} ${rarest.name}.`);
  return {
    key: 'badges',
    kind: 'badges',
    emoji: '🏅',
    headline: 'Badge cabinet',
    lines,
  };
}

function crownCard(input: WrappedInput): WrappedCard | undefined {
  if (input.me.wins < 1) return undefined;
  return {
    key: 'crown',
    kind: 'crown',
    emoji: '👑',
    headline: `Crowned ${fmtInt(input.me.wins)}×`,
    lines: [`${fmtPct(input.me.winRate)} of your games ended in a win.`],
    gold: true,
  };
}

function titleCard(input: WrappedInput): WrappedCard {
  const { persona, label } = input;
  return {
    key: 'title',
    kind: 'title',
    emoji: '🏆',
    headline: persona ? persona.name : 'Contender',
    lines: [`Your title for ${label}.`],
    gold: true,
  };
}

function toastCard(input: WrappedInput): WrappedCard {
  const t = input.result.totals;
  return {
    key: 'toast',
    kind: 'toast',
    emoji: '🥂',
    headline: 'Group toast',
    lines: [`The crew logged ${fmtInt(t.finishedGames)} games across ${fmtInt(t.gameNights)} nights.`],
  };
}

function mvpCard(input: WrappedInput): WrappedCard | undefined {
  const top = input.result.leaderboard[0];
  if (!top || top.wins < 1) return undefined;
  const you = top.playerId === input.meId;
  return {
    key: 'mvp',
    kind: 'crown',
    emoji: '👑',
    headline: you ? 'Tonight’s MVP: you' : `Tonight’s MVP: ${input.nameOf(top.playerId)}`,
    lines: [`${top.wins} ${top.wins === 1 ? 'win' : 'wins'} · ${fmtPct(top.winRate)}.`],
    gold: true,
  };
}

function lowDataCards(input: WrappedInput): WrappedCard[] {
  const n = input.me.finished;
  if (n === 0) {
    return [
      {
        key: 'lowdata',
        kind: 'lowdata',
        emoji: '🎲',
        headline: 'Your legend begins',
        lines: [`No finished games ${input.label === 'tonight' ? 'tonight' : `in ${input.label}`} yet — play one and come back.`],
      },
    ];
  }
  // 1–2 games: a tiny, honest arc rather than a padded one.
  return [coverCard(input), numbersCard(input), recordCard(input), toastCard(input)];
}

/** The full year-in-review arc (or a graceful short arc when data is thin). */
export function buildWrapped(input: WrappedInput): WrappedCard[] {
  if (input.me.finished < 3) return lowDataCards(input);
  const cards: (WrappedCard | undefined)[] = [
    coverCard(input),
    numbersCard(input),
    gameCard(input),
    recordCard(input),
    streakCard(input),
    momentCard(input),
    personaCard(input),
    rivalryCard(input),
    badgesCard(input),
    crownCard(input),
    titleCard(input),
    toastCard(input),
  ];
  return cards.filter((c): c is WrappedCard => c !== undefined);
}

/** The tonight-only Game Night Recap — a short, punchy mini-Wrapped. */
export function buildRecap(input: WrappedInput): WrappedCard[] {
  if (input.me.finished === 0) return lowDataCards(input);
  const cards: (WrappedCard | undefined)[] = [
    { ...coverCard(input), emoji: '🌙', headline: 'Tonight at the table' },
    mvpCard(input),
    recordCard(input),
    momentCard(input),
    input.roast ? rivalryCard(input) : undefined,
    toastCard(input),
  ];
  return cards.filter((c): c is WrappedCard => c !== undefined);
}
