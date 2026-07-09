import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import type { Game } from '../types';
import { settings } from './settings';
import {
  foldSearch,
  matchModule,
  recentlyFinished,
  sectionize,
  recentTypeIds,
  toggleFavorite,
  setHidden,
  isFavorite,
  isHidden,
  type CatalogType,
} from './catalog';

/** Minimal Game factory — only the fields the catalog helpers read. */
function game(partial: Partial<Game> & Pick<Game, 'id' | 'type'>): Game {
  return {
    config: {},
    playerIds: [],
    status: 'finished',
    createdAt: 0,
    roundCount: 0,
    ...partial,
  } as Game;
}

const HEARTS: CatalogType = { id: 'hearts', name: 'Hearts', emoji: '♥️', tagline: 'Avoid the points' };
const SKULL: CatalogType = { id: 'skullking', name: 'Skull King', emoji: '🏴‍☠️', tagline: 'Bid your tricks' };
const CODENAMES: CatalogType = { id: 'codenames', name: 'Codenames', emoji: '🕵️', tagline: 'Word clues' };

describe('foldSearch', () => {
  it('lower-cases and strips diacritics', () => {
    expect(foldSearch('  ÚNO ')).toBe('uno');
    expect(foldSearch('Crème')).toBe('creme');
  });
});

describe('matchModule', () => {
  it('matches name, tagline, and keyword aliases case-insensitively', () => {
    expect(matchModule(HEARTS, 'heart')).toBe(true);
    expect(matchModule(HEARTS, 'AVOID')).toBe(true);
    expect(matchModule({ ...HEARTS, keywords: ['black lady'] }, 'lady')).toBe(true);
    expect(matchModule(HEARTS, 'poker')).toBe(false);
  });

  it('matches by category label so searching a kind surfaces the whole family', () => {
    // hearts + skullking are "Card Games"; codenames is "Party & Social".
    expect(matchModule(HEARTS, 'card')).toBe(true);
    expect(matchModule(SKULL, 'cards')).toBe(true);
    expect(matchModule(CODENAMES, 'party')).toBe(true);
    expect(matchModule(CODENAMES, 'card')).toBe(false);
  });

  it('is diacritic-insensitive both ways', () => {
    expect(matchModule({ ...HEARTS, name: 'Piñata' }, 'pinata')).toBe(true);
  });

  it('empty query matches everything', () => {
    expect(matchModule(HEARTS, '   ')).toBe(true);
  });
});

describe('recentlyFinished', () => {
  it('orders by finishedAt (newest first), not store order', () => {
    const games = [
      game({ id: 'a', type: 'hearts', createdAt: 100, finishedAt: 200 }),
      game({ id: 'b', type: 'skullking', createdAt: 10, finishedAt: 900 }),
      game({ id: 'c', type: 'codenames', createdAt: 50, finishedAt: 500 }),
    ];
    expect(recentlyFinished(games).map((g) => g.id)).toEqual(['b', 'c', 'a']);
  });

  it('excludes unfinished and archived games', () => {
    const games = [
      game({ id: 'a', type: 'hearts', status: 'active', finishedAt: undefined }),
      game({ id: 'b', type: 'hearts', status: 'abandoned', finishedAt: 800 }),
      game({ id: 'c', type: 'hearts', finishedAt: 700, archived: true }),
      game({ id: 'd', type: 'hearts', finishedAt: 600 }),
    ];
    expect(recentlyFinished(games).map((g) => g.id)).toEqual(['d']);
  });

  it('honours the limit', () => {
    const games = Array.from({ length: 6 }, (_, i) =>
      game({ id: `g${i}`, type: 'hearts', finishedAt: i }),
    );
    expect(recentlyFinished(games, 2)).toHaveLength(2);
  });

  it('falls back to createdAt when finishedAt is missing', () => {
    const games = [
      game({ id: 'a', type: 'hearts', createdAt: 300, finishedAt: undefined }),
      game({ id: 'b', type: 'hearts', createdAt: 100, finishedAt: 200 }),
    ];
    // 'a' has no finishedAt → uses createdAt 300, which beats b's 200.
    expect(recentlyFinished(games).map((g) => g.id)).toEqual(['a', 'b']);
  });
});

describe('recentTypeIds', () => {
  it('lists distinct types most-recently-played first', () => {
    const games = [
      game({ id: 'a', type: 'hearts', finishedAt: 100 }),
      game({ id: 'b', type: 'skullking', finishedAt: 300 }),
      game({ id: 'c', type: 'hearts', finishedAt: 500 }),
    ];
    expect(recentTypeIds(games)).toEqual(['hearts', 'skullking']);
  });
});

describe('sectionize', () => {
  const types = [HEARTS, SKULL, CODENAMES];

  it('splits favorites / recent / remainder with no repeats', () => {
    const games = [game({ id: 'a', type: 'codenames', finishedAt: 100 })];
    const s = sectionize(types, games, ['skullking'], []);
    expect(s.favorites.map((t) => t.id)).toEqual(['skullking']);
    expect(s.recent.map((t) => t.id)).toEqual(['codenames']);
    expect(s.remainder.map((t) => t.id)).toEqual(['hearts']);
  });

  it('excludes hidden types from every section', () => {
    const s = sectionize(types, [], [], ['codenames']);
    const all = [...s.favorites, ...s.recent, ...s.remainder].map((t) => t.id);
    expect(all).not.toContain('codenames');
  });

  it('a favorited + recently-played type stays only in favorites', () => {
    const games = [game({ id: 'a', type: 'hearts', finishedAt: 100 })];
    const s = sectionize(types, games, ['hearts'], []);
    expect(s.favorites.map((t) => t.id)).toEqual(['hearts']);
    expect(s.recent.map((t) => t.id)).not.toContain('hearts');
  });
});

describe('favorite + hidden metadata', () => {
  beforeEach(() => {
    settings.update((s) => ({ ...s, catalogFavorites: [], catalogHidden: [] }));
  });

  it('toggleFavorite pins then unpins', () => {
    toggleFavorite('hearts');
    expect(isFavorite('hearts')).toBe(true);
    expect(get(settings).catalogFavorites).toEqual(['hearts']);
    toggleFavorite('hearts');
    expect(isFavorite('hearts')).toBe(false);
  });

  it('setHidden hides then shows', () => {
    setHidden('hearts', true);
    expect(isHidden('hearts')).toBe(true);
    setHidden('hearts', false);
    expect(isHidden('hearts')).toBe(false);
  });
});
