import type { ID } from '../../types';
import type { CanastaInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct } from '../../stats/format';

interface CaAgg {
  /** Hands this player's team played (any recorded hand). */
  hands: number;
  /** Natural (pure) canastas built. */
  naturalCanastas: number;
  /** Mixed canastas built. */
  mixedCanastas: number;
  /** Red threes collected across the game. */
  redThrees: number;
  /** Hands where this player's team collected all four red threes. */
  fullRedThrees: number;
  /** Hands this player's team went out. */
  wentOut: number;
  /** Hands this player's team went out concealed. */
  concealedOuts: number;
}

/**
 * Canasta stats, derived purely from each hand's recorded team tallies. Team events are
 * credited to every partner, exactly like Euchre's stats — so a canasta or a concealed
 * out shows up on both members of the team that built it. Pure — no Svelte — so it's
 * unit-testable and safe for the stats engine to import.
 */
export function canastaStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, CaAgg>();
  const get = (id: ID): CaAgg => {
    let a = per.get(id);
    if (!a) {
      a = {
        hands: 0,
        naturalCanastas: 0,
        mixedCanastas: 0,
        redThrees: 0,
        fullRedThrees: 0,
        wentOut: 0,
        concealedOuts: 0,
      };
      per.set(id, a);
    }
    return a;
  };

  let hands = 0;
  let totalCanastas = 0;
  let concealedOuts = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as CanastaInput | undefined;
    if (!input?.teams || !input.hands) continue;

    hands += 1;
    input.teams.forEach((team, idx) => {
      const hand = input.hands[idx];
      if (!hand) return;
      const canastas = (Number(hand.naturalCanastas) || 0) + (Number(hand.mixedCanastas) || 0);
      totalCanastas += canastas;
      if (hand.concealedOut) concealedOuts += 1;

      for (const pid of team) {
        const a = get(canonical(pid));
        a.hands += 1;
        a.naturalCanastas += Number(hand.naturalCanastas) || 0;
        a.mixedCanastas += Number(hand.mixedCanastas) || 0;
        a.redThrees += Math.max(0, Math.min(4, Number(hand.redThrees) || 0));
        if (Number(hand.redThrees) >= 4) a.fullRedThrees += 1;
        if (hand.wentOut) a.wentOut += 1;
        if (hand.concealedOut) a.concealedOuts += 1;
      }
    });
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    const totalCa = a.naturalCanastas + a.mixedCanastas;
    if (totalCa) {
      metrics.push({
        key: 'ca_canastas',
        label: 'Canastas built',
        value: fmtInt(totalCa),
        sub: `${a.naturalCanastas} natural · ${a.mixedCanastas} mixed`,
        emoji: '🃏',
      });
    }
    if (a.redThrees) {
      metrics.push({
        key: 'ca_redthrees',
        label: 'Red threes collected',
        value: fmtInt(a.redThrees),
        sub: a.fullRedThrees ? `${a.fullRedThrees} full set` : undefined,
        emoji: '🔴',
      });
    }
    if (a.wentOut) {
      metrics.push({
        key: 'ca_wentout',
        label: 'Went out',
        value: fmtInt(a.wentOut),
        sub: a.hands ? fmtPct(a.wentOut / a.hands) : undefined,
        emoji: '🏁',
      });
    }
    if (a.concealedOuts) {
      metrics.push({
        key: 'ca_concealed',
        label: 'Concealed outs',
        value: fmtInt(a.concealedOuts),
        emoji: '🥷',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (hands) {
    global.push({
      key: 'ca_canastas_all',
      label: 'Canastas built',
      value: fmtInt(totalCanastas),
      sub: `${fmtInt(totalCanastas / hands)} avg/hand`,
      emoji: '🃏',
    });
    if (concealedOuts) {
      global.push({
        key: 'ca_concealed_all',
        label: 'Concealed outs',
        value: fmtInt(concealedOuts),
        emoji: '🥷',
      });
    }
  }

  return { perPlayer, global };
}
