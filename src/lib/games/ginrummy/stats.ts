import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';
import { scoreHand, type GinRummyInput } from './logic';

interface GinRummyAgg {
  hands: number;
  gins: number;
  knocksWon: number;
  undercutsPulled: number;
  timesUndercut: number;
  bestMargin: number;
  gamesWon: number;
  shutoutsDealt: number;
}

function blank(): GinRummyAgg {
  return {
    hands: 0,
    gins: 0,
    knocksWon: 0,
    undercutsPulled: 0,
    timesUndercut: 0,
    bestMargin: 0,
    gamesWon: 0,
    shutoutsDealt: 0,
  };
}

/**
 * Gin Rummy stats, replayed purely from each game's recorded hands. Every hand
 * is re-scored from its own `input` via {@link scoreHand} rather than trusting
 * the stored deltas, so a settlement-bonus-laden final hand never muddies who
 * actually won it. No Svelte, no I/O.
 */
export function ginRummyStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const per = new Map<ID, GinRummyAgg>();
  const get = (id: ID): GinRummyAgg => {
    let a = per.get(id);
    if (!a) {
      a = blank();
      per.set(id, a);
    }
    return a;
  };

  let bestMarginAnywhere = 0;
  let totalGins = 0;

  for (const g of games) {
    const seats = g.playerIds.map((id) => ({ id }));
    if (seats.length !== 2) continue;
    const gameRounds = rounds.filter((r) => r.gameId === g.id).sort((a, b) => a.index - b.index);
    if (!gameRounds.length) continue;

    const rawTotals: Record<ID, number> = { [seats[0].id]: 0, [seats[1].id]: 0 };

    for (const r of gameRounds) {
      const input = r.input as GinRummyInput | undefined;
      const hand = scoreHand(input, seats, g.config);
      if (!hand) continue;

      rawTotals[hand.knockerId] = (rawTotals[hand.knockerId] ?? 0) + hand.deltas[hand.knockerId];
      rawTotals[hand.opponentId] =
        (rawTotals[hand.opponentId] ?? 0) + hand.deltas[hand.opponentId];

      const winner = hand.deltas[hand.knockerId] > 0 ? hand.knockerId : hand.opponentId;
      const loser = winner === hand.knockerId ? hand.opponentId : hand.knockerId;

      const wa = get(canonical(winner));
      wa.hands += 1;
      get(canonical(loser)).hands += 1;
      if (hand.margin > wa.bestMargin) wa.bestMargin = hand.margin;
      if (hand.margin > bestMarginAnywhere) bestMarginAnywhere = hand.margin;

      if (hand.outcome === 'gin') {
        wa.gins += 1;
        totalGins += 1;
      } else if (hand.outcome === 'knock') {
        wa.knocksWon += 1;
      } else {
        wa.undercutsPulled += 1;
        get(canonical(loser)).timesUndercut += 1;
      }
    }

    // The finish: whoever's hand-score total reached the target this game.
    const keys = Object.keys(rawTotals);
    if (keys.length < 2) continue;
    const [a, b] = keys;
    if (rawTotals[a] === rawTotals[b]) continue;
    const winnerKey = rawTotals[a] > rawTotals[b] ? a : b;
    const loserKey = winnerKey === a ? b : a;
    get(canonical(winnerKey)).gamesWon += 1;
    if (rawTotals[loserKey] === 0) get(canonical(winnerKey)).shutoutsDealt += 1;
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.gamesWon) {
      metrics.push({ key: 'gr_games', label: 'Games won', value: fmtInt(a.gamesWon), emoji: '\u{1F3C6}' });
    }
    if (a.gins) {
      metrics.push({
        key: 'gr_gins',
        label: 'Gins',
        value: fmtInt(a.gins),
        sub: a.hands ? `of ${a.hands} hands` : undefined,
        emoji: '\u{1F485}',
      });
    }
    if (a.knocksWon) {
      metrics.push({ key: 'gr_knocks', label: 'Knocks won', value: fmtInt(a.knocksWon), emoji: '\u{1F6AA}' });
    }
    if (a.undercutsPulled) {
      metrics.push({
        key: 'gr_undercuts',
        label: 'Undercuts pulled off',
        value: fmtInt(a.undercutsPulled),
        emoji: '\u{1F501}',
      });
    }
    if (a.timesUndercut) {
      metrics.push({
        key: 'gr_undercut_by',
        label: 'Times undercut',
        value: fmtInt(a.timesUndercut),
        emoji: '\u{1F62C}',
      });
    }
    if (a.bestMargin) {
      metrics.push({ key: 'gr_best', label: 'Best hand margin', value: fmtInt(a.bestMargin), emoji: '\u2728' });
    }
    if (a.shutoutsDealt) {
      metrics.push({
        key: 'gr_shutouts',
        label: 'Shutouts dealt',
        value: fmtInt(a.shutoutsDealt),
        emoji: '\u{1F9F9}',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (bestMarginAnywhere) {
    global.push({
      key: 'gr_best_all',
      label: 'Best hand margin',
      value: fmtInt(bestMarginAnywhere),
      emoji: '\u2728',
    });
  }
  if (totalGins) {
    global.push({ key: 'gr_gins_all', label: 'Gins', value: fmtInt(totalGins), emoji: '\u{1F485}' });
  }

  return { perPlayer, global };
}
