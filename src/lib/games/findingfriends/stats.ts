import type { ID } from '../../types';
import type { FindingFriendsInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct } from '../../stats/format';

interface FfAgg {
  /** Deals this player banked (was named a declarer). */
  banked: number;
  /** Banked deals that held (declarers gained levels). */
  held: number;
  /** Deals this player attacked (was named a challenger). */
  attacked: number;
  /** Attacking deals that broke through (challengers gained levels). */
  brokeThrough: number;
  /** Shutout deals (0 points captured) this player's declaring side pulled off. */
  shutouts: number;
}

/**
 * Finding Friends stats, derived purely from each deal's recorded sides + deltas. Pure — no
 * Svelte — so it's unit-testable and safe for the stats engine to import. Every named player
 * on a deal (whichever side) is credited for that deal, mirroring how the roster itself can
 * shift from one deal to the next.
 */
export function findingFriendsStats({
  games,
  rounds,
  canonical,
}: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, FfAgg>();
  const get = (id: ID): FfAgg => {
    let a = per.get(id);
    if (!a) {
      a = { banked: 0, held: 0, attacked: 0, brokeThrough: 0, shutouts: 0 };
      per.set(id, a);
    }
    return a;
  };

  let deals = 0;
  let holds = 0;
  let breakthroughs = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as FindingFriendsInput | undefined;
    if (!input?.declarers || input.pointsCaptured == null) continue;

    const declarerPts = Math.max(0, ...input.declarers.map((id) => r.deltas?.[id] ?? 0));
    const challengerPts = Math.max(0, ...input.challengers.map((id) => r.deltas?.[id] ?? 0));
    const declarersHeld = declarerPts > 0;
    const challengersBroke = challengerPts > 0;

    deals += 1;
    if (declarersHeld) holds += 1;
    if (challengersBroke) breakthroughs += 1;

    for (const pid of input.declarers) {
      const a = get(canonical(pid));
      a.banked += 1;
      if (declarersHeld) a.held += 1;
      if (input.pointsCaptured === 0) a.shutouts += 1;
    }
    for (const pid of input.challengers) {
      const a = get(canonical(pid));
      a.attacked += 1;
      if (challengersBroke) a.brokeThrough += 1;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.banked) {
      metrics.push({
        key: 'ff_hold',
        label: 'Bank hold rate',
        value: fmtPct(a.held / a.banked),
        sub: `${a.held}/${a.banked}`,
        emoji: '🛡️',
      });
    }
    if (a.shutouts) {
      metrics.push({
        key: 'ff_shutout',
        label: 'Shutouts',
        value: fmtInt(a.shutouts),
        emoji: '🧹',
      });
    }
    if (a.attacked) {
      metrics.push({
        key: 'ff_break',
        label: 'Breakthrough rate',
        value: fmtPct(a.brokeThrough / a.attacked),
        sub: `${a.brokeThrough}/${a.attacked}`,
        emoji: '⚔️',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (deals) {
    global.push({
      key: 'ff_hold_all',
      label: 'Bank hold rate',
      value: fmtPct(holds / deals),
      emoji: '🛡️',
    });
    global.push({
      key: 'ff_break_all',
      label: 'Breakthrough rate',
      value: fmtPct(breakthroughs / deals),
      emoji: '⚔️',
    });
  }

  return { perPlayer, global };
}
