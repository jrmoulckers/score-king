import type { ID } from '../types';
import type { StatsResult } from './types';

/**
 * Court view-model: the group-facing derivations that need real logic (reigning
 * Kings, the Iron Throne, rivalry spotlight, parity, a light Wall of Shame). Pure
 * and id-only — names, emoji and Crown Gold styling are the component's job. The
 * plain leaderboard / records / totals are read straight off {@link StatsResult}.
 */

/** Who reigns over a single game right now (most wins, then win rate). */
export interface GameKing {
  gameType: string;
  holderId: ID;
  wins: number;
  winRate: number;
  games: number;
}

export interface Throne {
  /** Top of the overall leaderboard — the reigning monarch. */
  overallId?: ID;
  overallWins: number;
  overallWinRate: number;
  /** Longest *active* win streak in the group (the belt), if anyone is on one. */
  ironThroneId?: ID;
  ironThroneStreak: number;
  /** Reigning King of each game played, most-contested game first. */
  kings: GameKing[];
}

export interface RivalryCard {
  aId: ID;
  bId: ID;
  games: number;
  aWins: number;
  bWins: number;
  ties: number;
  /** 1 = dead even, 0 = one-sided. */
  closeness: number;
}

export interface CourtShame {
  /** Lowest win rate among members with enough games — the current cold spell. */
  coldestId?: ID;
  coldestWinRate?: number;
  /** Members who have finished games but are still chasing a first win. */
  winlessIds: ID[];
}

export interface CourtView {
  throne: Throne;
  hottestRivalry?: RivalryCard;
  biggestMismatch?: RivalryCard;
  /** 0..1 — normalized entropy of wins; 1 = perfectly even, →0 = one player dominates. */
  parity: number;
  shame: CourtShame;
}

export interface CourtOptions {
  /** Minimum games before a member can hold a game crown. Default 2. */
  minGamesForKing?: number;
  /** Minimum co-games before a pair counts as a rivalry / mismatch. Default 3. */
  minGamesForRivalry?: number;
  /** Minimum games before a member is eligible for "coldest". Default 3. */
  minGamesForShame?: number;
}

const pairKey = (a: ID, b: ID): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Reigning King of each game + the overall monarch and the Iron Throne (belt). */
export function reigningKings(result: StatsResult, opts: CourtOptions = {}): Throne {
  const minGames = opts.minGamesForKing ?? 2;
  const top = result.leaderboard[0];

  // Longest active streak in the group.
  let ironThroneId: ID | undefined;
  let ironThroneStreak = 0;
  for (const m of Object.values(result.perPlayer)) {
    if (m.currentStreak > ironThroneStreak) {
      ironThroneStreak = m.currentStreak;
      ironThroneId = m.playerId;
    }
  }

  // Best record per game type: a King must have won at least once and cleared the
  // games floor, so a single lucky game doesn't crown anyone.
  const best = new Map<string, GameKing>();
  const contested = new Map<string, number>();
  for (const m of Object.values(result.perPlayer)) {
    for (const [type, bt] of Object.entries(m.byGameType)) {
      contested.set(type, (contested.get(type) ?? 0) + bt.played);
      if (bt.wins < 1 || bt.played < minGames) continue;
      const cur = best.get(type);
      if (!cur || bt.wins > cur.wins || (bt.wins === cur.wins && bt.winRate > cur.winRate)) {
        best.set(type, {
          gameType: type,
          holderId: m.playerId,
          wins: bt.wins,
          winRate: bt.winRate,
          games: bt.played,
        });
      }
    }
  }

  const kings = [...best.values()].sort(
    (a, b) => (contested.get(b.gameType) ?? 0) - (contested.get(a.gameType) ?? 0),
  );

  return {
    overallId: top?.playerId,
    overallWins: top?.wins ?? 0,
    overallWinRate: top?.winRate ?? 0,
    ironThroneId,
    ironThroneStreak,
    kings,
  };
}

/** Every unique co-playing pair as a rivalry card (deduped, self-pairs dropped). */
export function rivalryCards(result: StatsResult): RivalryCard[] {
  const seen = new Map<string, RivalryCard>();
  for (const m of Object.values(result.perPlayer)) {
    for (const h of Object.values(m.headToHead)) {
      if (h.opponentId === m.playerId || h.games <= 0) continue;
      const key = pairKey(m.playerId, h.opponentId);
      if (seen.has(key)) continue;
      const a = m.playerId < h.opponentId ? m.playerId : h.opponentId;
      const b = m.playerId < h.opponentId ? h.opponentId : m.playerId;
      // Orient wins/losses from a's perspective.
      const aWins = a === m.playerId ? h.wins : h.losses;
      const bWins = a === m.playerId ? h.losses : h.wins;
      const closeness = h.games > 0 ? 1 - Math.abs(aWins - bWins) / h.games : 0;
      seen.set(key, { aId: a, bId: b, games: h.games, aWins, bWins, ties: h.ties, closeness });
    }
  }
  return [...seen.values()];
}

/** Hottest rivalry (most games, then closest) and biggest mismatch (most lopsided). */
export function rivalrySpotlight(
  result: StatsResult,
  opts: CourtOptions = {},
): { hottest?: RivalryCard; mismatch?: RivalryCard } {
  const minGames = opts.minGamesForRivalry ?? 3;
  const cards = rivalryCards(result).filter((c) => c.games >= minGames);
  if (cards.length === 0) return {};

  const hottest = [...cards].sort(
    (a, b) => b.games - a.games || b.closeness - a.closeness,
  )[0];
  const mismatch = [...cards].sort(
    (a, b) => a.closeness - b.closeness || b.games - a.games,
  )[0];
  return { hottest, mismatch: mismatch.closeness < 1 ? mismatch : undefined };
}

/**
 * Competitiveness of the group as normalized Shannon entropy of wins across
 * everyone who has played: 1 = wins spread perfectly evenly, →0 = one player
 * hoards them. Undefined participation collapses to 1 (nothing to see yet).
 */
export function parityIndex(result: StatsResult): number {
  const players = result.leaderboard.filter((r) => r.played > 0);
  const n = players.length;
  if (n <= 1) return 1;
  const totalWins = players.reduce((s, r) => s + r.wins, 0);
  if (totalWins <= 0) return 1;
  let h = 0;
  for (const r of players) {
    if (r.wins <= 0) continue;
    const p = r.wins / totalWins;
    h -= p * Math.log(p);
  }
  return h / Math.log(n);
}

/** A gentle Wall of Shame: the current cold spell and who's still hunting a first win. */
export function wallOfShame(result: StatsResult, opts: CourtOptions = {}): CourtShame {
  const minGames = opts.minGamesForShame ?? 3;
  let coldestId: ID | undefined;
  let coldestWinRate: number | undefined;
  const winlessIds: ID[] = [];
  for (const r of result.leaderboard) {
    if (r.played <= 0) continue;
    if (r.wins === 0) winlessIds.push(r.playerId);
    if (r.played >= minGames && (coldestWinRate === undefined || r.winRate < coldestWinRate)) {
      coldestWinRate = r.winRate;
      coldestId = r.playerId;
    }
  }
  return { coldestId, coldestWinRate, winlessIds };
}

/** One pass over an all-players {@link StatsResult} → the whole Court view-model. */
export function buildCourt(result: StatsResult, opts: CourtOptions = {}): CourtView {
  const { hottest, mismatch } = rivalrySpotlight(result, opts);
  return {
    throne: reigningKings(result, opts),
    hottestRivalry: hottest,
    biggestMismatch: mismatch,
    parity: parityIndex(result),
    shame: wallOfShame(result, opts),
  };
}
