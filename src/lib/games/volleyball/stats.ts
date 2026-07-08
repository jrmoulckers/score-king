import type { ID } from '../../types';
import type { VolleyballInput } from './index';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';
import { matchState, readConfig, setWinner, targetForSet, type SetScore } from './logic';

interface SideAgg {
  setsWon: number;
  setsPlayed: number;
  pointsFor: number;
  deuceSets: number; // sets pushed past the target by the win-by-two rule
  matchesWon: number;
  sweeps: number; // matches won without dropping a set
}

/**
 * Volleyball stats, rebuilt from each game's recorded set scores. Pure and
 * config-aware: we replay every game's sets with its own rules (deciding-set
 * target, win-by-two, cap) so sets won, deuce battles and sweeps are exact —
 * mirroring how the module itself scores a set.
 */
export function volleyballStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const byGame = new Map<ID, typeof rounds>();
  for (const r of rounds) {
    const list = byGame.get(r.gameId);
    if (list) list.push(r);
    else byGame.set(r.gameId, [r]);
  }

  const per = new Map<ID, SideAgg>();
  const get = (id: ID): SideAgg => {
    let a = per.get(id);
    if (!a) {
      a = { setsWon: 0, setsPlayed: 0, pointsFor: 0, deuceSets: 0, matchesWon: 0, sweeps: 0 };
      per.set(id, a);
    }
    return a;
  };

  let biggestSet: { hi: number; lo: number } | null = null;

  for (const game of games) {
    const [rawA, rawB] = game.playerIds;
    if (!rawA || !rawB) continue;
    const idA = canonical(rawA);
    const idB = canonical(rawB);
    const cfg = readConfig(game.config);

    const gameRounds = (byGame.get(game.id) ?? []).slice().sort((x, y) => x.index - y.index);
    const setScores: SetScore[] = [];

    let setsA = 0;
    let setsB = 0;
    for (const r of gameRounds) {
      const input = r.input as VolleyballInput | undefined;
      if (!input?.points) continue;
      const a = Number(input.points[rawA]) || 0;
      const b = Number(input.points[rawB]) || 0;
      const target = targetForSet(cfg, setsA, setsB);
      const winner = setWinner(a, b, target, cfg.winBy2, cfg.hardCap);
      if (!winner) continue;

      setScores.push({ a, b });
      const aggA = get(idA);
      const aggB = get(idB);
      aggA.setsPlayed += 1;
      aggB.setsPlayed += 1;
      aggA.pointsFor += a;
      aggB.pointsFor += b;
      if (winner === 'a') {
        aggA.setsWon += 1;
        setsA += 1;
      } else {
        aggB.setsWon += 1;
        setsB += 1;
      }

      // A "deuce" set is one dragged past its target by the win-by-two rule.
      if (Math.max(a, b) > target) {
        aggA.deuceSets += 1;
        aggB.deuceSets += 1;
      }

      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      if (!biggestSet || lo > biggestSet.lo || (lo === biggestSet.lo && hi > biggestSet.hi)) {
        biggestSet = { hi, lo };
      }
    }

    const state = matchState(setScores, cfg);
    if (state.decided && state.winner) {
      const winnerId = state.winner === 'a' ? idA : idB;
      const loserSets = state.winner === 'a' ? state.setsB : state.setsA;
      const agg = get(winnerId);
      agg.matchesWon += 1;
      if (loserSets === 0) agg.sweeps += 1;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totalSets = 0;
  let totalDeuce = 0;
  for (const [id, a] of per) {
    totalSets += a.setsWon;
    totalDeuce += a.deuceSets;
    const metrics: Metric[] = [];
    if (a.setsWon) metrics.push({ key: 'v_sets', label: 'Sets won', value: `${a.setsWon}`, emoji: '🏐' });
    if (a.pointsFor) {
      metrics.push({ key: 'v_points', label: 'Points scored', value: fmtInt(a.pointsFor), emoji: '🔥' });
    }
    if (a.deuceSets) {
      metrics.push({ key: 'v_deuce', label: 'Deuce sets', value: `${a.deuceSets}`, emoji: '😤' });
    }
    if (a.sweeps) metrics.push({ key: 'v_sweep', label: 'Sweeps', value: `${a.sweeps}`, emoji: '🧹' });
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totalSets) global.push({ key: 'v_sets_all', label: 'Sets played', value: `${totalSets}`, emoji: '🏐' });
  if (totalDeuce) {
    // Each deuce set is counted once per side above; halve for the true set count.
    global.push({ key: 'v_deuce_all', label: 'Deuce sets', value: `${Math.round(totalDeuce / 2)}`, emoji: '😤' });
  }
  if (biggestSet) {
    global.push({
      key: 'v_biggest',
      label: 'Longest set',
      value: `${biggestSet.hi}–${biggestSet.lo}`,
      emoji: '⚔️',
    });
  }

  return { perPlayer, global };
}
