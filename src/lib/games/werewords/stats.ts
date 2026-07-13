import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtPct } from '../../stats/format';
import { resolveOutcome, teamOf, type WerewordsInput } from './logic';

interface WWAgg {
  played: number;
  won: number;
  wolfGames: number;
  wolfWins: number;
  mayor: number;
  mayorCracked: number;
  seer: number;
}

/**
 * Werewords stats, derived purely from each round's recorded roles + outcome via the
 * module's own {@link resolveOutcome}. A player "won" a round when their side (Village
 * unless they were tapped as a werewolf) took it. Pure — no Svelte, no I/O — so it is
 * independently unit-testable and safe for the stats engine to import.
 */
export function werewordsStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const roster = new Map<string, ID[]>();
  for (const g of games) roster.set(g.id, g.playerIds);

  const per = new Map<ID, WWAgg>();
  const get = (id: ID): WWAgg => {
    let a = per.get(id);
    if (!a) {
      a = { played: 0, won: 0, wolfGames: 0, wolfWins: 0, mayor: 0, mayorCracked: 0, seer: 0 };
      per.set(id, a);
    }
    return a;
  };

  let totalRounds = 0;
  let guessedRounds = 0;
  let wolfTeamWins = 0;

  for (const r of rounds) {
    const playerIds = roster.get(r.gameId);
    if (!playerIds) continue;
    const input = r.input as WerewordsInput | undefined;
    if (!input || !Array.isArray(input.werewolves)) continue;

    const winner = resolveOutcome(input).team;
    totalRounds += 1;
    if (input.guessed) guessedRounds += 1;
    if (winner === 'werewolf') wolfTeamWins += 1;

    for (const pid of playerIds) {
      const a = get(canonical(pid));
      a.played += 1;
      const side = teamOf(input, pid);
      if (side === winner) a.won += 1;
      if (side === 'werewolf') {
        a.wolfGames += 1;
        if (winner === 'werewolf') a.wolfWins += 1;
      }
    }
    if (input.mayor) {
      const m = get(canonical(input.mayor));
      m.mayor += 1;
      if (input.guessed) m.mayorCracked += 1;
    }
    if (input.seer) get(canonical(input.seer)).seer += 1;
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.played) {
      metrics.push({ key: 'ww_win', label: 'Round win rate', value: fmtPct(a.won / a.played), emoji: '🏆' });
    }
    if (a.wolfGames) {
      metrics.push({ key: 'ww_wolf', label: 'As werewolf', value: `${a.wolfWins}/${a.wolfGames}`, emoji: '🐺' });
    }
    if (a.mayor) {
      metrics.push({ key: 'ww_mayor', label: 'Mayor rounds', value: `${a.mayor}`, emoji: '👑' });
      metrics.push({
        key: 'ww_mayor_cracked',
        label: 'Cracked as Mayor',
        value: `${a.mayorCracked}/${a.mayor}`,
        emoji: '🧩',
      });
    }
    if (a.seer) {
      metrics.push({ key: 'ww_seer', label: 'Seer rounds', value: `${a.seer}`, emoji: '🔮' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totalRounds) {
    global.push({ key: 'ww_cracked', label: 'Words cracked', value: fmtPct(guessedRounds / totalRounds), emoji: '🧩' });
    global.push({ key: 'ww_wolves', label: 'Werewolf wins', value: fmtPct(wolfTeamWins / totalRounds), emoji: '🐺' });
  }
  return { perPlayer, global };
}
