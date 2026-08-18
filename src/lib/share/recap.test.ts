import { describe, expect, it } from 'vitest';
import type { Game, Player } from '../types';
import { buildRecapPayload, recapText, recapView } from './recap';

/**
 * Guards the co-op contract at the *share* boundary: a recap must report the exact
 * recorded outcome. An empty winner list is a real result (the group lost to the
 * game), not a missing one, so it must never be back-filled with the rank-1
 * finishers — which, at a table that is equal by design, would crown everybody.
 */
function player(id: string, name: string): Player {
  return { id, name, color: '#7c5cff', createdAt: 0 };
}
const players = [player('a', 'Ada'), player('b', 'Bo')];

function finished(winnerIds: string[], type = 'stardew'): Game {
  return {
    id: 'g',
    type,
    config: {},
    playerIds: players.map((p) => p.id),
    status: 'finished',
    createdAt: 0,
    finishedAt: 1_700_000_000_000,
    winnerIds,
    roundCount: 1,
  };
}

const rounds = [{ index: 0, deltas: { a: 11, b: 11 } }];

describe('recap of a cooperative game', () => {
  it('marks the view as co-op from the module', () => {
    const view = recapView(buildRecapPayload(finished(['a', 'b']), players, rounds));
    expect(view.coop).toBe(true);
    expect(view.winners).toEqual(['0', '1']);
  });

  it('narrates a shared win as won together, never as a tie', () => {
    const view = recapView(buildRecapPayload(finished(['a', 'b']), players, rounds));
    const text = recapText(view, 'https://example.test/recap');
    expect(text).toContain('won together');
    expect(text).not.toContain('tie!');
  });

  it('keeps a shared loss winner-less instead of crowning the tied table', () => {
    const view = recapView(buildRecapPayload(finished([]), players, rounds));
    expect(view.winners).toEqual([]);
    const text = recapText(view, 'https://example.test/recap');
    expect(text).not.toContain('🏆');
  });

  it('still says "tie!" for a genuinely competitive all-tie', () => {
    const view = recapView(buildRecapPayload(finished(['a', 'b'], 'tally'), players, rounds));
    expect(view.coop).toBe(false);
    expect(recapText(view, 'https://example.test/recap')).toContain('tie!');
  });
});
