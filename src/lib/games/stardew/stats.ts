import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';
import {
  EVAL_CATEGORIES,
  MAX_CANDLES,
  candleTier,
  candleVerdict,
  clean,
  seasonPoints,
  type CategoryKey,
  type StardewSeasonInput,
} from './logic';

/**
 * Stardew stats are **cooperative**, so they read as one shared farm rather than
 * a per-player leaderboard: each game's seasons are summed into a single
 * Grandpa's Evaluation score, and the group's proudest results roll up into
 * global metrics. Deliberately contributes no `perPlayer` metrics — every seat
 * holds the identical total by design, so a per-player split would invent a
 * distinction the game does not have. Pure — mirrors the module's own
 * `seasonPoints`, no Svelte.
 */
export function stardewStats({ games, rounds }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const scoreByGame = new Map<ID, number>();
  const totals: Record<CategoryKey, number> = { bundles: 0, goals: 0, fish: 0, gold: 0 };
  let seasons = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as Partial<StardewSeasonInput> | undefined;
    scoreByGame.set(r.gameId, (scoreByGame.get(r.gameId) ?? 0) + seasonPoints(input));
    for (const c of EVAL_CATEGORIES) totals[c.key] += clean(input?.[c.key]);
    seasons += 1;
  }

  const global: Metric[] = [];
  const scores = [...scoreByGame.values()];
  if (scores.length) {
    const best = Math.max(...scores);
    const tier = candleTier(best);
    global.push({
      key: 'sv_best',
      label: 'Best evaluation',
      value: fmtInt(best),
      sub: `${'🕯️'.repeat(tier) || '—'} ${candleVerdict(tier)}`,
      emoji: '🕯️',
    });
    const perfect = scores.filter((s) => candleTier(s) >= MAX_CANDLES).length;
    if (perfect) {
      global.push({
        key: 'sv_perfect',
        label: 'Farms Grandpa beamed at',
        value: fmtInt(perfect),
        emoji: '🌟',
      });
    }
  }
  if (seasons)
    global.push({
      key: 'sv_seasons',
      label: 'Seasons farmed',
      value: fmtInt(seasons),
      emoji: '🍂',
    });
  if (totals.bundles)
    global.push({
      key: 'sv_bundles',
      label: 'Bundles restored',
      value: fmtInt(totals.bundles),
      emoji: '🎁',
    });
  if (totals.goals)
    global.push({
      key: 'sv_goals',
      label: "Grandpa's Goals met",
      value: fmtInt(totals.goals),
      emoji: '📜',
    });
  if (totals.fish)
    global.push({
      key: 'sv_fish',
      label: 'Legendary Fish',
      value: fmtInt(totals.fish),
      emoji: '🐟',
    });

  return { global };
}
