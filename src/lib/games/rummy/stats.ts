import type { ID } from '../../types';
import type { RummyInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct } from '../../stats/format';

interface RummyAgg {
  /** Hands this player went out (emptied their hand) to end the round. */
  outs: number;
  /** Hands this player took part in. */
  rounds: number;
  /** Total leftover (deadwood) points this player was caught holding across hands. */
  stuck: number;
  /** Most points scooped in a single go-out. */
  bigScoop: number;
  /** Hands won by going "Rummy" (no prior melds, double bonus). */
  rummies: number;
}

/**
 * Rummy stats from each hand's recorded "who went out" + leftover totals. Pure;
 * mirrors the module's own scoring so a game contributes stats the same way it
 * contributes points.
 */
export function rummyStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, RummyAgg>();
  const get = (id: ID): RummyAgg => {
    let a = per.get(id);
    if (!a) {
      a = { outs: 0, rounds: 0, stuck: 0, bigScoop: 0, rummies: 0 };
      per.set(id, a);
    }
    return a;
  };

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as RummyInput | undefined;
    if (!input?.left) continue;
    const outId = input.out ? canonical(input.out) : null;
    let scoop = 0;
    for (const [pid, raw] of Object.entries(input.left)) {
      const id = canonical(pid);
      const a = get(id);
      a.rounds += 1;
      const left = Math.max(0, Number(raw) || 0);
      if (id === outId) {
        a.outs += 1;
      } else {
        scoop += left;
        a.stuck += left;
      }
    }
    if (outId) {
      const a = get(outId);
      const total = input.wentRummy ? scoop * 2 : scoop;
      if (total > a.bigScoop) a.bigScoop = total;
      if (input.wentRummy) a.rummies += 1;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totalOuts = 0;
  let biggest = 0;
  let totalRummies = 0;
  for (const [id, a] of per) {
    totalOuts += a.outs;
    totalRummies += a.rummies;
    if (a.bigScoop > biggest) biggest = a.bigScoop;
    const metrics: Metric[] = [];
    if (a.outs) {
      metrics.push({ key: 'r_out', label: 'Hands gone out', value: fmtInt(a.outs), emoji: '🎴' });
    }
    if (a.rounds) {
      metrics.push({
        key: 'r_rate',
        label: 'Go-out rate',
        value: fmtPct(a.outs / a.rounds),
        emoji: '🏃',
      });
    }
    if (a.stuck) {
      metrics.push({
        key: 'r_stuck',
        label: 'Deadwood caught holding',
        value: fmtInt(a.stuck),
        emoji: '🪵',
      });
    }
    if (a.rummies) {
      metrics.push({
        key: 'r_rummy',
        label: 'Went Rummy (double bonus)',
        value: fmtInt(a.rummies),
        emoji: '✨',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totalOuts) {
    global.push({
      key: 'r_out_all',
      label: 'Hands played out',
      value: fmtInt(totalOuts),
      emoji: '🎴',
    });
  }
  if (biggest) {
    global.push({
      key: 'r_scoop',
      label: 'Biggest hand counted',
      value: fmtInt(biggest),
      emoji: '💰',
    });
  }
  if (totalRummies) {
    global.push({
      key: 'r_rummy_all',
      label: 'Rummy double-bonuses',
      value: fmtInt(totalRummies),
      emoji: '✨',
    });
  }
  return { perPlayer, global };
}
