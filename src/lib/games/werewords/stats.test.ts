import { describe, expect, it } from 'vitest';
import type { Game, ID, Round } from '../../types';
import type { GameStatsInput } from '../../stats/types';
import { werewordsStats } from './stats';
import type { WerewordsInput } from './logic';

/** Build the minimal GameStatsInput the werewords stats hook actually reads. */
function statsFor(playerIds: ID[], inputs: WerewordsInput[]): GameStatsInput {
  const game = { id: 'g1', type: 'werewords', config: {}, playerIds } as unknown as Game;
  const rounds = inputs.map(
    (input, i) => ({ id: `r${i}`, gameId: 'g1', index: i, input, deltas: {} }) as unknown as Round,
  );
  return {
    games: [game],
    rounds,
    players: [],
    canonical: (id: ID) => id,
  };
}

function round(overrides: Partial<WerewordsInput> = {}): WerewordsInput {
  return {
    word: 'PYRAMID',
    mayor: 'A',
    seer: 'B',
    werewolves: ['C'],
    guessed: true,
    werewolfFoundSeer: false,
    mayorFoundWerewolf: false,
    ...overrides,
  };
}

describe('werewordsStats — the per-role flavour metrics', () => {
  it('emits a Seer-rounds metric (previously computed but never surfaced)', () => {
    const perPlayer = werewordsStats(statsFor(['A', 'B', 'C'], [round(), round()])).perPlayer ?? {};
    const seer = perPlayer['B']?.find((m) => m.key === 'ww_seer');
    expect(seer).toBeDefined();
    expect(seer?.value).toBe('2');
  });

  it('tracks how often the Mayor’s table cracked the word', () => {
    const inputs = [round({ guessed: true }), round({ guessed: false }), round({ guessed: true })];
    const perPlayer = werewordsStats(statsFor(['A', 'B', 'C'], inputs)).perPlayer ?? {};
    const cracked = perPlayer['A']?.find((m) => m.key === 'ww_mayor_cracked');
    expect(cracked?.value).toBe('2/3');
  });

  it('still reports round win rate and werewolf record', () => {
    const inputs = [round({ guessed: false }), round({ guessed: false })];
    const res = werewordsStats(statsFor(['A', 'B', 'C'], inputs));
    const perPlayer = res.perPlayer ?? {};
    const global = res.global ?? [];
    // C was the lone wolf both rounds, and wolves won both (time ran out).
    expect(perPlayer['C']?.find((m) => m.key === 'ww_wolf')?.value).toBe('2/2');
    expect(global.find((m) => m.key === 'ww_wolves')).toBeDefined();
  });
});
