import type { ID } from '../../types';
import type { UnoInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct } from '../../stats/format';

interface UnoAgg {
  /** Hands this player went out (emptied their hand to end the round). */
  outs: number;
  /** Hands this player took part in. */
  rounds: number;
  /** Total leftover points this player was caught holding across hands. */
  stuck: number;
  /** Most points scooped in a single go-out (standard-mode flavour). */
  bigScoop: number;
}

/**
 * Uno stats from each hand's recorded "who went out" + leftover totals. Pure; mirrors
 * the module's own scoring so a game contributes stats the same way it contributes
 * points. Works for both scoring modes — a go-out is a go-out, and the leftover points
 * a player was stuck with are meaningful whether the winner scooped them or each player
 * banked their own.
 */
export function unoStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, UnoAgg>();
  const get = (id: ID): UnoAgg => {
    let a = per.get(id);
    if (!a) {
      a = { outs: 0, rounds: 0, stuck: 0, bigScoop: 0 };
      per.set(id, a);
    }
    return a;
  };

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as UnoInput | undefined;
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
      if (scoop > a.bigScoop) a.bigScoop = scoop;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totalOuts = 0;
  let biggest = 0;
  for (const [id, a] of per) {
    totalOuts += a.outs;
    if (a.bigScoop > biggest) biggest = a.bigScoop;
    const metrics: Metric[] = [];
    if (a.outs) {
      metrics.push({ key: 'u_out', label: 'Hands gone out', value: fmtInt(a.outs), emoji: '🎉' });
    }
    if (a.rounds) {
      metrics.push({
        key: 'u_rate',
        label: 'Go-out rate',
        value: fmtPct(a.outs / a.rounds),
        emoji: '🏃',
      });
    }
    if (a.stuck) {
      metrics.push({
        key: 'u_stuck',
        label: 'Points caught holding',
        value: fmtInt(a.stuck),
        emoji: '🃏',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totalOuts) {
    global.push({ key: 'u_out_all', label: 'Hands played out', value: fmtInt(totalOuts), emoji: '🎉' });
  }
  if (biggest) {
    global.push({ key: 'u_scoop', label: 'Biggest hand counted', value: fmtInt(biggest), emoji: '💰' });
  }
  return { perPlayer, global };
}
