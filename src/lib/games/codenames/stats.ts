import type { ID } from '../../types';
import type { CodenamesInput, Team } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';

interface CodenamesAgg {
  /** Games lost because this player's team hit the assassin. */
  assassinLosses: number;
  /** Games won by finding all agents (no assassin drama). */
  cleanWins: number;
}

function isTeam(value: unknown): value is Team {
  return value === 'red' || value === 'blue';
}

/**
 * Codenames stats from each recorded game's team map + outcome. Pure and
 * Svelte-free (mirrors the module's own `logic.ts`), so the engine can import it
 * without touching the round editor.
 */
export function codenamesStats({
  games,
  rounds,
  canonical,
}: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, CodenamesAgg>();
  const get = (id: ID): CodenamesAgg => {
    let a = per.get(id);
    if (!a) {
      a = { assassinLosses: 0, cleanWins: 0 };
      per.set(id, a);
    }
    return a;
  };

  const teamWins: Record<Team, number> = { red: 0, blue: 0 };
  let assassinGames = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as CodenamesInput | undefined;
    if (!input?.teams || !isTeam(input.winner)) continue;

    const winner = input.winner;
    const byAssassin = input.ending === 'assassin';
    teamWins[winner] += 1;
    if (byAssassin) assassinGames += 1;

    for (const [pid, team] of Object.entries(input.teams)) {
      if (!isTeam(team)) continue;
      const a = get(canonical(pid));
      if (team === winner) {
        if (!byAssassin) a.cleanWins += 1;
      } else if (byAssassin) {
        a.assassinLosses += 1;
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.cleanWins) {
      metrics.push({
        key: 'cn_clean',
        label: 'Clean sweeps',
        value: fmtInt(a.cleanWins),
        emoji: '🎉',
      });
    }
    if (a.assassinLosses) {
      metrics.push({
        key: 'cn_assassin',
        label: 'Assassin losses',
        value: fmtInt(a.assassinLosses),
        emoji: '💀',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  const totalGames = teamWins.red + teamWins.blue;
  if (totalGames) {
    global.push({
      key: 'cn_teams',
      label: 'Red vs Blue',
      value: `🔴 ${fmtInt(teamWins.red)} – ${fmtInt(teamWins.blue)} 🔵`,
      sub: `${fmtInt(totalGames)} games tracked`,
    });
  }
  if (assassinGames) {
    global.push({
      key: 'cn_assassin_all',
      label: 'Assassin endings',
      value: fmtInt(assassinGames),
      emoji: '💀',
    });
  }

  return { perPlayer, global };
}
