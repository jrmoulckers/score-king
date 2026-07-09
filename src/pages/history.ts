import type { Game, Player } from '../lib/types';

/** A game's timeline anchor: when it finished, else when it was created. */
export function gameTime(g: Game): number {
  return g.finishedAt ?? g.createdAt;
}

export type DateBucket = 'today' | 'week' | 'month' | 'earlier';

/**
 * Which date group a timestamp falls into, relative to `now`. Pure (takes `now`) so the
 * bucketing is deterministic and unit-testable. "week" is the current calendar week
 * starting Monday; "month" is the current calendar month.
 */
export function dateBucket(t: number, now: Date = new Date()): DateBucket {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfToday - ((now.getDay() + 6) % 7) * 86400000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (t >= startOfToday) return 'today';
  if (t >= startOfWeek) return 'week';
  if (t >= startOfMonth) return 'month';
  return 'earlier';
}

/**
 * Lowercased searchable text for a game: game name, custom label, and every player's
 * and winner's name. `nameFor` resolves a player id to a display name; `typeName`
 * resolves the game's module label (falls back to the raw type slug).
 */
export function haystack(
  g: Game,
  typeName: (type: string) => string,
  nameFor: (id: string) => string,
): string {
  const parts = [typeName(g.type), g.name ?? ''];
  for (const id of g.playerIds) parts.push(nameFor(id));
  for (const id of g.winnerIds ?? []) parts.push(nameFor(id));
  return parts.join(' ').toLowerCase();
}

/** Player-name resolver from a roster map, with a `?` fallback for missing ids. */
export function nameResolver(playerMap: Map<string, Player>): (id: string) => string {
  return (id) => playerMap.get(id)?.name ?? '?';
}
