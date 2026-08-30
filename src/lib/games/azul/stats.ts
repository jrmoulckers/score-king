import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt } from '../../stats/format';
import { bonusTotal, entryDelta, type AzulInput } from './logic';

interface AzulAgg {
  rounds: number;
  wallPoints: number;
  bestWallRound: number;
  floorTiles: number;
  floorPenalty: number;
  cleanRounds: number; // rounds with zero floor tiles
  finalRounds: number; // rounds this player ended the game in
  bonusPoints: number;
  bestBonus: number;
}

function blank(): AzulAgg {
  return {
    rounds: 0,
    wallPoints: 0,
    bestWallRound: 0,
    floorTiles: 0,
    floorPenalty: 0,
    cleanRounds: 0,
    finalRounds: 0,
    bonusPoints: 0,
    bestBonus: 0,
  };
}

/**
 * Azul stats, replayed purely from each game's recorded rounds. No Svelte, no I/O.
 */
export function azulStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const per = new Map<ID, AzulAgg>();
  const get = (id: ID): AzulAgg => {
    let a = per.get(id);
    if (!a) {
      a = blank();
      per.set(id, a);
    }
    return a;
  };

  let bestWallAnywhere = 0;
  let bestBonusAnywhere = 0;

  const gameIds = new Set(games.map((g) => g.id));
  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as AzulInput | undefined;
    if (!input?.entries) continue;

    for (const [pid, entry] of Object.entries(input.entries)) {
      const a = get(canonical(pid));
      a.rounds += 1;
      const wall = Math.max(0, Math.round(Number(entry.scored)) || 0);
      const tiles = Math.max(0, Math.round(Number(entry.floorTiles)) || 0);
      a.wallPoints += wall;
      if (wall > a.bestWallRound) a.bestWallRound = wall;
      if (wall > bestWallAnywhere) bestWallAnywhere = wall;
      a.floorTiles += tiles;
      a.floorPenalty += entryDelta(entry) - wall; // negative or zero
      if (tiles === 0) a.cleanRounds += 1;

      if (input.final) {
        a.finalRounds += 1;
        const bonus = bonusTotal(input.bonuses?.[pid]);
        a.bonusPoints += bonus;
        if (bonus > a.bestBonus) a.bestBonus = bonus;
        if (bonus > bestBonusAnywhere) bestBonusAnywhere = bonus;
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let allRounds = 0;
  let allWallPoints = 0;

  for (const [id, a] of per) {
    allRounds += a.rounds;
    allWallPoints += a.wallPoints;

    const metrics: Metric[] = [];
    if (a.rounds) {
      metrics.push({
        key: 'az_best_wall',
        label: 'Best round on the wall',
        value: fmtInt(a.bestWallRound),
        emoji: '🧱',
      });
      metrics.push({
        key: 'az_avg_wall',
        label: 'Avg wall points / round',
        value: fmtAvg(a.wallPoints / a.rounds),
        emoji: '🔢',
      });
    }
    if (a.cleanRounds) {
      metrics.push({
        key: 'az_clean',
        label: 'Clean rounds — no floor tiles',
        value: fmtInt(a.cleanRounds),
        emoji: '✨',
      });
    }
    if (a.floorPenalty) {
      metrics.push({
        key: 'az_floor',
        label: 'Points lost to the floor line',
        value: fmtInt(Math.abs(a.floorPenalty)),
        sub: `${fmtInt(a.floorTiles)} tile${a.floorTiles === 1 ? '' : 's'} total`,
        emoji: '🕳️',
      });
    }
    if (a.finalRounds) {
      metrics.push({
        key: 'az_bonus',
        label: 'End-game bonus scored',
        value: fmtInt(a.bonusPoints),
        sub: a.bestBonus ? `best ${fmtInt(a.bestBonus)}` : undefined,
        emoji: '🏁',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (bestWallAnywhere) {
    global.push({
      key: 'az_best_wall_all',
      label: 'Best wall round',
      value: fmtInt(bestWallAnywhere),
      emoji: '🧱',
    });
  }
  if (allRounds) {
    global.push({
      key: 'az_avg_wall_all',
      label: 'Avg wall points / round',
      value: fmtAvg(allWallPoints / allRounds),
      emoji: '🔢',
    });
  }
  if (bestBonusAnywhere) {
    global.push({
      key: 'az_best_bonus_all',
      label: 'Best end-game bonus',
      value: fmtInt(bestBonusAnywhere),
      emoji: '🏁',
    });
  }

  return { perPlayer, global };
}
