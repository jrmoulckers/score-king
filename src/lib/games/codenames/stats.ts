import type { ID } from '../../types';
import type { CodenamesInput, Team } from './logic';
import { TEAM_META } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct } from '../../stats/format';

interface CodenamesAgg {
  /** Games lost because this player's team hit the assassin. */
  assassinLosses: number;
  /** Games won by finding all agents (no assassin drama). */
  cleanWins: number;
  /** Games this player ran a spymaster desk (either side). */
  spymasterGames: number;
  /** Of those, how many their team won. */
  spymasterWins: number;
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
      a = { assassinLosses: 0, cleanWins: 0, spymasterGames: 0, spymasterWins: 0 };
      per.set(id, a);
    }
    return a;
  };

  const teamWins: Record<Team, number> = { red: 0, blue: 0 };
  let assassinGames = 0;

  // Longest run of consecutive wins per side, in the order games were recorded.
  const ordered = [...rounds]
    .filter((r) => gameIds.has(r.gameId))
    .sort((a, b) => a.createdAt - b.createdAt || a.index - b.index);
  const longestRun: Record<Team, number> = { red: 0, blue: 0 };
  let runTeam: Team | null = null;
  let runLen = 0;

  for (const r of ordered) {
    const input = r.input as CodenamesInput | undefined;
    if (!input?.teams || !isTeam(input.winner)) continue;

    const winner = input.winner;
    const byAssassin = input.ending === 'assassin';
    teamWins[winner] += 1;
    if (byAssassin) assassinGames += 1;

    // Track the running streak per side.
    if (runTeam === winner) runLen += 1;
    else {
      runTeam = winner;
      runLen = 1;
    }
    if (runLen > longestRun[winner]) longestRun[winner] = runLen;

    for (const [pid, team] of Object.entries(input.teams)) {
      if (!isTeam(team)) continue;
      const a = get(canonical(pid));
      if (team === winner) {
        if (!byAssassin) a.cleanWins += 1;
      } else if (byAssassin) {
        a.assassinLosses += 1;
      }
    }

    // Optional spymaster desks: credit whoever ran each side.
    const spies = input.spymasters;
    if (spies) {
      for (const side of ['red', 'blue'] as Team[]) {
        const pid = spies[side];
        if (pid == null) continue;
        const a = get(canonical(pid));
        a.spymasterGames += 1;
        if (side === winner) a.spymasterWins += 1;
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
    if (a.spymasterGames > 0) {
      metrics.push({
        key: 'cn_spymaster',
        label: 'Spymaster win rate',
        value: fmtPct(a.spymasterWins / a.spymasterGames),
        sub: `${fmtInt(a.spymasterWins)}/${fmtInt(a.spymasterGames)} as spymaster`,
        emoji: '🎙️',
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
  // Best win streak — surface the longer of the two sides' runs (min 2 to be a "streak").
  const bestStreakTeam: Team = longestRun.red >= longestRun.blue ? 'red' : 'blue';
  const bestStreak = longestRun[bestStreakTeam];
  if (bestStreak >= 2) {
    const meta = TEAM_META[bestStreakTeam];
    global.push({
      key: 'cn_streak',
      label: 'Longest win streak',
      value: `${meta.emoji} ${fmtInt(bestStreak)} in a row`,
      sub: `${meta.label} team’s best run`,
      emoji: '🔥',
    });
  }

  return { perPlayer, global };
}
