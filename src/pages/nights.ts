import type { Game } from '../lib/types';
import { dayKey } from '../lib/stats/format';
import { gameTime } from './history';

export interface GameNight {
  date: string;
  games: Game[];
  playerIds: string[];
  finished: number;
  abandoned: number;
}

/** A night uses the same local calendar date as the existing Stats/Wrapped engine. */
export function isNightDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Build a read-only library from saved results, without changing or duplicating World data. */
export function gameNights(games: Game[]): GameNight[] {
  const byDate = new Map<string, GameNight>();
  const results = games
    .filter(
      (game) =>
        !game.archived &&
        !game.deleted &&
        (game.status === 'finished' || game.status === 'abandoned') &&
        Number.isFinite(gameTime(game)),
    )
    .sort((a, b) => gameTime(b) - gameTime(a) || a.id.localeCompare(b.id));

  for (const game of results) {
    const date = dayKey(gameTime(game));
    if (!isNightDate(date)) continue;
    let night = byDate.get(date);
    if (!night) {
      night = { date, games: [], playerIds: [], finished: 0, abandoned: 0 };
      byDate.set(date, night);
    }
    night.games.push(game);
    if (game.status === 'finished') night.finished++;
    else night.abandoned++;
    for (const id of game.playerIds) {
      if (!night.playerIds.includes(id)) night.playerIds.push(id);
    }
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}
