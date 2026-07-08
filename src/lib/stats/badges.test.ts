import { describe, it, expect } from 'vitest';
import type { GameRecord, MemberStats } from './types';
import { computeBadges, newlyEarned } from './badges';

function mkStats(p: Partial<MemberStats> = {}): MemberStats {
  return {
    playerId: 'me',
    played: 5,
    finished: 5,
    wins: 0,
    podiums: 1,
    winRate: 0,
    currentStreak: 0,
    longestStreak: 0,
    points: 50,
    rounds: 20,
    byGameType: {},
    headToHead: {},
    comebackWins: 0,
    wireToWireWins: 0,
    closeGames: 0,
    closeWins: 0,
    gameNights: 2,
    ...p,
  };
}

const keys = (b: { key: string }[]) => b.map((x) => x.key);

describe('computeBadges', () => {
  it('awards nothing headline-worthy to a winless newcomer', () => {
    expect(keys(computeBadges(mkStats()))).not.toContain('first_win');
  });

  it('unlocks First Win and the right milestone tiers', () => {
    expect(keys(computeBadges(mkStats({ wins: 1 })))).toContain('first_win');

    const contender = computeBadges(mkStats({ wins: 10 })).find((b) => b.key === 'wins_tier');
    expect(contender).toMatchObject({ name: 'Contender', rarity: 'uncommon' });

    const centurion = computeBadges(mkStats({ wins: 120 })).find((b) => b.key === 'wins_tier');
    expect(centurion).toMatchObject({ name: 'Centurion', rarity: 'epic' });
  });

  it('tiers played count and streaks', () => {
    expect(computeBadges(mkStats({ played: 25 })).find((b) => b.key === 'played_tier')?.name).toBe('Regular');
    expect(computeBadges(mkStats({ longestStreak: 3 })).find((b) => b.key === 'streak_tier')?.name).toBe('Hat-trick');
    expect(computeBadges(mkStats({ longestStreak: 8 })).find((b) => b.key === 'streak_tier')?.rarity).toBe('epic');
  });

  it('awards drama badges from comeback / wire-to-wire wins', () => {
    const b = computeBadges(mkStats({ comebackWins: 1, wireToWireWins: 1 }));
    expect(keys(b)).toEqual(expect.arrayContaining(['comeback', 'wire']));
  });

  it('awards a record badge only to the record holder', () => {
    const records: GameRecord[] = [
      { key: 'blowout', label: 'Biggest blowout', value: '80', holderId: 'me' },
      { key: 'longest', label: 'Longest game', value: '12', holderId: 'someone-else' },
    ];
    const b = computeBadges(mkStats({ wins: 1 }), { records });
    expect(keys(b)).toContain('record_blowout');
    expect(keys(b)).not.toContain('record_longest');
  });

  it('sorts rarest first', () => {
    const b = computeBadges(mkStats({ wins: 120, played: 25, longestStreak: 8 }));
    const rank = { legendary: 4, epic: 3, rare: 2, uncommon: 1, common: 0 } as const;
    for (let i = 1; i < b.length; i++) {
      expect(rank[b[i - 1].rarity]).toBeGreaterThanOrEqual(rank[b[i].rarity]);
    }
  });
});

describe('newlyEarned', () => {
  it('returns only badges absent from the seen set', () => {
    const current = computeBadges(mkStats({ wins: 1, comebackWins: 1 }));
    const seen = new Set(['first_win']);
    expect(keys(newlyEarned(current, seen))).toEqual(['comeback']);
  });
});
