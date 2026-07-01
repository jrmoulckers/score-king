import { describe, it, expect } from 'vitest';
import type { MemberStats } from './types';
import { dailyCrown, nudges } from './crown';

function mkStats(p: Partial<MemberStats> = {}): MemberStats {
  return {
    playerId: 'me',
    played: 10,
    finished: 10,
    wins: 3,
    podiums: 5,
    winRate: 0.3,
    currentStreak: 0,
    longestStreak: 2,
    points: 100,
    rounds: 40,
    byGameType: {},
    headToHead: {},
    comebackWins: 0,
    wireToWireWins: 0,
    closeGames: 0,
    closeWins: 0,
    gameNights: 4,
    ...p,
  };
}

const DAY = Date.UTC(2026, 5, 30, 18, 0, 0);

describe('dailyCrown', () => {
  it('welcomes a member with no games', () => {
    const line = dailyCrown({ meId: 'me', me: mkStats({ played: 0, wins: 0 }), now: DAY });
    expect(line.key).toBe('welcome');
  });

  it('leads with a live streak when one is running', () => {
    const line = dailyCrown({ meId: 'me', me: mkStats({ currentStreak: 5, wins: 7 }), now: DAY });
    expect(line.key).toBe('hot_streak');
    expect(line.text).toContain('5');
  });

  it('is stable across the day but avoids yesterday’s pick', () => {
    const me = mkStats({
      currentStreak: 4,
      wins: 6,
      comebackWins: 2,
      headToHead: { alex: { opponentId: 'alex', games: 6, wins: 5, losses: 1, ties: 0 } },
    });
    const today = dailyCrown({ meId: 'me', me, now: DAY });
    // Same inputs, later the same day → identical pick (deterministic seed).
    expect(dailyCrown({ meId: 'me', me, now: DAY + 3_600_000 }).key).toBe(today.key);
    // Feeding yesterday's pick forces a different headline.
    expect(dailyCrown({ meId: 'me', me, now: DAY, lastKey: today.key }).key).not.toBe(today.key);
  });

  it('marks a reigning leader line as gold', () => {
    const line = dailyCrown({
      meId: 'me',
      me: mkStats({ wins: 9, currentStreak: 0 }),
      leaderboard: [{ playerId: 'me', played: 10, wins: 9, winRate: 0.9, currentStreak: 0 }],
      now: DAY,
    });
    expect(line.key).toBe('reigning');
    expect(line.gold).toBe(true);
  });

  it('resolves opponent names for rivalry lines', () => {
    const line = dailyCrown({
      meId: 'me',
      me: mkStats({ currentStreak: 0, wins: 4, headToHead: { p2: { opponentId: 'p2', games: 5, wins: 4, losses: 1, ties: 0 } } }),
      nameOf: (id) => (id === 'p2' ? 'Sam' : id),
      lastKey: 'rival_own',
      now: DAY,
    });
    // The rival line, when it surfaces, uses the display name not the id.
    const rival = nudges({ meId: 'me', me: mkStats({ wins: 4, headToHead: { p2: { opponentId: 'p2', games: 5, wins: 4, losses: 1, ties: 0 } } }), nameOf: (id) => (id === 'p2' ? 'Sam' : id) }).find((n) => n.key === 'rival_own');
    expect(rival?.text).toContain('Sam');
    expect(line).toBeTruthy();
  });
});

describe('roast mode', () => {
  const me = mkStats({ played: 6, wins: 0, winRate: 0, headToHead: { foe: { opponentId: 'foe', games: 4, wins: 1, losses: 3, ties: 0 } } });

  it('includes roast lines by default', () => {
    const tones = nudges({ meId: 'me', me }).map((n) => n.tone);
    expect(tones).toContain('roast');
  });

  it('suppresses roast lines when roast is off', () => {
    const tones = nudges({ meId: 'me', me, roast: false }).map((n) => n.tone);
    expect(tones).not.toContain('roast');
  });
});

describe('nudges', () => {
  it('omits everyday fallbacks and the excluded hero key', () => {
    const list = nudges({ meId: 'me', me: mkStats({ currentStreak: 4, comebackWins: 2 }) }, 'hot_streak');
    const ks = list.map((n) => n.key);
    expect(ks).not.toContain('hot_streak');
    expect(ks).not.toContain('tally');
    expect(ks).not.toContain('welcome');
  });
});
