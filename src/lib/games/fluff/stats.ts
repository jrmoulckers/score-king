import type { ID } from '../../types';
import type { FluffInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';

interface FluffAgg {
  lost: number;
  gained: number;
}

/**
 * Fluff stats, derived purely from each recorded challenge. Every round names the one
 * player who lost (or, spot-on, regained) a die, so we can tally who bleeds dice and who
 * claws them back. Pure — no Svelte — so it's independently unit-testable and safe for
 * the stats engine to import.
 */
export function fluffStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, FluffAgg>();
  const get = (id: ID): FluffAgg => {
    let a = per.get(id);
    if (!a) {
      a = { lost: 0, gained: 0 };
      per.set(id, a);
    }
    return a;
  };

  let challenges = 0;
  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as FluffInput | undefined;
    if (!input?.playerId) continue;
    challenges += 1;
    const a = get(canonical(input.playerId));
    if (input.result === 'gain') a.gained += 1;
    else a.lost += 1;
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.lost) {
      metrics.push({ key: 'fluff_lost', label: 'Dice lost', value: fmtInt(a.lost), emoji: '💀' });
    }
    if (a.gained) {
      metrics.push({ key: 'fluff_won', label: 'Dice won back', value: fmtInt(a.gained), emoji: '🎲' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (challenges) {
    global.push({
      key: 'fluff_calls',
      label: 'Challenges called',
      value: fmtInt(challenges),
      emoji: '🗣️',
    });
  }

  return { perPlayer, global };
}
