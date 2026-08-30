import type { ID } from '../../types';
import { CATEGORIES, UPPER_BONUS_THRESHOLD, YAHTZEE_BONUS, categoryForRound, type YahtzeeInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct } from '../../stats/format';

interface YahtzeeAgg {
  upperTotal: number;
  upperGames: number;
  upperBonuses: number;
  yahtzees: number;
  extraYahtzees: number;
  fullHouses: number;
  largeStraights: number;
  bestChance: number;
}

/**
 * Yahtzee stats, derived purely from each recorded category round. Pure — no Svelte —
 * so it's independently unit-testable and safe for the stats engine to import.
 */
export function yahtzeeStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, YahtzeeAgg>();
  const get = (id: ID): YahtzeeAgg => {
    let a = per.get(id);
    if (!a) {
      a = {
        upperTotal: 0,
        upperGames: 0,
        upperBonuses: 0,
        yahtzees: 0,
        extraYahtzees: 0,
        fullHouses: 0,
        largeStraights: 0,
        bestChance: 0,
      };
      per.set(id, a);
    }
    return a;
  };

  // Track each player's running upper-section subtotal per game so we can tell whether the
  // 63+ bonus landed once Sixes is scored.
  const upperRunning = new Map<string, Map<ID, number>>();

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const cat = categoryForRound(r.index);
    const input = r.input as YahtzeeInput | undefined;
    if (!cat || !input?.scores) continue;

    for (const [pid, rawScore] of Object.entries(input.scores)) {
      const id = canonical(pid);
      const a = get(id);
      const score = Number(rawScore) || 0;

      if (cat.section === 'upper') {
        let byGame = upperRunning.get(r.gameId);
        if (!byGame) {
          byGame = new Map();
          upperRunning.set(r.gameId, byGame);
        }
        const running = (byGame.get(id) ?? 0) + score;
        byGame.set(id, running);
        if (cat.id === 'sixes') {
          a.upperTotal += running;
          a.upperGames += 1;
          if (running >= UPPER_BONUS_THRESHOLD) a.upperBonuses += 1;
        }
      }

      if (cat.id === 'yahtzee' && score >= cat.fixedScore!) a.yahtzees += 1;
      if (cat.id === 'fullHouse' && score >= cat.fixedScore!) a.fullHouses += 1;
      if (cat.id === 'largeStraight' && score >= cat.fixedScore!) a.largeStraights += 1;
      if (cat.id === 'chance' && score > a.bestChance) a.bestChance = score;
    }

    if (cat.id === 'chance') {
      for (const [pid, extraRaw] of Object.entries(input.bonusYahtzees ?? {})) {
        const extra = Math.max(0, Math.trunc(Number(extraRaw) || 0));
        if (extra > 0) get(canonical(pid)).extraYahtzees += extra;
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.upperGames) {
      metrics.push({
        key: 'yz_bonus_rate',
        label: 'Upper bonus rate',
        value: fmtPct(a.upperBonuses / a.upperGames),
        emoji: '⬆️',
      });
      metrics.push({
        key: 'yz_upper_avg',
        label: 'Avg upper total',
        value: (a.upperTotal / a.upperGames).toFixed(1),
        emoji: '🔢',
      });
    }
    if (a.yahtzees) {
      metrics.push({ key: 'yz_yahtzees', label: 'Yahtzees rolled', value: fmtInt(a.yahtzees), emoji: '🎉' });
    }
    if (a.extraYahtzees) {
      metrics.push({
        key: 'yz_extra',
        label: 'Bonus Yahtzees',
        value: fmtInt(a.extraYahtzees),
        emoji: `+${YAHTZEE_BONUS}`,
      });
    }
    if (a.fullHouses) {
      metrics.push({ key: 'yz_fh', label: 'Full Houses', value: fmtInt(a.fullHouses), emoji: '🏠' });
    }
    if (a.largeStraights) {
      metrics.push({ key: 'yz_ls', label: 'Large Straights', value: fmtInt(a.largeStraights), emoji: '➰' });
    }
    if (a.bestChance) {
      metrics.push({ key: 'yz_chance', label: 'Best Chance roll', value: fmtInt(a.bestChance), emoji: '🍀' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  const totalYahtzees = [...per.values()].reduce((sum, a) => sum + a.yahtzees, 0);
  if (totalYahtzees) {
    global.push({ key: 'yz_total', label: 'Yahtzees rolled', value: fmtInt(totalYahtzees), emoji: '🎉' });
  }
  return { perPlayer, global };
}

// Re-exported purely so CATEGORIES stays a single source of truth for anything importing
// stats.ts directly (kept for symmetry with the other games' stats modules).
export { CATEGORIES };
