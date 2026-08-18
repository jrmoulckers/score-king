import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtAvg, fmtInt } from '../../stats/format';
import {
  breakdownTotal,
  readConfig,
  resolveMode,
  scoreDeal,
  skunkFor,
  unitFor,
  unitsFor,
  type CribbageInput,
} from './logic';

interface CribbageAgg {
  /** Hands counted (one per deal the member sat for). */
  hands: number;
  handPoints: number;
  bestHand: number;
  /** Hands that counted nothing at all. */
  zeroHands: number;
  /** Deals held as dealer, and the crib points taken across them. */
  deals: number;
  cribPoints: number;
  bestCrib: number;
  peggingPoints: number;
  heels: number;
  skunksDealt: number;
  skunked: number;
}

function blank(): CribbageAgg {
  return {
    hands: 0,
    handPoints: 0,
    bestHand: 0,
    zeroHands: 0,
    deals: 0,
    cribPoints: 0,
    bestCrib: 0,
    peggingPoints: 0,
    heels: 0,
    skunksDealt: 0,
    skunked: 0,
  };
}

/**
 * Cribbage stats, replayed purely from each game's recorded deals. Hand and crib
 * counts are personal in solo play and shared by a partnership (both partners
 * count the same unit result), exactly as the scoring does. Skunks are read from
 * each game's final standing against that game's own board length, so a short
 * 61-hole game is judged by its own skunk line. No Svelte, no I/O.
 */
export function cribbageStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const per = new Map<ID, CribbageAgg>();
  const get = (id: ID): CribbageAgg => {
    let a = per.get(id);
    if (!a) {
      a = blank();
      per.set(id, a);
    }
    return a;
  };

  let totalSkunks = 0;
  let totalDoubles = 0;
  let bestHandAnywhere = 0;

  for (const g of games) {
    const seats = g.playerIds.map((id) => ({ id }));
    if (!seats.length) continue;
    const cfg = readConfig(g.config);
    const units = unitsFor(seats, resolveMode(g.config, seats.length));
    const gameRounds = rounds.filter((r) => r.gameId === g.id).sort((a, b) => a.index - b.index);
    if (!gameRounds.length) continue;

    const finalScores: Record<string, number> = {};
    for (const u of units) finalScores[u.key] = 0;

    for (const r of gameRounds) {
      const input = r.input as CribbageInput | undefined;
      if (!input?.entries) continue;
      const results = scoreDeal(input, seats, g.config);
      const dealerUnit = unitFor(units, input.dealerId ?? null);

      for (const u of units) {
        const res = results[u.key];
        if (!res) continue;
        // The recorded ledger is the score of record, so the finish is read from
        // it rather than from the replay; a unit's members all carry its delta.
        finalScores[u.key] += Number(r.deltas?.[u.memberIds[0]]) || 0;
        const entry = input.entries[u.key];
        const cribCount = res.isDealer ? breakdownTotal(entry?.crib) : 0;

        for (const mid of u.memberIds) {
          const a = get(canonical(mid));
          a.hands += 1;
          a.handPoints += res.hand;
          a.peggingPoints += res.pegging;
          if (res.hand === 0) a.zeroHands += 1;
          if (res.hand > a.bestHand) a.bestHand = res.hand;
          if (res.isDealer) {
            a.deals += 1;
            a.cribPoints += cribCount;
            if (cribCount > a.bestCrib) a.bestCrib = cribCount;
          }
        }
        if (res.hand > bestHandAnywhere) bestHandAnywhere = res.hand;
      }

      // His heels is the individual dealer's two, not the whole unit's.
      if (input.heels && input.dealerId && dealerUnit) {
        get(canonical(input.dealerId)).heels += 1;
      }
    }

    // The finish: who got home, and how badly the trailing side was beaten.
    const keys = Object.keys(finalScores);
    if (keys.length < 2) continue;
    const winnerScore = Math.max(...keys.map((k) => finalScores[k]));
    if (winnerScore < cfg.target) continue;
    const loserKey = keys.reduce((lo, k) => (finalScores[k] < finalScores[lo] ? k : lo), keys[0]);
    const kind = skunkFor(finalScores[loserKey], cfg.target);
    if (kind === 'none') continue;

    totalSkunks += 1;
    if (kind === 'double') totalDoubles += 1;
    for (const u of units) {
      const won = finalScores[u.key] === winnerScore;
      for (const mid of u.memberIds) {
        const a = get(canonical(mid));
        if (won) a.skunksDealt += 1;
        else if (u.key === loserKey) a.skunked += 1;
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  let allHands = 0;
  let allHandPoints = 0;
  let allHeels = 0;

  for (const [id, a] of per) {
    allHands += a.hands;
    allHandPoints += a.handPoints;
    allHeels += a.heels;

    const metrics: Metric[] = [];
    if (a.hands) {
      metrics.push({
        key: 'cb_best',
        label: 'Best hand',
        value: fmtInt(a.bestHand),
        sub: a.bestHand >= 24 ? 'a monster' : undefined,
        emoji: '🃏',
      });
      metrics.push({
        key: 'cb_avg',
        label: 'Avg per hand',
        value: fmtAvg(a.handPoints / a.hands),
        emoji: '🔢',
      });
    }
    if (a.zeroHands) {
      metrics.push({
        key: 'cb_zero',
        label: 'Hands worth nothing',
        value: fmtInt(a.zeroHands),
        emoji: '🫥',
      });
    }
    if (a.cribPoints) {
      metrics.push({
        key: 'cb_crib',
        label: 'Crib points',
        value: fmtInt(a.cribPoints),
        sub: a.deals ? `over ${a.deals} deal${a.deals === 1 ? '' : 's'}` : undefined,
        emoji: '🂠',
      });
    }
    if (a.peggingPoints) {
      metrics.push({
        key: 'cb_peg',
        label: 'Pegged in play',
        value: fmtInt(a.peggingPoints),
        emoji: '📌',
      });
    }
    if (a.heels) {
      metrics.push({ key: 'cb_heels', label: 'His heels', value: fmtInt(a.heels), emoji: '🂻' });
    }
    if (a.skunksDealt) {
      metrics.push({
        key: 'cb_skunks',
        label: 'Skunks dealt out',
        value: fmtInt(a.skunksDealt),
        emoji: '🦨',
      });
    }
    if (a.skunked) {
      metrics.push({
        key: 'cb_skunked',
        label: 'Times skunked',
        value: fmtInt(a.skunked),
        emoji: '😬',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (bestHandAnywhere) {
    global.push({
      key: 'cb_best_all',
      label: 'Best hand counted',
      value: fmtInt(bestHandAnywhere),
      emoji: '🃏',
    });
  }
  if (allHands) {
    global.push({
      key: 'cb_avg_all',
      label: 'Avg per hand',
      value: fmtAvg(allHandPoints / allHands),
      emoji: '🔢',
    });
  }
  if (allHeels) {
    global.push({ key: 'cb_heels_all', label: 'His heels', value: fmtInt(allHeels), emoji: '🂻' });
  }
  if (totalSkunks) {
    global.push({
      key: 'cb_skunks_all',
      label: 'Skunks',
      value: fmtInt(totalSkunks),
      sub: totalDoubles ? `${totalDoubles} double` : undefined,
      emoji: '🦨',
    });
  }

  return { perPlayer, global };
}
