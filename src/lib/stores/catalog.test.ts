import { describe, expect, it } from 'vitest';
import type { Game, GameStatus } from '../types';
import {
  foldSearch,
  matchModule,
  recentlyFinished,
  recentTypeIds,
  sectionize,
  type CatalogType,
} from './catalog';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TYPES: CatalogType[] = [
  { id: 'hearts', name: 'Hearts', emoji: '♥️', tagline: 'Avoid the Queen', keywords: ['trick'] },
  { id: 'skullking', name: 'Skull King', emoji: '🏴‍☠️', tagline: 'Bid your tricks' },
  { id: 'tally', name: 'Tally', emoji: '🎲', tagline: 'Generic counter' },
  { id: 'uno', name: 'Úno', emoji: '🔴', tagline: 'First to zero' },
];

function game(over: Partial<Game>): Game {
  return {
    id: over.id ?? 'g',
    type: over.type ?? 'tally',
    config: {},
    playerIds: [],
    status: (over.status ?? 'finished') as GameStatus,
    createdAt: over.createdAt ?? 0,
    roundCount: 0,
    ...over,
  };
}

describe('foldSearch', () => {
  it('lower-cases and strips diacritics', () => {
    expect(foldSearch('  Úno ')).toBe('uno');
    expect(foldSearch('Crème')).toBe('creme');
  });
});

describe('matchModule', () => {
  it('matches on name, tagline, and keyword aliases', () => {
    const hearts = TYPES[0];
    expect(matchModule(hearts, 'hea')).toBe(true);
    expect(matchModule(hearts, 'queen')).toBe(true); // tagline
    expect(matchModule(hearts, 'trick')).toBe(true); // keyword
    expect(matchModule(hearts, 'spades')).toBe(false);
  });

  it('is diacritic-insensitive both ways', () => {
    const uno = TYPES[3]; // name "Úno"
    expect(matchModule(uno, 'uno')).toBe(true);
    expect(matchModule(uno, 'úno')).toBe(true);
  });

  it('an empty query matches everything', () => {
    expect(matchModule(TYPES[0], '   ')).toBe(true);
  });
});

describe('recentlyFinished', () => {
  it('orders by finishedAt (newest first), not by createdAt/store order', () => {
    const games: Game[] = [
      game({ id: 'quick', type: 'tally', createdAt: 100, finishedAt: 150 }),
      // Created earliest but finished latest — must rank first.
      game({ id: 'marathon', type: 'hearts', createdAt: 10, finishedAt: 900 }),
      game({ id: 'mid', type: 'uno', createdAt: 50, finishedAt: 500 }),
    ];
    expect(recentlyFinished(games).map((g) => g.id)).toEqual(['marathon', 'mid', 'quick']);
  });

  it('excludes active, abandoned, and archived games', () => {
    const games: Game[] = [
      game({ id: 'a', status: 'active', createdAt: 1 }),
      game({ id: 'b', status: 'abandoned', createdAt: 2, finishedAt: 2 }),
      game({ id: 'c', status: 'finished', createdAt: 3, finishedAt: 3, archived: true }),
      game({ id: 'd', status: 'finished', createdAt: 4, finishedAt: 4 }),
    ];
    expect(recentlyFinished(games).map((g) => g.id)).toEqual(['d']);
  });

  it('honours the limit', () => {
    const games = [1, 2, 3, 4, 5].map((n) =>
      game({ id: `g${n}`, status: 'finished', createdAt: n, finishedAt: n }),
    );
    expect(recentlyFinished(games, 2).map((g) => g.id)).toEqual(['g5', 'g4']);
  });
});

describe('recentTypeIds', () => {
  it('returns distinct types most-recently-played first', () => {
    const games: Game[] = [
      game({ id: '1', type: 'tally', createdAt: 10, finishedAt: 10 }),
      game({ id: '2', type: 'hearts', createdAt: 20, finishedAt: 30 }),
      game({ id: '3', type: 'tally', createdAt: 40, finishedAt: 40 }), // tally now most recent
    ];
    expect(recentTypeIds(games)).toEqual(['tally', 'hearts']);
  });
});

describe('sectionize', () => {
  it('splits into mutually-exclusive favorites → recent → remainder', () => {
    const games: Game[] = [game({ id: '1', type: 'skullking', createdAt: 5, finishedAt: 5 })];
    const s = sectionize(TYPES, games, ['hearts'], []);
    expect(s.favorites.map((t) => t.id)).toEqual(['hearts']);
    expect(s.recent.map((t) => t.id)).toEqual(['skullking']);
    // A tile never repeats across sections.
    expect(s.remainder.map((t) => t.id)).toEqual(['tally', 'uno']);
  });

  it('excludes hidden types from every section', () => {
    const s = sectionize(TYPES, [], ['hearts'], ['hearts', 'tally']);
    expect(s.favorites).toEqual([]); // hearts is hidden even though favorited
    expect(s.remainder.map((t) => t.id)).toEqual(['skullking', 'uno']);
  });
});
