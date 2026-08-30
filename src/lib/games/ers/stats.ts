import type { ID, Round } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import type { ErsInput } from './logic';

/**
 * Egyptian Rat Screw stats — derived purely from each recorded hand's winner. There is no
 * running score to aggregate, so the interesting numbers are simply: how many hands were
 * slapped out, and who's collected the most decks.
 */
export function ersStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));

  const handsWon = new Map<ID, number>();
  let handsPlayed = 0;

  for (const r of rounds as Round[]) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as ErsInput | undefined;
    if (!input?.winnerId) continue;
    handsPlayed += 1;
    const id = canonical(input.winnerId);
    handsWon.set(id, (handsWon.get(id) ?? 0) + 1);
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, n] of handsWon) {
    perPlayer[id] = [{ key: 'ers_hands', label: 'Decks collected', value: `${n}`, emoji: '🐀' }];
  }

  const global: Metric[] = [];
  if (handsPlayed) {
    global.push({ key: 'ers_hands_total', label: 'Hands played', value: `${handsPlayed}`, emoji: '🃏' });
  }

  return { perPlayer, global };
}
