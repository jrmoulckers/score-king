import { describe, expect, it } from 'vitest';
import type { Game, Player } from '../lib/types';
import { gameTime, dateBucket, haystack, nameResolver } from './history';

function game(partial: Partial<Game>): Game {
  return {
    id: 'g1',
    type: 'hearts',
    config: {},
    playerIds: [],
    status: 'finished',
    createdAt: 0,
    roundCount: 0,
    ...partial,
  };
}

function player(id: string, name: string): Player {
  return { id, name, color: '#7c5cff', createdAt: 0 };
}

describe('gameTime', () => {
  it('prefers finishedAt over createdAt', () => {
    expect(gameTime(game({ createdAt: 100, finishedAt: 500 }))).toBe(500);
  });
  it('falls back to createdAt when unfinished', () => {
    expect(gameTime(game({ createdAt: 100, finishedAt: undefined }))).toBe(100);
  });
});

describe('dateBucket', () => {
  // Anchor "now" to a fixed Wednesday 12:00 so buckets are deterministic.
  const now = new Date(2024, 5, 12, 12, 0, 0); // Wed Jun 12 2024
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

  it('buckets a same-day timestamp as today', () => {
    expect(dateBucket(at(2024, 5, 12, 1), now)).toBe('today');
  });
  it('buckets earlier this week (Monday) as week', () => {
    expect(dateBucket(at(2024, 5, 10), now)).toBe('week'); // Monday
  });
  it('buckets last Sunday (previous week) as month', () => {
    expect(dateBucket(at(2024, 5, 9), now)).toBe('month'); // Sunday before this week
  });
  it('buckets earlier this month as month', () => {
    expect(dateBucket(at(2024, 5, 2), now)).toBe('month');
  });
  it('buckets a prior month as earlier', () => {
    expect(dateBucket(at(2024, 4, 30), now)).toBe('earlier');
  });
});

describe('haystack', () => {
  const roster = new Map([
    [player('p1', 'Ada').id, player('p1', 'Ada')],
    [player('p2', 'Grace').id, player('p2', 'Grace')],
  ]);
  const nameFor = nameResolver(roster);
  const typeName = (t: string) => (t === 'hearts' ? 'Hearts' : t);

  it('includes game label, players and winners, lowercased', () => {
    const g = game({ type: 'hearts', playerIds: ['p1', 'p2'], winnerIds: ['p2'] });
    const h = haystack(g, typeName, nameFor);
    expect(h).toContain('hearts');
    expect(h).toContain('ada');
    expect(h).toContain('grace');
  });

  it('includes an optional custom label', () => {
    const g = game({ type: 'hearts', name: 'Rematch Night', playerIds: ['p1'] });
    expect(haystack(g, typeName, nameFor)).toContain('rematch night');
  });

  it('resolves missing player ids to ? without throwing', () => {
    const g = game({ type: 'tally', playerIds: ['ghost'] });
    expect(haystack(g, (t) => t, nameFor)).toContain('?');
  });
});
