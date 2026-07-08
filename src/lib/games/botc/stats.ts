import type { ID, Round } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtPct } from '../../stats/format';
import type { BotcInput } from './logic';

interface BotcAgg {
  games: number;
  evil: number;
  good: number;
  executed: number;
  survived: number;
}

/**
 * Blood on the Clocktower stats over finished games. Reads each phase's recorded
 * roster + nominations — pure, no abilities inferred. The winning team comes from
 * the phase that carries a `result`; team/survival come from the final roster.
 */
export function botcStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const byGame = new Map<ID, Round[]>();
  const gameIds = new Set(games.map((g) => g.id));
  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const arr = byGame.get(r.gameId);
    if (arr) arr.push(r);
    else byGame.set(r.gameId, [r]);
  }

  const per = new Map<ID, BotcAgg>();
  const agg = (id: ID): BotcAgg => {
    let a = per.get(id);
    if (!a) {
      a = { games: 0, evil: 0, good: 0, executed: 0, survived: 0 };
      per.set(id, a);
    }
    return a;
  };

  let goodWins = 0;
  let evilWins = 0;
  let totalPhases = 0;
  let counted = 0;

  for (const g of games) {
    const gr = (byGame.get(g.id) ?? []).slice().sort((a, b) => a.index - b.index);
    if (gr.length === 0) continue;
    counted += 1;
    totalPhases += gr.length;

    const result = gr.map((r) => (r.input as BotcInput | undefined)?.result).find(Boolean) ?? null;
    if (result === 'good') goodWins += 1;
    else if (result === 'evil') evilWins += 1;

    const finalStates = (gr[gr.length - 1].input as BotcInput | undefined)?.states ?? {};
    for (const [pid, st] of Object.entries(finalStates)) {
      const a = agg(canonical(pid));
      a.games += 1;
      if (st.team === 'evil') a.evil += 1;
      else a.good += 1;
      if (st.alive) a.survived += 1;
    }

    for (const r of gr) {
      const noms = (r.input as BotcInput | undefined)?.nominations ?? [];
      for (const nom of noms) {
        if (nom.executed && nom.nomineeId) agg(canonical(nom.nomineeId)).executed += 1;
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.evil) metrics.push({ key: 'botc_evil', label: 'Games as Evil', value: `${a.evil}`, emoji: '😈' });
    if (a.executed) metrics.push({ key: 'botc_exec', label: 'Times executed', value: `${a.executed}`, emoji: '⚰️' });
    if (a.games) {
      metrics.push({ key: 'botc_survive', label: 'Survived to the end', value: fmtPct(a.survived / a.games), emoji: '🕯️' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (goodWins || evilWins) {
    const lead = goodWins === evilWins ? 'Even' : goodWins > evilWins ? 'Good leads' : 'Evil leads';
    global.push({ key: 'botc_split', label: 'Good vs Evil wins', value: `${goodWins}–${evilWins}`, sub: lead, emoji: '⚖️' });
  }
  if (counted) {
    global.push({ key: 'botc_len', label: 'Avg game length', value: `${fmtAvg(totalPhases / counted)} phases`, emoji: '🕒' });
  }

  return { perPlayer, global };
}
