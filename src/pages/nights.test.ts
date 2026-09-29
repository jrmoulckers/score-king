import { describe, expect, it } from 'vitest';
import type { Game } from '../lib/types';
import { gameNights, isNightDate } from './nights';

const at = (year: number, month: number, day: number, hour = 20) =>
  new Date(year, month - 1, day, hour).getTime();

function game(id: string, changes: Partial<Game> = {}): Game {
  return {
    id,
    type: 'tally',
    config: {},
    playerIds: ['ada', 'bo'],
    status: 'finished',
    createdAt: at(2026, 9, 27),
    finishedAt: at(2026, 9, 27),
    roundCount: 1,
    winnerIds: ['ada'],
    ...changes,
  };
}

describe('gameNights', () => {
  it('groups by local result date, newest night and game first', () => {
    const nights = gameNights([
      game('older', { finishedAt: at(2026, 9, 27, 19) }),
      game('newest', { playerIds: ['bo', 'cy'], finishedAt: at(2026, 9, 28) }),
      game('later', { finishedAt: at(2026, 9, 27, 23) }),
    ]);
    expect(nights.map((night) => night.date)).toEqual(['2026-09-28', '2026-09-27']);
    expect(nights[1].games.map((g) => g.id)).toEqual(['later', 'older']);
    expect(nights[0].playerIds).toEqual(['bo', 'cy']);
    expect(nights[1].playerIds).toEqual(['ada', 'bo']);
  });

  it('uses finish time rather than start time across midnight', () => {
    expect(
      gameNights([
        game('late', {
          createdAt: at(2026, 9, 27, 23),
          finishedAt: at(2026, 9, 28, 1),
        }),
      ])[0].date,
    ).toBe('2026-09-28');
  });

  it('labels abandoned games without treating them as wins and excludes active or archived games', () => {
    const nights = gameNights([
      game('finished', { finishedAt: at(2026, 9, 27, 21) }),
      game('abandoned', {
        status: 'abandoned',
        finishedAt: undefined,
        winnerIds: undefined,
      }),
      game('active', { status: 'active' }),
      game('archived', { archived: true }),
      game('deleted', { deleted: at(2026, 9, 29) }),
    ]);
    expect(nights).toHaveLength(1);
    expect(nights[0].games.map((g) => g.id)).toEqual(['finished', 'abandoned']);
    expect(nights[0].finished).toBe(1);
    expect(nights[0].abandoned).toBe(1);
  });

  it('does not mutate the store or its game records', () => {
    const games = [game('one'), game('two', { finishedAt: at(2026, 9, 28) })];
    gameNights(games);
    expect(games.map((g) => g.id)).toEqual(['one', 'two']);
  });
});

describe('isNightDate', () => {
  it('accepts real dates, including leap day', () => {
    expect(isNightDate('2024-02-29')).toBe(true);
  });
  it.each(['2025-02-29', '2026-13-01', '2026-09-31', '2026-9-01', 'not-a-date'])(
    'rejects invalid date %s',
    (date) => expect(isNightDate(date)).toBe(false),
  );
});
