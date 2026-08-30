import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt } from '../../stats/format';
import { readConfig, totalsFor, type CatanInput } from './logic';

interface CatanAgg {
  /** Finished games this member sat for. */
  games: number;
  /** Sum of each finished game's final VP total (for an average). */
  finalVP: number;
  bestVP: number;
  /** Games ending with this member holding Longest Road. */
  longestRoad: number;
  /** Games ending with this member holding Largest Army. */
  largestArmy: number;
  /** Total revealed Victory Point dev cards across finished games. */
  devVP: number;
  wins: number;
}

function blank(): CatanAgg {
  return { games: 0, finalVP: 0, bestVP: 0, longestRoad: 0, largestArmy: 0, devVP: 0, wins: 0 };
}

/**
 * Catan stats, replayed purely from each game's recorded checkpoints. Each finished game's LAST
 * checkpoint is its board at game end — the source of truth for who held each award, how many
 * VP cards were revealed, and the final standing. Pure, no I/O. No Svelte.
 */
export function catanStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const per = new Map<ID, CatanAgg>();
  const get = (id: ID): CatanAgg => {
    let a = per.get(id);
    if (!a) {
      a = blank();
      per.set(id, a);
    }
    return a;
  };

  let bestVPAnywhere = 0;

  for (const g of games) {
    if (g.status !== 'finished' || !g.playerIds.length) continue;
    const gameRounds = rounds.filter((r) => r.gameId === g.id).sort((a, b) => a.index - b.index);
    const last = gameRounds[gameRounds.length - 1]?.input as CatanInput | undefined;
    if (!last) continue;

    const cfg = readConfig(g.config);
    const totals = totalsFor(last, g.playerIds);
    const winnerScore = Math.max(...Object.values(totals));
    if (winnerScore < cfg.targetVP) continue; // game abandoned short of the target

    for (const pid of g.playerIds) {
      const a = get(canonical(pid));
      const vp = totals[pid] ?? 0;
      a.games += 1;
      a.finalVP += vp;
      if (vp > a.bestVP) a.bestVP = vp;
      if (vp > bestVPAnywhere) bestVPAnywhere = vp;
      a.devVP += Number(last.devVP?.[pid]) || 0;
      if (vp === winnerScore) a.wins += 1;
    }
    if (last.longestRoad) get(canonical(last.longestRoad)).longestRoad += 1;
    if (last.largestArmy) get(canonical(last.largestArmy)).largestArmy += 1;
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.games) {
      metrics.push({
        key: 'ct_best',
        label: 'Best VP total',
        value: fmtInt(a.bestVP),
        emoji: '👑',
      });
      metrics.push({
        key: 'ct_avg',
        label: 'Avg VP at finish',
        value: fmtAvg(a.finalVP / a.games),
        emoji: '🔢',
      });
    }
    if (a.longestRoad) {
      metrics.push({
        key: 'ct_road',
        label: 'Longest Road wins',
        value: fmtInt(a.longestRoad),
        emoji: '🛣️',
      });
    }
    if (a.largestArmy) {
      metrics.push({
        key: 'ct_army',
        label: 'Largest Army wins',
        value: fmtInt(a.largestArmy),
        emoji: '⚔️',
      });
    }
    if (a.devVP) {
      metrics.push({
        key: 'ct_devvp',
        label: 'VP cards revealed',
        value: fmtInt(a.devVP),
        emoji: '🃏',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (bestVPAnywhere) {
    global.push({
      key: 'ct_best_all',
      label: 'Best VP total',
      value: fmtInt(bestVPAnywhere),
      emoji: '👑',
    });
  }

  return { perPlayer, global };
}
