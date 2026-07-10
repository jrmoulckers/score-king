import type { ID } from '../../types';
import type { EuchreInput } from './logic';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtInt, fmtPct } from '../../stats/format';

interface EuAgg {
  /** Hands this player's team named trump. */
  called: number;
  /** Called hands that were made (3–4, a march, or a lone sweep). */
  makes: number;
  /** Called hands swept for all five tricks. */
  marches: number;
  /** Hands this player's team euchred the makers. */
  euchresLanded: number;
  /** Hands this player's team called it and got set (euchred). */
  setAgainst: number;
  /** Hands this player personally played alone. */
  loneCalls: number;
  /** Lone hands that swept all five. */
  loneSweeps: number;
}

/**
 * Euchre stats, derived purely from each hand's recorded maker/result. Team events are
 * credited to both partners; going alone is credited to the individual who did it, so a
 * lone hand shows up on the right person. Pure — no Svelte — so it's unit-testable and
 * safe for the stats engine to import.
 */
export function euchreStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const per = new Map<ID, EuAgg>();
  const get = (id: ID): EuAgg => {
    let a = per.get(id);
    if (!a) {
      a = { called: 0, makes: 0, marches: 0, euchresLanded: 0, setAgainst: 0, loneCalls: 0, loneSweeps: 0 };
      per.set(id, a);
    }
    return a;
  };

  let hands = 0;
  let makes = 0;
  let marches = 0;
  let euchres = 0;

  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const input = r.input as EuchreInput | undefined;
    if (!input?.teams || input.maker == null || input.result == null) continue;

    const makerTeam = input.teams[input.maker] ?? [];
    const defTeam = input.teams[input.maker === 0 ? 1 : 0] ?? [];
    const made = input.result !== 'euchred';

    hands += 1;
    if (made) makes += 1;
    if (input.result === 'march') marches += 1;
    if (input.result === 'euchred') euchres += 1;

    for (const pid of makerTeam) {
      const a = get(canonical(pid));
      a.called += 1;
      if (made) a.makes += 1;
      if (input.result === 'march') a.marches += 1;
      if (input.result === 'euchred') a.setAgainst += 1;
    }
    if (input.result === 'euchred') {
      for (const pid of defTeam) get(canonical(pid)).euchresLanded += 1;
    }
    if (input.alone && input.alonePlayer) {
      const a = get(canonical(input.alonePlayer));
      a.loneCalls += 1;
      if (input.result === 'march') a.loneSweeps += 1;
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.called) {
      metrics.push({
        key: 'eu_make',
        label: 'Call make rate',
        value: fmtPct(a.makes / a.called),
        sub: `${a.makes}/${a.called}`,
        emoji: '🎯',
      });
    }
    if (a.marches) {
      metrics.push({
        key: 'eu_march',
        label: 'Marches',
        value: fmtInt(a.marches),
        sub: a.called ? fmtPct(a.marches / a.called) : undefined,
        emoji: '🧹',
      });
    }
    if (a.euchresLanded) {
      metrics.push({ key: 'eu_euchre', label: 'Euchres landed', value: fmtInt(a.euchresLanded), emoji: '🚫' });
    }
    if (a.setAgainst) {
      metrics.push({
        key: 'eu_set',
        label: 'Got set',
        value: fmtInt(a.setAgainst),
        sub: a.called ? fmtPct(a.setAgainst / a.called) : undefined,
        emoji: '😬',
      });
    }
    if (a.loneCalls) {
      metrics.push({
        key: 'eu_lone',
        label: a.loneSweeps ? 'Lone sweeps' : 'Went alone',
        value: fmtInt(a.loneSweeps || a.loneCalls),
        sub: a.loneSweeps ? `${a.loneSweeps}/${a.loneCalls} alone` : `${a.loneCalls} alone`,
        emoji: '🐺',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (hands) {
    global.push({ key: 'eu_make_all', label: 'Make rate', value: fmtPct(makes / hands), emoji: '🎯' });
    if (marches)
      global.push({
        key: 'eu_march_all',
        label: 'March rate',
        value: fmtPct(marches / hands),
        sub: `${marches} sweep${marches === 1 ? '' : 's'}`,
        emoji: '🧹',
      });
    if (euchres) global.push({ key: 'eu_euchre_all', label: 'Euchres', value: fmtInt(euchres), emoji: '🚫' });
  }

  return { perPlayer, global };
}
