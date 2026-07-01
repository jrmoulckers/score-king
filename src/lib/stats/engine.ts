import type { Game, ID, Player, Round } from '../types';
import { buildAliasMap, canonicalizer } from './identity';
import { computeGameFacts, gameTime, type GameFacts } from './facts';
import { dayKey } from './format';
import type {
  ByGameType,
  DateRange,
  GameRecord,
  GameSpecificStats,
  GameStatsHook,
  HeadToHead,
  LeaderRow,
  MemberStats,
  Metric,
  StatsData,
  StatsQuery,
  StatsResult,
} from './types';

export interface ComputeOptions {
  /**
   * Resolve a game module's stats hook by type. Injected (rather than imported)
   * so the engine never pulls in Svelte game modules and stays unit-testable.
   * In the app: `(type) => getModule(type)?.stats`.
   */
  gameStats?: (type: string) => GameStatsHook | undefined;
}

function inRange(t: number, range?: DateRange): boolean {
  if (!range) return true;
  if (range.from !== undefined && t < range.from) return false;
  if (range.to !== undefined && t > range.to) return false;
  return true;
}

/** Mutable per-member accumulator; finalized into {@link MemberStats}. */
interface Acc {
  playerId: ID;
  played: number;
  wins: number;
  podiums: number;
  rankSum: number;
  rankSqSum: number;
  bestFinish: number;
  points: number;
  rounds: number;
  byGameType: Record<string, ByGameType>;
  h2h: Record<ID, HeadToHead>;
  comebackWins: number;
  wireToWireWins: number;
  closeGames: number;
  closeWins: number;
  bestWinMargin?: number;
  closestWinMargin?: number;
  nights: Set<string>;
  firstPlayedAt: number;
  lastPlayedAt: number;
  lastWinAt?: number;
  // streaks
  run: number;
  longest: number;
}

function newAcc(id: ID): Acc {
  return {
    playerId: id,
    played: 0,
    wins: 0,
    podiums: 0,
    rankSum: 0,
    rankSqSum: 0,
    bestFinish: Infinity,
    points: 0,
    rounds: 0,
    byGameType: {},
    h2h: {},
    comebackWins: 0,
    wireToWireWins: 0,
    closeGames: 0,
    closeWins: 0,
    nights: new Set(),
    firstPlayedAt: Infinity,
    lastPlayedAt: -Infinity,
    run: 0,
    longest: 0,
  };
}

function h2hRow(acc: Acc, opp: ID): HeadToHead {
  let row = acc.h2h[opp];
  if (!row) {
    row = { opponentId: opp, games: 0, wins: 0, losses: 0, ties: 0 };
    acc.h2h[opp] = row;
  }
  return row;
}

export function computeStats(
  data: StatsData,
  query: StatsQuery = {},
  options: ComputeOptions = {},
): StatsResult {
  const canonical = canonicalizer(buildAliasMap(data.players));

  // Canonical player directory (skip rows that are merged away). No synthesis:
  // the engine returns only real Member records and leaves display name/color to
  // the UI, which resolves them from the live players store.
  const playerById = new Map<ID, Player>();
  for (const p of data.players) if (canonical(p.id) === p.id) playerById.set(p.id, p);

  const typeOk = (g: Game) => !query.gameType || g.type === query.gameType;
  const inRangeType = (g: Game) => typeOk(g) && inRange(gameTime(g), query.range);
  // Abandoned games (started but called off) have no winner, so they never enter
  // standings/wins; by default they're left out of volume counts too.
  // `includeAbandoned` keeps them in the games total as a "started but not
  // finished" tally — they still never become `finished`.
  const abandoned = data.games.filter((g) => inRangeType(g) && g.status === 'abandoned');
  const inWindow = data.games.filter(
    (g) => inRangeType(g) && (query.includeAbandoned || g.status !== 'abandoned'),
  );
  const finished = inWindow
    .filter((g) => g.status === 'finished')
    .sort((a, b) => gameTime(a) - gameTime(b) || a.createdAt - b.createdAt);

  const roundsByGame = new Map<ID, Round[]>();
  for (const r of data.rounds) {
    const arr = roundsByGame.get(r.gameId);
    if (arr) arr.push(r);
    else roundsByGame.set(r.gameId, [r]);
  }

  const facts: GameFacts[] = finished.map((g) =>
    computeGameFacts(g, roundsByGame.get(g.id) ?? [], canonical),
  );

  const accs = new Map<ID, Acc>();
  const acc = (id: ID): Acc => {
    let a = accs.get(id);
    if (!a) {
      a = newAcc(id);
      accs.set(id, a);
    }
    return a;
  };

  const records = newRecords();

  for (const f of facts) {
    const t = gameTime(f.game);
    const night = dayKey(t);

    // Records (global, per game).
    if (f.topRound) records.consider('topRound', f.topRound.value, f.topRound.playerId, f.game.id, t);
    if (f.margin !== undefined && f.winners.length) {
      records.consider('blowout', f.margin, f.winners[0], f.game.id, t);
      if (f.margin > 0) records.considerMin('closest', f.margin, f.winners[0], f.game.id, t);
    }
    records.consider('longest', f.rounds.length, f.winners[0], f.game.id, t);
    for (const id of f.playerIds) records.consider('highTotal', f.totals[id], id, f.game.id, t);

    // A "close" game: the winning margin is a small slice of the score spread —
    // scale-free, so it reads the same for any game and either direction. Powers
    // the clutch trait (win rate when it's tight).
    const vals = f.playerIds.map((id) => f.totals[id] ?? 0);
    const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
    const closeGame = spread > 0 && f.margin !== undefined && f.margin <= 0.1 * spread;

    for (const id of f.playerIds) {
      const a = acc(id);
      const rank = f.rankOf[id] ?? f.playerIds.length;
      const isWin = f.winners.includes(id);

      a.played += 1;
      a.rankSum += rank;
      a.rankSqSum += rank * rank;
      a.bestFinish = Math.min(a.bestFinish, rank);
      if (closeGame) {
        a.closeGames += 1;
        if (isWin) a.closeWins += 1;
      }
      // Top-3, but never "everyone" at a small table: caps at playerCount-1 so
      // last place is never a podium (e.g. top-2 in a 3-player game).
      if (rank <= Math.min(3, Math.max(1, f.playerIds.length - 1))) a.podiums += 1;
      a.points += f.totals[id] ?? 0;
      a.rounds += f.rounds.length;
      a.firstPlayedAt = Math.min(a.firstPlayedAt, t);
      a.lastPlayedAt = Math.max(a.lastPlayedAt, t);
      a.nights.add(night);

      const bt = (a.byGameType[f.game.type] ??= { played: 0, wins: 0, winRate: 0 });
      bt.played += 1;

      if (isWin) {
        a.wins += 1;
        bt.wins += 1;
        a.lastWinAt = a.lastWinAt === undefined ? t : Math.max(a.lastWinAt, t);
        a.run += 1;
        a.longest = Math.max(a.longest, a.run);
        if (f.comeback.has(id)) a.comebackWins += 1;
        if (f.wireToWire.has(id)) a.wireToWireWins += 1;
        if (f.margin !== undefined) {
          a.bestWinMargin = a.bestWinMargin === undefined ? f.margin : Math.max(a.bestWinMargin, f.margin);
          a.closestWinMargin =
            a.closestWinMargin === undefined ? f.margin : Math.min(a.closestWinMargin, f.margin);
        }
      } else {
        a.run = 0;
      }

      // Head-to-head vs every co-finisher.
      for (const opp of f.playerIds) {
        if (opp === id) continue;
        const row = h2hRow(a, opp);
        row.games += 1;
        const oppRank = f.rankOf[opp] ?? f.playerIds.length;
        if (rank < oppRank) row.wins += 1;
        else if (rank > oppRank) row.losses += 1;
        else row.ties += 1;
      }
    }
  }

  // Ensure the queried member always has an entry (low-data states).
  if (query.playerId) acc(canonical(query.playerId));

  const perPlayer: Record<ID, MemberStats> = {};
  for (const a of accs.values()) perPlayer[a.playerId] = finalize(a);

  const leaderboard: LeaderRow[] = Object.values(perPlayer)
    .filter((m) => m.played > 0)
    .map((m) => ({
      playerId: m.playerId,
      played: m.played,
      wins: m.wins,
      winRate: m.winRate,
      avgFinish: m.avgFinish,
      currentStreak: m.currentStreak,
    }))
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.played - a.played);

  const referenced = new Set<ID>();
  for (const f of facts) for (const id of f.playerIds) referenced.add(id);
  if (query.playerId) referenced.add(canonical(query.playerId));
  const players = [...referenced]
    .map((id) => playerById.get(id))
    .filter((p): p is Player => p !== undefined);

  const allNights = new Set<string>();
  for (const f of facts) allNights.add(dayKey(gameTime(f.game)));

  const result: StatsResult = {
    range: query.range,
    players,
    leaderboard,
    perPlayer,
    records: records.list(),
    global: globalMetrics(facts, leaderboard.length, allNights.size),
    gameSpecific: gameSpecific(finished, roundsByGame, players, query.range, canonical, options.gameStats),
    totals: {
      games: inWindow.length,
      finishedGames: finished.length,
      abandonedGames: abandoned.length,
      rounds: facts.reduce((n, f) => n + f.rounds.length, 0),
      gameNights: allNights.size,
    },
  };
  return result;
}

function finalize(a: Acc): MemberStats {
  for (const bt of Object.values(a.byGameType)) bt.winRate = bt.played ? bt.wins / bt.played : 0;
  const m: MemberStats = {
    playerId: a.playerId,
    played: a.played,
    finished: a.played,
    wins: a.wins,
    podiums: a.podiums,
    winRate: a.played ? a.wins / a.played : 0,
    currentStreak: a.run,
    longestStreak: a.longest,
    points: a.points,
    rounds: a.rounds,
    byGameType: a.byGameType,
    headToHead: a.h2h,
    comebackWins: a.comebackWins,
    wireToWireWins: a.wireToWireWins,
    closeGames: a.closeGames,
    closeWins: a.closeWins,
    gameNights: a.nights.size,
  };
  if (a.played > 0) {
    m.avgFinish = a.rankSum / a.played;
    m.bestFinish = a.bestFinish;
    const variance = a.rankSqSum / a.played - m.avgFinish * m.avgFinish;
    m.finishStdev = Math.sqrt(Math.max(0, variance));
    m.firstPlayedAt = a.firstPlayedAt;
    m.lastPlayedAt = a.lastPlayedAt;
  }
  if (a.lastWinAt !== undefined) m.lastWinAt = a.lastWinAt;
  if (a.bestWinMargin !== undefined) m.bestWinMargin = a.bestWinMargin;
  if (a.closestWinMargin !== undefined) m.closestWinMargin = a.closestWinMargin;
  return m;
}

// ---- Records ----

interface RecordSlot {
  value: number;
  holderId?: ID;
  gameId?: ID;
  at?: number;
}

function newRecords() {
  const slots: Record<string, RecordSlot> = {};
  const put = (key: string, value: number, holderId?: ID, gameId?: ID, at?: number, min = false) => {
    const cur = slots[key];
    if (!cur || (min ? value < cur.value : value > cur.value)) {
      slots[key] = { value, holderId, gameId, at };
    }
  };
  return {
    consider: (k: string, v: number, h?: ID, g?: ID, at?: number) => put(k, v, h, g, at, false),
    considerMin: (k: string, v: number, h?: ID, g?: ID, at?: number) => put(k, v, h, g, at, true),
    list(): GameRecord[] {
      const out: GameRecord[] = [];
      const add = (key: string, label: string, emoji: string, fmt: (v: number) => string) => {
        const s = slots[key];
        if (s) out.push({ key, label, emoji, value: fmt(s.value), holderId: s.holderId, gameId: s.gameId, at: s.at });
      };
      add('topRound', 'Highest single round', '💥', (v) => `${Math.round(v)}`);
      add('highTotal', 'Highest game total', '📈', (v) => `${Math.round(v)}`);
      add('blowout', 'Biggest blowout', '🚀', (v) => `by ${Math.round(v)}`);
      add('closest', 'Closest finish', '📸', (v) => `by ${Math.round(v)}`);
      add('longest', 'Longest game', '⏳', (v) => `${Math.round(v)} rounds`);
      return out;
    },
  };
}

// ---- Global metrics ----

function globalMetrics(facts: GameFacts[], playerCount: number, nights: number): Metric[] {
  const byType = new Map<string, number>();
  for (const f of facts) byType.set(f.game.type, (byType.get(f.game.type) ?? 0) + 1);
  let topType: string | undefined;
  let topCount = 0;
  for (const [type, c] of byType) if (c > topCount) ((topType = type), (topCount = c));

  const out: Metric[] = [
    { key: 'g_games', label: 'Finished games', value: `${facts.length}`, emoji: '🎲' },
    { key: 'g_nights', label: 'Game nights', value: `${nights}`, emoji: '🌙' },
    { key: 'g_players', label: 'Players', value: `${playerCount}`, emoji: '👥' },
  ];
  if (topType) out.push({ key: 'g_toptype', label: 'Most played', value: topType, sub: `${topCount} games`, emoji: '🏆' });
  return out;
}

// ---- Game-specific hooks ----

function gameSpecific(
  finished: Game[],
  roundsByGame: Map<ID, Round[]>,
  players: Player[],
  range: DateRange | undefined,
  canonical: (id: ID) => ID,
  resolve?: (type: string) => GameStatsHook | undefined,
): Record<string, GameSpecificStats> {
  const out: Record<string, GameSpecificStats> = {};
  if (!resolve) return out;
  const byType = new Map<string, Game[]>();
  for (const g of finished) {
    const arr = byType.get(g.type);
    if (arr) arr.push(g);
    else byType.set(g.type, [g]);
  }
  for (const [type, games] of byType) {
    const hook = resolve(type);
    if (!hook) continue;
    const rounds: Round[] = [];
    for (const g of games) for (const r of roundsByGame.get(g.id) ?? []) rounds.push(r);
    out[type] = hook({ games, rounds, players, range, canonical });
  }
  return out;
}
