import type { ID, Round } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg } from '../../stats/format';
import { finishingPositions, type EKInput } from './logic';

interface EKAgg {
  firstOut: number;
  runnerUp: number;
  finishSum: number;
  finishCount: number;
  defuses: number;
  bestStreak: number;
}

/**
 * Exploding Kittens flavour stats, derived from each match's recorded survivor and
 * elimination order. The generic engine already carries match wins (the leaderboard
 * is literally "most matches won"), so this hook adds only what it can't: who blows
 * up first, who keeps reaching the final two, and average finishing position. All
 * pure; mirrors the module's own `finishingPositions`. With "track elimination
 * order" off there's no order data, so this gracefully contributes nothing.
 */
export function explodingKittensStats({
  games,
  rounds,
  canonical,
}: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, EKAgg>();
  const get = (id: ID): EKAgg => {
    let a = per.get(id);
    if (!a) {
      a = { firstOut: 0, runnerUp: 0, finishSum: 0, finishCount: 0, defuses: 0, bestStreak: 0 };
      per.set(id, a);
    }
    return a;
  };

  let totalExploded = 0;
  let totalDefused = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const raw = r.input as EKInput | undefined;
    if (!raw) continue;

    const order = (raw.order ?? []).map(canonical);
    const winner = raw.winner ? canonical(raw.winner) : null;
    const players = [...new Set(Object.keys(r.deltas).map(canonical))];

    totalExploded += order.length;
    if (order.length) get(order[0]).firstOut += 1;

    // Defuses: who cheated death, and how often, when the group tracked it.
    if (raw.defuses) {
      for (const [id, n] of Object.entries(raw.defuses)) {
        const count = Math.max(0, Math.floor(n || 0));
        if (!count) continue;
        get(canonical(id)).defuses += count;
        totalDefused += count;
      }
    }

    // Finishing positions only make sense for a completed match (everyone but the
    // survivor exploded); guard so avg finish isn't skewed by a partial entry.
    const complete = !!winner && order.length === players.length - 1 && order.length > 0;
    if (complete) {
      const pos = finishingPositions({ winner, order }, players);
      for (const [id, p] of Object.entries(pos)) {
        const a = get(id);
        a.finishSum += p;
        a.finishCount += 1;
        if (p === 2) a.runnerUp += 1;
      }
    }
  }

  // Best win streak: the longest run of consecutive match wins within a single game.
  // Matches are grouped by game and walked in play order; winning bumps a player's
  // running streak, and any other outcome in a match they were part of resets it.
  const byGame = new Map<ID, Round[]>();
  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    let list = byGame.get(r.gameId);
    if (!list) {
      list = [];
      byGame.set(r.gameId, list);
    }
    list.push(r);
  }
  for (const gameRounds of byGame.values()) {
    gameRounds.sort((a, b) => a.index - b.index);
    const streak = new Map<ID, number>();
    for (const r of gameRounds) {
      const raw = r.input as EKInput | undefined;
      const winner = raw?.winner ? canonical(raw.winner) : null;
      for (const id of new Set(Object.keys(r.deltas).map(canonical))) {
        if (id === winner) {
          const next = (streak.get(id) ?? 0) + 1;
          streak.set(id, next);
          const a = get(id);
          if (next > a.bestStreak) a.bestStreak = next;
        } else {
          streak.set(id, 0);
        }
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.firstOut) {
      metrics.push({ key: 'ek_first', label: 'First to explode', value: `${a.firstOut}`, emoji: '💥' });
    }
    if (a.runnerUp) {
      metrics.push({ key: 'ek_runnerup', label: 'Runner-up', value: `${a.runnerUp}`, emoji: '🥈' });
    }
    if (a.finishCount) {
      metrics.push({
        key: 'ek_finish',
        label: 'Avg finish',
        value: fmtAvg(a.finishSum / a.finishCount),
        emoji: '🏁',
      });
    }
    if (a.defuses) {
      metrics.push({ key: 'ek_defuse', label: 'Deaths cheated', value: `${a.defuses}`, emoji: '🛡' });
    }
    if (a.bestStreak >= 2) {
      metrics.push({ key: 'ek_streak', label: 'Best win streak', value: `${a.bestStreak}`, emoji: '🔥' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totalExploded) {
    global.push({ key: 'ek_boom', label: 'Kittens exploded', value: `${totalExploded}`, emoji: '💥' });
  }
  if (totalDefused) {
    global.push({ key: 'ek_defused', label: 'Deaths cheated', value: `${totalDefused}`, emoji: '🛡' });
  }

  return { perPlayer, global };
}
