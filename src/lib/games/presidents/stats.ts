import type { ID } from '../../types';
import { titleFor, type PresidentsInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt, fmtPct } from '../../stats/format';

interface PresidentsAgg {
  rounds: number;
  posSum: number;
  presidencies: number;
  scums: number;
  best: number;
}

/**
 * Presidents stats, derived purely from each round's recorded finishing
 * positions. A presidency is finishing 1st; a scum stretch is finishing last.
 * Average finish is the mean spot across every round a player was ranked in.
 * Pure — no Svelte — so it's unit-testable and safe for the stats engine to
 * import.
 */
export function presidentsStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, PresidentsAgg>();
  const get = (id: ID): PresidentsAgg => {
    let a = per.get(id);
    if (!a) {
      a = { rounds: 0, posSum: 0, presidencies: 0, scums: 0, best: Infinity };
      per.set(id, a);
    }
    return a;
  };

  let roundsPlayed = 0;
  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as PresidentsInput | undefined;
    if (!input?.positions) continue;
    const n = Object.keys(input.positions).length;
    if (!n) continue;
    roundsPlayed += 1;
    for (const [pid, raw] of Object.entries(input.positions)) {
      const pos = Math.floor(Number(raw) || 0);
      if (pos < 1 || pos > n) continue;
      const a = get(canonical(pid));
      a.rounds += 1;
      a.posSum += pos;
      if (titleFor(pos, n).tier === 'president') a.presidencies += 1;
      if (titleFor(pos, n).tier === 'scum') a.scums += 1;
      if (pos < a.best) a.best = pos;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let totPresidencies = 0;
  for (const [id, a] of per) {
    totPresidencies += a.presidencies;
    if (!a.rounds) continue;
    const metrics: Metric[] = [
      { key: 'p_avg', label: 'Avg finish', value: fmtAvg(a.posSum / a.rounds), emoji: '📊' },
    ];
    if (a.presidencies) {
      metrics.push({
        key: 'p_pres',
        label: 'Presidencies',
        value: fmtInt(a.presidencies),
        emoji: '👑',
      });
    }
    metrics.push({
      key: 'p_pres_rate',
      label: 'President rate',
      value: fmtPct(a.presidencies / a.rounds),
      emoji: '🎖️',
    });
    if (a.scums) {
      metrics.push({ key: 'p_scum', label: 'Times Scum', value: fmtInt(a.scums), emoji: '💩' });
    }
    perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (roundsPlayed) {
    global.push({ key: 'p_rounds', label: 'Rounds played', value: fmtInt(roundsPlayed), emoji: '🃏' });
  }
  if (totPresidencies) {
    global.push({
      key: 'p_pres_all',
      label: 'Presidencies handed out',
      value: fmtInt(totPresidencies),
      emoji: '👑',
    });
  }
  return { perPlayer, global };
}
