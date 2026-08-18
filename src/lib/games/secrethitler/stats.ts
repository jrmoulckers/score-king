import type { ID } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { computeState, eventOf } from './logic';

/**
 * Secret Hitler stats, derived by replaying each game's recorded events through the
 * same pure engine the module scores with. Roles are secret, so player-level facts
 * are limited to what the table saw — chiefly who caught a bullet.
 */
export function secretHitlerStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));

  const byGame = new Map<ID, { input: unknown; index: number }[]>();
  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const arr = byGame.get(r.gameId) ?? [];
    arr.push({ input: r.input, index: r.index });
    byGame.set(r.gameId, arr);
  }

  let liberalWins = 0;
  let fascistWins = 0;
  let byExecution = 0;
  let byChancellor = 0;
  let libPolicies = 0;
  let fascPolicies = 0;
  const executions = new Map<ID, number>();

  for (const [, arr] of byGame) {
    arr.sort((a, b) => a.index - b.index);
    const events = arr.map((x) => eventOf(x.input));
    const state = computeState(events);
    libPolicies += state.liberal;
    fascPolicies += state.fascist;

    for (const e of events) {
      if (e.event === 'execution' && e.target) {
        const id = canonical(e.target);
        executions.set(id, (executions.get(id) ?? 0) + 1);
      }
    }

    if (state.winner === 'liberal') liberalWins += 1;
    else if (state.winner === 'fascist') fascistWins += 1;
    if (state.winReason === 'Hitler was assassinated') byExecution += 1;
    if (state.winReason === 'Hitler was elected Chancellor') byChancellor += 1;
  }

  const global: Metric[] = [];
  if (liberalWins) {
    global.push({
      key: 'sh_lib',
      label: 'Liberal victories',
      value: `${liberalWins}`,
      emoji: '📘',
    });
  }
  if (fascistWins) {
    global.push({
      key: 'sh_fasc',
      label: 'Fascist victories',
      value: `${fascistWins}`,
      emoji: '📕',
    });
  }
  if (byExecution) {
    global.push({
      key: 'sh_exec',
      label: 'Hitler assassinated',
      value: `${byExecution}`,
      emoji: '🔫',
    });
  }
  if (byChancellor) {
    global.push({
      key: 'sh_chan',
      label: 'Hitler took the Chancellery',
      value: `${byChancellor}`,
      emoji: '🎩',
    });
  }
  if (libPolicies || fascPolicies) {
    global.push({
      key: 'sh_policies',
      label: 'Policies enacted (📘 / 📕)',
      value: `${libPolicies} / ${fascPolicies}`,
      emoji: '📜',
    });
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, n] of executions) {
    if (n > 0) {
      perPlayer[id] = [{ key: 'sh_executed', label: 'Times executed', value: `${n}`, emoji: '🔫' }];
    }
  }

  return { perPlayer, global };
}
