import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt } from '../../stats/format';
import {
  BINGO_BONUS,
  finalTallySwing,
  isFinalTally,
  isTurn,
  turnTotal,
  type ScrabbleInput,
} from './logic';

interface ScrabbleAgg {
  turns: number;
  points: number;
  bestTurn: number;
  bingos: number;
  finishes: number;
  rackSwing: number;
}

function blank(): ScrabbleAgg {
  return { turns: 0, points: 0, bestTurn: 0, bingos: 0, finishes: 0, rackSwing: 0 };
}

/**
 * Scrabble stats, replayed purely from each game's recorded turns and its final tally.
 * Pure, no I/O — mirrors the module's own scoring so a member's best turn and bingo
 * count always match what the recorded rounds actually paid out.
 */
export function scrabbleStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, ScrabbleAgg>();
  const get = (id: ID): ScrabbleAgg => {
    let a = per.get(id);
    if (!a) {
      a = blank();
      per.set(id, a);
    }
    return a;
  };

  let bestTurnAnywhere = 0;
  let totalBingos = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as ScrabbleInput | undefined;
    if (!input) continue;

    if (isTurn(input)) {
      if (!input.playerId) continue;
      const id = canonical(input.playerId);
      const a = get(id);
      const total = turnTotal(input);
      a.turns += 1;
      a.points += total;
      if (total > a.bestTurn) a.bestTurn = total;
      if (total > bestTurnAnywhere) bestTurnAnywhere = total;
      if (input.bingo) {
        a.bingos += 1;
        totalBingos += 1;
      }
      continue;
    }

    if (isFinalTally(input) && input.finisherId) {
      const game = games.find((g) => g.id === r.gameId);
      const playerIds = game?.playerIds ?? Object.keys(input.remaining ?? {});
      const swing = finalTallySwing(input, playerIds);
      const a = get(canonical(input.finisherId));
      a.finishes += 1;
      a.rackSwing += swing;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let allTurns = 0;
  let allPoints = 0;

  for (const [id, a] of per) {
    allTurns += a.turns;
    allPoints += a.points;

    const metrics: Metric[] = [];
    if (a.turns) {
      metrics.push({
        key: 'sc_best',
        label: 'Best turn',
        value: fmtInt(a.bestTurn),
        sub: a.bestTurn >= BINGO_BONUS ? 'a monster word' : undefined,
        emoji: '🔤',
      });
      metrics.push({
        key: 'sc_avg',
        label: 'Avg per turn',
        value: fmtAvg(a.points / a.turns),
        emoji: '🔢',
      });
    }
    if (a.bingos) {
      metrics.push({ key: 'sc_bingo', label: 'Bingos', value: fmtInt(a.bingos), emoji: '🎉' });
    }
    if (a.finishes) {
      metrics.push({
        key: 'sc_finish',
        label: 'Games gone out first',
        value: fmtInt(a.finishes),
        sub: a.rackSwing ? `+${fmtInt(a.rackSwing)} from racks` : undefined,
        emoji: '🏁',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (bestTurnAnywhere) {
    global.push({
      key: 'sc_best_all',
      label: 'Best turn recorded',
      value: fmtInt(bestTurnAnywhere),
      emoji: '🔤',
    });
  }
  if (allTurns) {
    global.push({
      key: 'sc_avg_all',
      label: 'Avg per turn',
      value: fmtAvg(allPoints / allTurns),
      emoji: '🔢',
    });
  }
  if (totalBingos) {
    global.push({ key: 'sc_bingo_all', label: 'Bingos played', value: fmtInt(totalBingos), emoji: '🎉' });
  }

  return { perPlayer, global };
}
