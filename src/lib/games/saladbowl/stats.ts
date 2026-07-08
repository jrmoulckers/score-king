import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';
import { makeTeams, teamCount, wordsFor, type SaladBowlInput } from './logic';

interface SBAgg {
  words: number; // words this member's teams pulled from the bowl
  rounds: number; // team-rounds the member took part in
  best: number; // best single-round haul by one of their teams
}

/**
 * Salad Bowl stats from each round's recorded per-team words. Teams are
 * reconstructed purely from the game's saved config + player order (the same
 * `makeTeams` the module scores with), so a member's tally is their team's tally —
 * "words your teams pulled from the bowl". Pure & Svelte-free, safe for the engine.
 */
export function saladbowlStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameById = new Map(games.map((g) => [g.id, g]));
  const teamsByGame = new Map(
    games.map((g) => [g.id, makeTeams(g.playerIds, teamCount(g.config))] as const),
  );

  const per = new Map<ID, SBAgg>();
  const get = (id: ID): SBAgg => {
    let a = per.get(id);
    if (!a) {
      a = { words: 0, rounds: 0, best: 0 };
      per.set(id, a);
    }
    return a;
  };

  let totalWords = 0;
  let biggest = 0;

  for (const r of rounds) {
    const g = gameById.get(r.gameId);
    if (!g) continue;
    const teams = teamsByGame.get(g.id) ?? [];
    const input = r.input as SaladBowlInput | undefined;
    if (!input || !Array.isArray(input.guessed)) continue;
    for (const t of teams) {
      const w = wordsFor(input, t.index);
      totalWords += w;
      if (w > biggest) biggest = w;
      for (const pid of t.playerIds) {
        const a = get(canonical(pid));
        a.words += w;
        a.rounds += 1;
        if (w > a.best) a.best = w;
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.words) {
      metrics.push({ key: 'sb_words', label: 'Words guessed', value: fmtInt(a.words), emoji: '🥗' });
    }
    if (a.best) {
      metrics.push({ key: 'sb_best', label: 'Best round', value: fmtInt(a.best), emoji: '🔥' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totalWords) {
    global.push({ key: 'sb_words_all', label: 'Words from the bowl', value: fmtInt(totalWords), emoji: '🥗' });
  }
  if (biggest) {
    global.push({ key: 'sb_best_all', label: 'Biggest round haul', value: fmtInt(biggest), emoji: '🔥' });
  }
  return { perPlayer, global };
}
