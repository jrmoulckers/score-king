import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtSigned } from '../../stats/format';
import { readConfig, type SpikeballInput } from './logic';

interface Agg {
  played: number;
  won: number;
  pointsFor: number;
  pointsAgainst: number;
  deuce: number;
}

function blank(): Agg {
  return { played: 0, won: 0, pointsFor: 0, pointsAgainst: 0, deuce: 0 };
}

/**
 * Spikeball stats from each recorded game's teams + final points. Games are tallied per
 * team, so teammates share the same games/points lines. Pure; mirrors the module's own
 * scoring (higher rally count wins) and reads win-by-2/deuce from each game's target.
 */
export function spikeballStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const targetByGame = new Map<ID, number>(games.map((g) => [g.id, readConfig(g.config).target]));
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, Agg>();
  const get = (id: ID): Agg => {
    let a = per.get(id);
    if (!a) per.set(id, (a = blank()));
    return a;
  };

  let totalGames = 0;
  let totalPoints = 0;
  let biggestMargin = -1;
  let biggestLabel = '';

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as SpikeballInput | undefined;
    if (!input?.teams) continue;
    const a = Number(input.a) || 0;
    const b = Number(input.b) || 0;
    const [teamA, teamB] = input.teams;
    if (!teamA?.length || !teamB?.length) continue;

    const winner = a === b ? null : a > b ? 0 : 1;
    const target = targetByGame.get(r.gameId) ?? 21;
    const deuce = Math.max(a, b) > target;

    totalGames += 1;
    totalPoints += a + b;
    const margin = Math.abs(a - b);
    if (margin > biggestMargin) {
      biggestMargin = margin;
      biggestLabel = `${Math.max(a, b)}–${Math.min(a, b)}`;
    }

    for (const raw of teamA) {
      const g = get(canonical(raw));
      g.played += 1;
      g.pointsFor += a;
      g.pointsAgainst += b;
      if (winner === 0) g.won += 1;
      if (deuce) g.deuce += 1;
    }
    for (const raw of teamB) {
      const g = get(canonical(raw));
      g.played += 1;
      g.pointsFor += b;
      g.pointsAgainst += a;
      if (winner === 1) g.won += 1;
      if (deuce) g.deuce += 1;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    if (!a.played) continue;
    const metrics: Metric[] = [
      { key: 'sb_won', label: 'Games won', value: `${a.won}`, sub: `of ${a.played}`, emoji: '🏐' },
      { key: 'sb_pf', label: 'Rally points', value: fmtInt(a.pointsFor), emoji: '🎯' },
      {
        key: 'sb_diff',
        label: 'Point differential',
        value: fmtSigned(a.pointsFor - a.pointsAgainst),
        emoji: '📈',
      },
    ];
    if (a.deuce) metrics.push({ key: 'sb_deuce', label: 'Deuce games', value: `${a.deuce}`, emoji: '🥵' });
    perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totalGames) {
    global.push({ key: 'sb_games', label: 'Games played', value: fmtInt(totalGames), emoji: '🏐' });
    global.push({ key: 'sb_points', label: 'Rally points', value: fmtInt(totalPoints), emoji: '🎯' });
    if (biggestMargin >= 0) {
      global.push({
        key: 'sb_blowout',
        label: 'Biggest blowout',
        value: biggestLabel,
        sub: `+${biggestMargin}`,
        emoji: '💥',
      });
    }
  }

  return { perPlayer, global };
}
