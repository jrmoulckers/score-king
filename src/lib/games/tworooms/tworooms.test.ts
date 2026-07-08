import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUNDS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  createInput,
  describe as describeRound,
  isFinalRound,
  pickWinners,
  roleBreakdown,
  roundCount,
  score,
  suggestedHostages,
  suggestedMinutes,
  teamLabel,
  validate,
  type TwoRoomsInput,
} from './logic';

/** A fresh input with a few overrides applied. */
function make(overrides: Partial<TwoRoomsInput> = {}): TwoRoomsInput {
  return { ...createInput(), ...overrides };
}
const cfg = (rounds: number) => ({ rounds });
const nameOf = (id: string | null) => (id ? id.toUpperCase() : '');

describe('roundCount', () => {
  it('defaults to 3 when unset or non-numeric', () => {
    expect(roundCount(undefined)).toBe(DEFAULT_ROUNDS);
    expect(roundCount({})).toBe(DEFAULT_ROUNDS);
    expect(roundCount({ rounds: 'nope' })).toBe(DEFAULT_ROUNDS);
  });

  it('clamps to the supported 3–5 range', () => {
    expect(roundCount({ rounds: 1 })).toBe(MIN_ROUNDS);
    expect(roundCount({ rounds: 3 })).toBe(3);
    expect(roundCount({ rounds: 4 })).toBe(4);
    expect(roundCount({ rounds: 5 })).toBe(5);
    expect(roundCount({ rounds: 9 })).toBe(MAX_ROUNDS);
  });

  it('rounds fractional configs', () => {
    expect(roundCount({ rounds: 3.4 })).toBe(3);
    expect(roundCount({ rounds: 4.6 })).toBe(5);
  });
});

describe('isFinalRound', () => {
  it('marks only the last round for a 3-round game', () => {
    expect(isFinalRound(0, cfg(3))).toBe(false);
    expect(isFinalRound(1, cfg(3))).toBe(false);
    expect(isFinalRound(2, cfg(3))).toBe(true);
  });

  it('tracks the configured count and treats overshoot as final', () => {
    expect(isFinalRound(3, cfg(5))).toBe(false);
    expect(isFinalRound(4, cfg(5))).toBe(true);
    expect(isFinalRound(9, cfg(3))).toBe(true);
  });
});

describe('suggestedMinutes', () => {
  it('counts down to a one-minute finish', () => {
    expect([0, 1, 2].map((i) => suggestedMinutes(i, cfg(3)))).toEqual([3, 2, 1]);
    expect([0, 1, 2, 3, 4].map((i) => suggestedMinutes(i, cfg(5)))).toEqual([5, 4, 3, 2, 1]);
  });

  it('never drops below one minute', () => {
    expect(suggestedMinutes(7, cfg(3))).toBe(1);
  });
});

describe('suggestedHostages (official chart)', () => {
  it('6–10 players trade one each round', () => {
    expect([0, 1, 2].map((i) => suggestedHostages(8, i, cfg(3)))).toEqual([1, 1, 1]);
  });

  it('11–21 players open with two, then one', () => {
    expect([0, 1, 2].map((i) => suggestedHostages(16, i, cfg(3)))).toEqual([2, 1, 1]);
  });

  it('22+ players run 3 / 2 / 1', () => {
    expect([0, 1, 2].map((i) => suggestedHostages(24, i, cfg(3)))).toEqual([3, 2, 1]);
  });

  it('always trades a single hostage on the final round', () => {
    expect(suggestedHostages(24, 4, cfg(5))).toBe(1);
    expect(suggestedHostages(8, 2, cfg(3))).toBe(1);
  });

  it('tapers sanely for longer games', () => {
    expect([0, 1, 2, 3, 4].map((i) => suggestedHostages(24, i, cfg(5)))).toEqual([3, 2, 2, 2, 1]);
  });
});

describe('roleBreakdown', () => {
  it('splits an even table evenly with President + Bomber', () => {
    const r = roleBreakdown(6);
    expect(r).toMatchObject({ president: 1, bomber: 1, blueTeam: 2, redTeam: 2, gambler: 0 });
    expect(r.blueTotal).toBe(3);
    expect(r.redTotal).toBe(3);
    expect(r.blueTotal + r.redTotal).toBe(6);
  });

  it('adds a Gambler for an odd table', () => {
    const r = roleBreakdown(7);
    expect(r.gambler).toBe(1);
    expect(r.blueTeam).toBe(2);
    expect(r.redTeam).toBe(2);
    expect(r.blueTotal + r.redTotal + r.gambler).toBe(7);
  });

  it('handles the minimum even split', () => {
    const r = roleBreakdown(2);
    expect(r).toMatchObject({ president: 1, bomber: 1, blueTeam: 0, redTeam: 0, gambler: 0 });
  });

  it('degrades gracefully below two players', () => {
    expect(roleBreakdown(0)).toMatchObject({ president: 0, bomber: 0, blueTotal: 0, redTotal: 0 });
    expect(roleBreakdown(1).gambler).toBe(1);
  });

  it('always accounts for every player', () => {
    for (let n = 2; n <= 30; n++) {
      const r = roleBreakdown(n);
      expect(r.blueTotal + r.redTotal + r.gambler).toBe(n);
    }
  });
});

describe('createInput', () => {
  it('starts empty and scoreless', () => {
    const input = createInput();
    expect(input).toEqual({
      leader1: null,
      leader2: null,
      sent1: 0,
      sent2: 0,
      reveal: { winner: null, winners: [], president: null, bomber: null },
    });
  });
});

describe('validate', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('accepts a plain exchange round', () => {
    expect(validate(make({ sent1: 2, sent2: 1 }), 0, cfg(3), ids)).toBeNull();
  });

  it('rejects negative hostage counts', () => {
    expect(validate(make({ sent1: -1 }), 0, cfg(3), ids)).toMatch(/negative/i);
  });

  it('rejects one player leading both rooms', () => {
    expect(validate(make({ leader1: 'a', leader2: 'a' }), 0, cfg(3), ids)).toMatch(/both rooms/i);
  });

  it('allows distinct leaders per room', () => {
    expect(validate(make({ leader1: 'a', leader2: 'b' }), 0, cfg(3), ids)).toBeNull();
  });

  it('requires the reveal on the final round', () => {
    expect(validate(make(), 2, cfg(3), ids)).toMatch(/Reveal time/i);
  });

  it('requires at least one winner once a team is chosen', () => {
    const input = make();
    input.reveal.winner = 'red';
    expect(validate(input, 2, cfg(3), ids)).toMatch(/winning Red Team/i);
  });

  it('rejects winners who are not in the game', () => {
    const input = make();
    input.reveal.winner = 'blue';
    input.reveal.winners = ['zzz'];
    expect(validate(input, 2, cfg(3), ids)).toMatch(/isn’t in this game/i);
  });

  it('rejects an unknown President or Bomber', () => {
    const input = make();
    input.reveal = { winner: 'blue', winners: ['a'], president: 'zzz', bomber: null };
    expect(validate(input, 2, cfg(3), ids)).toMatch(/President isn’t/i);
  });

  it('accepts a complete reveal', () => {
    const input = make({ sent1: 1, sent2: 1 });
    input.reveal = { winner: 'red', winners: ['a', 'b', 'c'], president: 'd', bomber: 'a' };
    expect(validate(input, 2, cfg(3), ids)).toBeNull();
  });

  it('does not demand a reveal on non-final rounds', () => {
    expect(validate(make(), 0, cfg(3), ids)).toBeNull();
    expect(validate(make(), 1, cfg(3), ids)).toBeNull();
  });
});

describe('score', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('scores nothing on exchange rounds', () => {
    const out = score(make({ sent1: 3, sent2: 2, leader1: 'a' }), 0, cfg(3), ids);
    expect(out).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('awards +1 to each winner on the reveal round', () => {
    const input = make();
    input.reveal = { winner: 'red', winners: ['a', 'c'], president: 'b', bomber: 'a' };
    expect(score(input, 2, cfg(3), ids)).toEqual({ a: 1, b: 0, c: 1, d: 0 });
  });

  it('ignores a reveal recorded on a non-final round', () => {
    const input = make();
    input.reveal = { winner: 'red', winners: ['a', 'c'], president: null, bomber: null };
    expect(score(input, 0, cfg(3), ids)).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('scores zero when the final round has no recorded winner', () => {
    expect(score(make(), 2, cfg(3), ids)).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });
});

describe('pickWinners', () => {
  it('reports no winner while the game is scoreless', () => {
    expect(pickWinners({ a: 0, b: 0, c: 0 })).toEqual([]);
  });

  it('returns exactly the winning team', () => {
    expect(pickWinners({ a: 1, b: 0, c: 1, d: 0 }).sort()).toEqual(['a', 'c']);
  });

  it('handles an empty table', () => {
    expect(pickWinners({})).toEqual([]);
  });

  it('lines up with score() end to end', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const input = make();
    input.reveal = { winner: 'blue', winners: ['b', 'd'], president: 'b', bomber: 'a' };
    const totals = score(input, 2, cfg(3), ids);
    expect(pickWinners(totals).sort()).toEqual(['b', 'd']);
  });
});

describe('describe', () => {
  it('summarizes a bare hostage swap', () => {
    expect(describeRound(make({ sent1: 2, sent2: 1 }), nameOf)).toBe('🔁 Hostage swap — 2 ⇄ 1');
  });

  it('names the leaders when recorded', () => {
    const input = make({ sent1: 1, sent2: 2, leader1: 'ana', leader2: 'ben' });
    expect(describeRound(input, nameOf)).toBe('🔁 ANA sent 1 · BEN sent 2');
  });

  it('celebrates a Red win with the caught pair', () => {
    const input = make();
    input.reveal = { winner: 'red', winners: ['a'], president: 'pat', bomber: 'bo' };
    expect(describeRound(input, nameOf)).toBe('💥 Red Team wins — BO caught PAT');
  });

  it('celebrates a Blue win', () => {
    const input = make();
    input.reveal = { winner: 'blue', winners: ['a'], president: 'pat', bomber: null };
    expect(describeRound(input, nameOf)).toBe('🕊️ Blue Team wins — PAT escaped the Bomber');
  });

  it('falls back to generic reveal copy without named roles', () => {
    const input = make();
    input.reveal = { winner: 'red', winners: ['a'], president: null, bomber: null };
    expect(describeRound(input, nameOf)).toBe('💥 Red Team wins — the Bomber caught the President');
  });
});

describe('teamLabel', () => {
  it('labels both teams by name, never colour alone', () => {
    expect(teamLabel('red')).toBe('Red Team');
    expect(teamLabel('blue')).toBe('Blue Team');
  });
});
