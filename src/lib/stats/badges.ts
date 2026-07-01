import type { GameRecord, ID, MemberStats } from './types';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Badge {
  key: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  desc: string;
}

const RARITY_ORDER: Record<Rarity, number> = {
  legendary: 4,
  epic: 3,
  rare: 2,
  uncommon: 1,
  common: 0,
};

/** Highest tier whose threshold is met, or undefined. */
function tier<T>(value: number, tiers: ReadonlyArray<readonly [number, T]>): T | undefined {
  for (const [n, out] of tiers) if (value >= n) return out;
  return undefined;
}

export interface BadgeInput {
  /** Records the engine surfaced, used to award "record holder" badges. */
  records?: GameRecord[];
}

/**
 * Earned badges for a member, derived on read from their stats (and any records
 * they currently hold). Pure — the "newly unlocked" diff against a device-local
 * last-seen set is the caller's concern, not this catalog's.
 */
export function computeBadges(m: MemberStats, input: BadgeInput = {}): Badge[] {
  const out: Badge[] = [];
  const add = (key: string, name: string, emoji: string, rarity: Rarity, desc: string) =>
    out.push({ key, name, emoji, rarity, desc });

  // ── Milestones ────────────────────────────────────────────────────────────
  if (m.wins >= 1) add('first_win', 'First Win', '🥇', 'common', 'Won your first game.');

  const win = tier<[string, Rarity]>(m.wins, [
    [500, ['Legend', 'legendary']],
    [100, ['Centurion', 'epic']],
    [50, ['Champion', 'rare']],
    [10, ['Contender', 'uncommon']],
  ]);
  if (win) add('wins_tier', win[0], '💯', win[1], `Won ${m.wins} games.`);

  const played = tier<[string, Rarity]>(m.played, [
    [500, ['Grandmaster', 'epic']],
    [100, ['Veteran', 'rare']],
    [25, ['Regular', 'uncommon']],
  ]);
  if (played) add('played_tier', played[0], '🎖️', played[1], `Played ${m.played} games.`);

  const nights = tier<[string, Rarity]>(m.gameNights, [
    [50, ['Fixture', 'rare']],
    [10, ['Anchor', 'uncommon']],
  ]);
  if (nights) add('nights_tier', nights[0], '🪑', nights[1], `Showed up for ${m.gameNights} game nights.`);

  // ── Streaks ───────────────────────────────────────────────────────────────
  const streak = tier<[string, Rarity]>(m.longestStreak, [
    [8, ['Unstoppable', 'epic']],
    [5, ['On Fire', 'rare']],
    [3, ['Hat-trick', 'uncommon']],
  ]);
  if (streak) add('streak_tier', streak[0], '🔥', streak[1], `${m.longestStreak}-win streak.`);

  // ── Drama ─────────────────────────────────────────────────────────────────
  if (m.comebackWins >= 1) add('comeback', 'Comeback Kid', '🪦', 'rare', 'Won a game after trailing.');
  if (m.wireToWireWins >= 1) add('wire', 'Wire-to-Wire', '🏁', 'uncommon', 'Led a win from start to finish.');

  // ── Records held right now ────────────────────────────────────────────────
  const RECORD_BADGE: Record<string, { name: string; emoji: string }> = {
    blowout: { name: 'Blowout', emoji: '💥' },
    closest: { name: 'Photo Finish', emoji: '📸' },
    topRound: { name: 'Big Bang', emoji: '🚀' },
    highTotal: { name: 'High Score', emoji: '📈' },
    longest: { name: 'Marathoner', emoji: '🏃' },
  };
  const mine: ID = m.playerId;
  for (const rec of input.records ?? []) {
    if (rec.holderId !== mine) continue;
    const meta = RECORD_BADGE[rec.key];
    if (meta) add(`record_${rec.key}`, meta.name, meta.emoji, 'rare', `Holds the ${rec.label.toLowerCase()} record.`);
  }

  return out.sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]);
}

/** Badges present now but absent from a device-local last-seen key set. */
export function newlyEarned(current: Badge[], seenKeys: ReadonlySet<string>): Badge[] {
  return current.filter((b) => !seenKeys.has(b.key));
}
