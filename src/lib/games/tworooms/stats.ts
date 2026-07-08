import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt } from '../../stats/format';
import type { TwoRoomsInput } from './logic';

interface TwoRoomsAgg {
  /** Rounds this player held a room's Leader card. */
  roomsLed: number;
  /** Games this player was the President. */
  presidencies: number;
  /** Games this player was the Bomber. */
  bombings: number;
  /** Games this player was the Bomber AND Red won (the bomb landed). */
  bombsLanded: number;
}

/**
 * Two Rooms and a Boom stats from each round's recorded leaders + reveal. Pure,
 * no I/O — mirrors the module's own scoring. The generic engine already tracks
 * wins from the winning team, so this surfaces the flavor it can't: who wore the
 * President and Bomber hats, who kept getting handed the Leader card, and how
 * often the Bomber actually caught the President.
 */
export function twoRoomsStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, TwoRoomsAgg>();
  const get = (id: ID): TwoRoomsAgg => {
    let a = per.get(id);
    if (!a) {
      a = { roomsLed: 0, presidencies: 0, bombings: 0, bombsLanded: 0 };
      per.set(id, a);
    }
    return a;
  };

  let redWins = 0;
  let blueWins = 0;
  let hostages = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as TwoRoomsInput | undefined;
    if (!input) continue;

    hostages += (Number(input.sent1) || 0) + (Number(input.sent2) || 0);
    if (input.leader1) get(canonical(input.leader1)).roomsLed += 1;
    if (input.leader2) get(canonical(input.leader2)).roomsLed += 1;

    const reveal = input.reveal;
    if (reveal && (reveal.winner === 'red' || reveal.winner === 'blue')) {
      if (reveal.winner === 'red') redWins += 1;
      else blueWins += 1;

      const president = reveal.president ? canonical(reveal.president) : null;
      const bomber = reveal.bomber ? canonical(reveal.bomber) : null;
      if (president) get(president).presidencies += 1;
      if (bomber) {
        const a = get(bomber);
        a.bombings += 1;
        if (reveal.winner === 'red') a.bombsLanded += 1;
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.presidencies) {
      metrics.push({ key: 'tr_pres', label: 'President', value: fmtInt(a.presidencies), emoji: '🏛️' });
    }
    if (a.bombings) {
      const sub = a.bombsLanded ? `${fmtInt(a.bombsLanded)} landed` : undefined;
      metrics.push({ key: 'tr_bomb', label: 'Bomber', value: fmtInt(a.bombings), sub, emoji: '💣' });
    }
    if (a.roomsLed) {
      metrics.push({ key: 'tr_led', label: 'Rooms led', value: fmtInt(a.roomsLed), emoji: '📢' });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (redWins || blueWins) {
    global.push({ key: 'tr_red', label: 'Red Team wins', value: fmtInt(redWins), emoji: '💥' });
    global.push({ key: 'tr_blue', label: 'Blue Team wins', value: fmtInt(blueWins), emoji: '🕊️' });
  }
  if (hostages) {
    global.push({ key: 'tr_hostages', label: 'Hostages traded', value: fmtInt(hostages), emoji: '🔁' });
  }

  return { perPlayer, global };
}
