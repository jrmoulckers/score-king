import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct, fmtSigned } from '../../stats/format';
import { readConfig, toMoney, type HoldemConfig, type HoldemEvent } from './logic';

interface HoldemAgg {
  /** Net across all sessions, in money units (converted per that game's config). */
  net: number;
  /** Total money bought in (the "ATM" — how much they kept reloading). */
  invested: number;
  buyins: number;
  handsWon: number;
  handsPlayed: number;
  biggestPot: number;
  biggestHandWin: number;
}

/**
 * Poker stats, derived purely from each session's ledger events. Everything is
 * normalized to money via each game's own {@link toMoney}, so a chips-only table
 * and a dollars table read on one leaderboard. A player "played" a hand when they
 * committed chips to it; they "won" it when they took any pot. Pure — no Svelte —
 * so it is unit-testable and safe for the stats engine to import.
 */
export function holdemStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const cfgOf = new Map<ID, HoldemConfig>(games.map((g) => [g.id, readConfig(g.config)]));

  const per = new Map<ID, HoldemAgg>();
  const get = (id: ID): HoldemAgg => {
    let a = per.get(id);
    if (!a) {
      a = {
        net: 0,
        invested: 0,
        buyins: 0,
        handsWon: 0,
        handsPlayed: 0,
        biggestPot: 0,
        biggestHandWin: 0,
      };
      per.set(id, a);
    }
    return a;
  };

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const event = r.input as HoldemEvent | undefined;
    if (!event) continue;
    const cfg = cfgOf.get(r.gameId);
    const money = (n: number) => (cfg ? toMoney(n, cfg) : n);

    if (event.kind === 'buyin') {
      const id = canonical(event.playerId);
      const a = get(id);
      a.invested += money(Number(event.amount) || 0);
      a.buyins += 1;
      continue;
    }

    if (event.kind === 'hand') {
      const pot = money(event.pots.reduce((s, p) => s + (Number(p.amount) || 0), 0));
      // Who committed chips this hand = who played it.
      for (const [pid, amt] of Object.entries(event.committed)) {
        if ((Number(amt) || 0) > 0) get(canonical(pid)).handsPlayed += 1;
      }
      // Net per winner from this hand (winnings − their own commitment).
      const winners = new Set(event.pots.flatMap((p) => p.winnerIds).map(canonical));
      const wonBy = new Map<ID, number>();
      for (const p of event.pots) {
        const share = (Number(p.amount) || 0) / Math.max(1, p.winnerIds.length);
        for (const w of p.winnerIds) wonBy.set(canonical(w), (wonBy.get(canonical(w)) ?? 0) + share);
      }
      for (const id of winners) {
        const a = get(id);
        a.handsWon += 1;
        a.biggestPot = Math.max(a.biggestPot, pot);
        const committed = money(Number(event.committed[id] ?? 0) || 0);
        const netWin = money(wonBy.get(id) ?? 0) - committed;
        a.biggestHandWin = Math.max(a.biggestHandWin, netWin);
      }
      continue;
    }
    // cashout events don't add stats directly; net comes from the game totals below.
  }

  // Net per player comes straight from the recorded deltas (already in the game's
  // unit), summed and converted to money for a mixed-table leaderboard.
  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const cfg = cfgOf.get(r.gameId);
    for (const [pid, d] of Object.entries(r.deltas)) {
      get(canonical(pid)).net += cfg ? toMoney(Number(d) || 0, cfg) : Number(d) || 0;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [
      { key: 'net', label: 'Net', value: fmtSigned(Math.round(a.net)), emoji: a.net >= 0 ? '📈' : '📉' },
      { key: 'invested', label: 'Bought in', value: fmtInt(a.invested), emoji: '💰' },
      {
        key: 'winRate',
        label: 'Hands won',
        value: a.handsPlayed ? fmtPct(a.handsWon / a.handsPlayed) : '—',
        sub: a.handsPlayed ? `${fmtInt(a.handsWon)} of ${fmtInt(a.handsPlayed)}` : undefined,
        emoji: '🃏',
      },
    ];
    if (a.biggestPot > 0)
      metrics.push({ key: 'bigpot', label: 'Biggest pot', value: fmtInt(a.biggestPot), emoji: '🏆' });
    perPlayer[id] = metrics;
  }

  // A light global flourish: the single biggest pot anyone dragged all night.
  const global: Metric[] = [];
  let bigPot = 0;
  for (const [, a] of per) bigPot = Math.max(bigPot, a.biggestPot);
  if (bigPot > 0) global.push({ key: 'bigpot', label: 'Biggest pot', value: fmtInt(bigPot), emoji: '🏆' });

  return { perPlayer, global: global.length ? global : undefined };
}
