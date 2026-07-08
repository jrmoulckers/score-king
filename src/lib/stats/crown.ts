import type { GameRecord, HeadToHead, ID, LeaderRow, MemberStats } from './types';
import type { Persona } from './personas';
import type { Badge, Rarity } from './badges';
import { dayKey } from './format';

export type CrownTone = 'flex' | 'roast' | 'neutral';

/** One candidate (and, after selection, the chosen) Daily Crown headline. */
export interface CrownLine {
  /** Candidate type — used for anti-repeat and daily selection. */
  key: string;
  emoji: string;
  text: string;
  tone: CrownTone;
  /** Crown Gold styling — reserved for genuine leader/winner lines. */
  gold: boolean;
  /** Notability (higher = more headline-worthy). */
  score: number;
}

export interface CrownInput {
  meId: ID;
  me?: MemberStats;
  persona?: Persona;
  /** Badges unlocked since the last visit (device-local diff). */
  newBadges?: Badge[];
  records?: GameRecord[];
  leaderboard?: LeaderRow[];
  /** Resolve a member id to a display name for rivalry lines. */
  nameOf?: (id: ID) => string;
  /** Include playful roast/rivalry lines. Default true. */
  roast?: boolean;
  now?: number;
  /** Yesterday's chosen key, so today avoids repeating it. */
  lastKey?: string;
}

const RARITY_SCORE: Record<Rarity, number> = {
  legendary: 1,
  epic: 0.9,
  rare: 0.75,
  uncommon: 0.6,
  common: 0.4,
};

const WIN_MILESTONES = [10, 25, 50, 100, 250, 500];

/** Unsigned djb2 string hash — small, deterministic, dependency-free. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function bestRival(h2h: Record<ID, HeadToHead>): HeadToHead | undefined {
  let best: HeadToHead | undefined;
  let bestEdge = 0;
  for (const r of Object.values(h2h)) {
    if (r.games < 3 || r.wins <= r.losses) continue;
    const edge = (r.wins - r.losses) / r.games;
    if (edge > bestEdge) {
      best = r;
      bestEdge = edge;
    }
  }
  return best;
}

function nemesis(h2h: Record<ID, HeadToHead>): HeadToHead | undefined {
  let worst: HeadToHead | undefined;
  let mostLosses = 0;
  for (const r of Object.values(h2h)) {
    if (r.games < 3 || r.losses <= r.wins) continue;
    if (r.losses > mostLosses) {
      worst = r;
      mostLosses = r.losses;
    }
  }
  return worst;
}

function nextMilestone(wins: number): { next: number; gap: number } | undefined {
  for (const n of WIN_MILESTONES) {
    if (wins < n) {
      const gap = n - wins;
      return gap <= 3 ? { next: n, gap } : undefined;
    }
  }
  return undefined;
}

/** Generate every applicable candidate line for the member (unranked). */
function candidates(input: CrownInput): CrownLine[] {
  const { me, meId, persona, records = [], leaderboard = [], newBadges = [] } = input;
  const name = input.nameOf ?? ((id: ID) => id);
  const roast = input.roast !== false;
  const out: CrownLine[] = [];
  const add = (key: string, emoji: string, text: string, tone: CrownTone, score: number, gold = false) =>
    out.push({ key, emoji, text, tone, gold, score });

  if (!me || me.played === 0) {
    add('welcome', '👑', 'A king is born — play your first game.', 'neutral', 0.3);
    return out;
  }

  if (me.currentStreak >= 3) {
    add('hot_streak', '🔥', `You're on a ${me.currentStreak}-game heater.`, 'flex', 1);
  }

  const top = leaderboard[0];
  if (top && top.playerId === meId && me.wins > 0) {
    add('reigning', '👑', `Reigning champ — ${me.wins} wins to your name.`, 'flex', 0.85, true);
  }

  for (const rec of records) {
    if (rec.holderId === meId) {
      add(`record_${rec.key}`, rec.emoji ?? '📈', `You hold the ${rec.label.toLowerCase()} — ${rec.value}.`, 'flex', 0.8);
    }
  }

  const rival = bestRival(me.headToHead);
  if (rival) {
    add('rival_own', '😤', `You own ${name(rival.opponentId)}, ${rival.wins}–${rival.losses}.`, 'flex', 0.8);
  }

  if (me.comebackWins >= 1) {
    add('comeback', '🪦', `Comeback royalty — ${me.comebackWins} won from behind.`, 'flex', me.comebackWins >= 3 ? 0.8 : 0.6);
  }

  for (const b of newBadges) {
    add(`badge_${b.key}`, b.emoji, `New badge: ${b.name}.`, 'flex', RARITY_SCORE[b.rarity]);
  }

  const near = nextMilestone(me.wins);
  if (near) {
    add('milestone', '🎯', `${near.gap} ${near.gap === 1 ? 'win' : 'wins'} from ${near.next}.`, 'neutral', 0.65);
  }

  if (persona && persona.key !== 'rookie' && persona.confidence >= 0.5) {
    add('persona', persona.emoji, `Certified ${persona.name}.`, 'neutral', 0.6);
  }

  if (roast) {
    const foe = nemesis(me.headToHead);
    if (foe) {
      add('nemesis', '💀', `${name(foe.opponentId)}'s got your number, ${foe.losses}–${foe.wins}.`, 'roast', 0.7);
    }
    if (me.wins === 0 && me.played >= 3) {
      add('winless', '🥶', 'Still hunting that first win.', 'roast', 0.7);
    } else if (me.played >= 5 && me.winRate < 0.2) {
      add('rough', '🥶', `Rough patch — ${me.wins} in ${me.played}.`, 'roast', 0.6);
    }
  }

  // Never empty: a couple of graceful low-data / everyday fallbacks.
  if (me.played < 3) {
    add('early', '🎲', `${me.played} games in — your legend begins.`, 'neutral', 0.35);
  }
  add('tally', '📊', `${me.played} games, ${me.wins} wins and counting.`, 'neutral', 0.25);

  return out;
}

/**
 * Pick the day's headline: rank candidates by notability with a deterministic
 * per-day jitter (so it's stable all day on a device but varies day to day),
 * and skip yesterday's pick. Fully on-device.
 */
export function dailyCrown(input: CrownInput): CrownLine {
  const pool = candidates(input);
  const day = dayKey(input.now ?? Date.now());
  const jitter = (key: string) => (hash(`${input.meId}|${day}|${key}`) % 1000) / 1000;

  const ranked = pool
    .map((c) => ({ c, s: c.score + jitter(c.key) * 0.2 }))
    .sort((a, b) => b.s - a.s);

  if (ranked.length === 0) {
    return { key: 'welcome', emoji: '👑', text: 'A king is born — play your first game.', tone: 'neutral', gold: false, score: 0 };
  }
  if (ranked.length > 1 && ranked[0].c.key === input.lastKey) return ranked[1].c;
  return ranked[0].c;
}

/**
 * Secondary notable lines for the "recent & nudges" strip — the top candidates
 * minus the everyday fallbacks and an optional already-shown hero line.
 */
export function nudges(input: CrownInput, excludeKey?: string, limit = 3): CrownLine[] {
  const skip = new Set(['tally', 'early', 'welcome']);
  return candidates(input)
    .filter((c) => c.key !== excludeKey && !skip.has(c.key))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
