import type { ID } from '../types';
import type { MemberStats, StatsResult } from './types';

export interface MetricDelta {
  key: string;
  label: string;
  current: number;
  prior: number;
  delta: number;
  /** Direction-aware: true when the change is an improvement. */
  better: boolean;
}

export interface StatsDelta {
  playerId: ID;
  metrics: MetricDelta[];
}

const pick = (m: MemberStats | undefined, f: (m: MemberStats) => number | undefined): number =>
  m ? f(m) ?? 0 : 0;

/**
 * Diff one member's stats between two windows (current vs prior) — powers
 * "vs last season", "vs last year", and "this time last year" comparison cards.
 */
export function compareStats(current: StatsResult, prior: StatsResult, playerId: ID): StatsDelta {
  const c = current.perPlayer[playerId];
  const p = prior.perPlayer[playerId];
  const metrics: MetricDelta[] = [];
  const push = (key: string, label: string, cur: number, pri: number, higherBetter = true) => {
    metrics.push({ key, label, current: cur, prior: pri, delta: cur - pri, better: higherBetter ? cur > pri : cur < pri });
  };

  push('wins', 'Wins', pick(c, (m) => m.wins), pick(p, (m) => m.wins));
  push('winRate', 'Win %', pick(c, (m) => m.winRate), pick(p, (m) => m.winRate));
  push('played', 'Games', pick(c, (m) => m.played), pick(p, (m) => m.played));
  push('avgFinish', 'Avg finish', pick(c, (m) => m.avgFinish), pick(p, (m) => m.avgFinish), false);
  push('longestStreak', 'Best streak', pick(c, (m) => m.longestStreak), pick(p, (m) => m.longestStreak));
  push('points', 'Points', pick(c, (m) => m.points), pick(p, (m) => m.points));
  return { playerId, metrics };
}
