import type { ID, Round } from '../../types';
import type { Phase10Input } from './logic';
import { PHASE_COUNT, hasWon, phasesAfter } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';

interface Phase10Agg {
  /** Hands this player advanced a phase. */
  advances: number;
  /** Hands this player took part in. */
  hands: number;
  /** Total penalty points scored across hands. */
  penalty: number;
  /** Games where this player cleared Phase 10 (may include ties). */
  clears: number;
  /** Highest phase this player ever reached. */
  bestPhase: number;
}

/**
 * Phase 10 stats replay each finished game's hand history to find how far every
 * player climbed the phase ladder — mirroring the module's own phase-progress
 * logic (see `phasesAfter`) so stats and live play never disagree.
 */
export function phase10Stats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const roundsByGame = new Map<ID, Round[]>();
  for (const r of rounds) {
    if (!roundsByGame.has(r.gameId)) roundsByGame.set(r.gameId, []);
    roundsByGame.get(r.gameId)!.push(r);
  }

  const per = new Map<ID, Phase10Agg>();
  const get = (id: ID): Phase10Agg => {
    let a = per.get(id);
    if (!a) {
      a = { advances: 0, hands: 0, penalty: 0, clears: 0, bestPhase: 1 };
      per.set(id, a);
    }
    return a;
  };

  let totalClears = 0;

  for (const g of games) {
    const gRounds = roundsByGame.get(g.id) ?? [];
    const playerIds = g.playerIds.map((id) => canonical(id));
    for (const r of gRounds) {
      const input = r.input as Phase10Input | undefined;
      if (!input?.completed) continue;
      for (const pid of g.playerIds) {
        const id = canonical(pid);
        const a = get(id);
        a.hands += 1;
        if (input.completed[pid]) a.advances += 1;
        a.penalty += Math.max(0, Number(input.penalty?.[pid]) || 0);
      }
    }
    const phases = phasesAfter(gRounds, playerIds);
    for (const id of playerIds) {
      const a = get(id);
      const phase = phases[id] ?? 1;
      const capped = Math.min(phase, PHASE_COUNT);
      if (capped > a.bestPhase) a.bestPhase = capped;
      if (hasWon(phase)) {
        a.clears += 1;
        totalClears += 1;
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.clears) {
      metrics.push({
        key: 'p10_clears',
        label: 'Phase 10 completed',
        value: fmtInt(a.clears),
        emoji: '🔟',
      });
    }
    if (a.bestPhase) {
      metrics.push({
        key: 'p10_best',
        label: 'Best phase reached',
        value: `Phase ${a.bestPhase}`,
        emoji: '🪜',
      });
    }
    if (a.advances) {
      metrics.push({
        key: 'p10_advances',
        label: 'Hands advanced',
        value: fmtInt(a.advances),
        emoji: '✅',
      });
    }
    if (a.penalty) {
      metrics.push({
        key: 'p10_penalty',
        label: 'Penalty points caught holding',
        value: fmtInt(a.penalty),
        emoji: '🃏',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (totalClears) {
    global.push({
      key: 'p10_clears_all',
      label: 'Times Phase 10 was cleared',
      value: fmtInt(totalClears),
      emoji: '🔟',
    });
  }

  return { perPlayer, global };
}
