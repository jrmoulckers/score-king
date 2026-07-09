import type { ID } from '../../types';
import type { VolleyballInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';
import { readConfig, setWinner } from './logic';

interface SideAgg {
  setsWon: number;
  setsPlayed: number;
  pointsFor: number;
  deuceSets: number; // sets pushed past the target by the win-by-two rule
}

/**
 * Volleyball stats, rebuilt from each game's recorded sets. Pure and config-aware:
 * every set is re-scored with its own game's rules, then credited to the players on
 * the two contesting teams — so sets won, points and deuce battles land on the
 * individuals who actually played them, regardless of how teams were shuffled.
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
      a = { setsWon: 0, setsPlayed: 0, pointsFor: 0, deuceSets: 0 };
      per.set(id, a);
    }
    return a;
  };

  let totalSets = 0;
  let totalDeuce = 0;
  let biggestSet: { hi: number; lo: number } | null = null;

  for (const game of games) {
    const cfg = readConfig(game.config);
    const gameRounds = (byGame.get(game.id) ?? []).slice().sort((x, y) => x.index - y.index);

    for (const r of gameRounds) {
      const input = r.input as VolleyballInput | undefined;
      if (!input?.teams || !Array.isArray(input.teams)) continue;
      const a = Number(input.points?.home) || 0;
      const b = Number(input.points?.away) || 0;
      const winner = setWinner(a, b, cfg.pointsPerSet, cfg.winBy2, cfg.hardCap);
      if (!winner) continue;

      const home = input.teams.find((t) => t.id === input.home);
      const away = input.teams.find((t) => t.id === input.away);
      const target = cfg.pointsPerSet;
      const deuce = Math.max(a, b) > target;

      totalSets += 1;
      if (deuce) totalDeuce += 1;

      for (const m of home?.memberIds ?? []) {
        const agg = get(canonical(m));
        agg.setsPlayed += 1;
        agg.pointsFor += a;
        if (winner === 'a') agg.setsWon += 1;
        if (deuce) agg.deuceSets += 1;
      }
      for (const m of away?.memberIds ?? []) {
        const agg = get(canonical(m));
        agg.setsPlayed += 1;
        agg.pointsFor += b;
        if (winner === 'b') agg.setsWon += 1;
        if (deuce) agg.deuceSets += 1;
      }

      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      if (!biggestSet || lo > biggestSet.lo || (lo === biggestSet.lo && hi > biggestSet.hi)) {
        biggestSet = { hi, lo };
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.setsWon) metrics.push({ key: 'v_sets', label: 'Sets won', value: `${a.setsWon}`, emoji: '🏐' });
    if (a.pointsFor) metrics.push({ key: 'v_points', label: 'Points scored', value: fmtInt(a.pointsFor), emoji: '🔥' });
    if (a.deuceSets) metrics.push({ key: 'v_deuce', label: 'Deuce sets', value: `${a.deuceSets}`, emoji: '😤' });
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totalSets) global.push({ key: 'v_sets_all', label: 'Sets played', value: `${totalSets}`, emoji: '🏐' });
  if (totalDeuce) global.push({ key: 'v_deuce_all', label: 'Deuce sets', value: `${totalDeuce}`, emoji: '😤' });
  if (biggestSet) {
    global.push({ key: 'v_biggest', label: 'Longest set', value: `${biggestSet.hi}–${biggestSet.lo}`, emoji: '⚔️' });
  }

  return { perPlayer, global };
}
