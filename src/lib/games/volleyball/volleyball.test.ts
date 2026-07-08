import { describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  isDecidingSet,
  matchState,
  maxSets,
  readConfig,
  setWinner,
  targetForSet,
  validateSetScore,
  type SetScore,
  type VolleyConfig,
} from './logic';

const bo5: VolleyConfig = { ...DEFAULTS };
const bo3: VolleyConfig = { ...DEFAULTS, setsToWin: 2 };

describe('setWinner — rally scoring & win by two', () => {
  it('awards a set at the target with a two-point lead', () => {
    expect(setWinner(25, 23, 25, true)).toBe('a');
    expect(setWinner(23, 25, 25, true)).toBe('b');
    expect(setWinner(25, 0, 25, true)).toBe('a');
  });

  it('is not over at the target without a two-point lead', () => {
    expect(setWinner(25, 24, 25, true)).toBeNull();
    expect(setWinner(24, 24, 25, true)).toBeNull();
  });

  it('keeps a deuce set going until someone leads by two', () => {
    expect(setWinner(26, 24, 25, true)).toBe('a');
    expect(setWinner(24, 26, 25, true)).toBe('b');
    expect(setWinner(26, 25, 25, true)).toBeNull();
    expect(setWinner(30, 28, 25, true)).toBe('a');
  });

  it('needs the target to be reached first', () => {
    expect(setWinner(20, 15, 25, true)).toBeNull();
    expect(setWinner(10, 2, 25, true)).toBeNull();
  });

  it('rejects a tie as a winner', () => {
    expect(setWinner(25, 25, 25, true)).toBeNull();
    expect(setWinner(0, 0, 25, true)).toBeNull();
  });

  it('honours a one-point win when win-by-two is off', () => {
    expect(setWinner(25, 24, 25, false)).toBe('a');
    expect(setWinner(25, 23, 25, false)).toBe('a');
    expect(setWinner(24, 23, 25, false)).toBeNull();
  });

  it('scores the shorter deciding-set target', () => {
    expect(setWinner(15, 13, 15, true)).toBe('a');
    expect(setWinner(15, 14, 15, true)).toBeNull();
    expect(setWinner(16, 14, 15, true)).toBe('a');
  });
});

describe('setWinner — hard cap', () => {
  it('lets the first side to the cap win by one', () => {
    expect(setWinner(27, 26, 25, true, 27)).toBe('a');
    expect(setWinner(26, 27, 25, true, 27)).toBe('b');
  });

  it('still needs two before the cap is reached', () => {
    expect(setWinner(26, 25, 25, true, 27)).toBeNull();
    expect(setWinner(27, 25, 25, true, 27)).toBe('a');
  });

  it('ignores a cap that is not above the target', () => {
    expect(setWinner(25, 24, 25, true, 25)).toBeNull();
    expect(setWinner(25, 24, 25, true, 10)).toBeNull();
  });
});

describe('validateSetScore — only legal final scores pass', () => {
  it('accepts clean and deuce finals', () => {
    expect(validateSetScore(25, 23, 25, true)).toBeNull();
    expect(validateSetScore(25, 0, 25, true)).toBeNull();
    expect(validateSetScore(26, 24, 25, true)).toBeNull();
    expect(validateSetScore(27, 25, 25, true)).toBeNull();
    expect(validateSetScore(30, 28, 25, true)).toBeNull();
  });

  it('rejects a set that is not over yet', () => {
    expect(validateSetScore(25, 24, 25, true)).toMatch(/isn.t over/i);
    expect(validateSetScore(20, 18, 25, true)).toMatch(/isn.t over/i);
    expect(validateSetScore(25, 25, 25, true)).toMatch(/isn.t over/i);
  });

  it('rejects an unreachable (overshot) score', () => {
    // A set ends at 25–20; you can't play on to 26–20.
    expect(validateSetScore(26, 20, 25, true)).toMatch(/isn.t reachable/i);
    expect(validateSetScore(28, 24, 25, true)).toMatch(/isn.t reachable/i);
  });

  it('rejects negative and non-integer scores', () => {
    expect(validateSetScore(-1, 25, 25, true)).toMatch(/negative/i);
    expect(validateSetScore(25.5, 20, 25, true)).toMatch(/whole/i);
  });

  it('validates against the deciding-set target', () => {
    expect(validateSetScore(15, 12, 15, true)).toBeNull();
    expect(validateSetScore(15, 14, 15, true)).toMatch(/isn.t over/i);
    expect(validateSetScore(17, 15, 15, true)).toBeNull();
  });

  it('respects the hard cap boundary', () => {
    expect(validateSetScore(27, 26, 25, true, 27)).toBeNull();
    expect(validateSetScore(28, 26, 25, true, 27)).toMatch(/isn.t reachable/i);
  });
});

describe('deciding set & targets', () => {
  it('detects the deciding set only when level one short', () => {
    expect(isDecidingSet(2, 2, 3)).toBe(true);
    expect(isDecidingSet(2, 1, 3)).toBe(false);
    expect(isDecidingSet(1, 1, 2)).toBe(true);
    expect(isDecidingSet(0, 0, 2)).toBe(false);
  });

  it('uses the deciding target for the final set, the normal one otherwise', () => {
    expect(targetForSet(bo5, 0, 0)).toBe(25);
    expect(targetForSet(bo5, 2, 1)).toBe(25);
    expect(targetForSet(bo5, 2, 2)).toBe(15);
    expect(targetForSet(bo3, 1, 1)).toBe(15);
  });

  it('reports the maximum sets for a format', () => {
    expect(maxSets(bo5)).toBe(5);
    expect(maxSets(bo3)).toBe(3);
  });
});

describe('matchState — folding sets into a result', () => {
  it('calls a best-of-5 match at three sets', () => {
    const sets: SetScore[] = [
      { a: 25, b: 20 },
      { a: 22, b: 25 },
      { a: 25, b: 18 },
      { a: 25, b: 22 },
    ];
    const s = matchState(sets, bo5);
    expect(s.setsA).toBe(3);
    expect(s.setsB).toBe(1);
    expect(s.decided).toBe(true);
    expect(s.winner).toBe('a');
  });

  it('plays a deciding fifth set to 15', () => {
    const sets: SetScore[] = [
      { a: 25, b: 20 },
      { a: 20, b: 25 },
      { a: 25, b: 23 },
      { a: 23, b: 25 },
      { a: 15, b: 12 }, // deciding set, shorter target
    ];
    const s = matchState(sets, bo5);
    expect(s.setsA).toBe(3);
    expect(s.setsB).toBe(2);
    expect(s.winner).toBe('a');
  });

  it('a 15–12 fifth set would NOT count under normal-set rules (proves target switch)', () => {
    // Same five sets but forced to a 25-point target everywhere: the fifth set
    // (15–12) never reaches 25, so the match stays level and undecided.
    const alwaysLong: VolleyConfig = { ...bo5, decidingSetPoints: 25 };
    const sets: SetScore[] = [
      { a: 25, b: 20 },
      { a: 20, b: 25 },
      { a: 25, b: 23 },
      { a: 23, b: 25 },
      { a: 15, b: 12 },
    ];
    const s = matchState(sets, alwaysLong);
    expect(s.setsA).toBe(2);
    expect(s.setsB).toBe(2);
    expect(s.decided).toBe(false);
  });

  it('sweeps a best-of-3 at two sets', () => {
    const s = matchState([{ a: 25, b: 20 }, { a: 25, b: 18 }], bo3);
    expect(s.setsA).toBe(2);
    expect(s.setsB).toBe(0);
    expect(s.decided).toBe(true);
    expect(s.winner).toBe('a');
  });

  it('stops counting once the match is already won', () => {
    const sets: SetScore[] = [
      { a: 25, b: 10 },
      { a: 25, b: 10 },
      { a: 25, b: 10 },
      { a: 25, b: 10 }, // impossible trailing set — must be ignored
    ];
    const s = matchState(sets, bo5);
    expect(s.setsA).toBe(3);
    expect(s.setsB).toBe(0);
  });

  it('surfaces the next target/deciding flags mid-match', () => {
    const s = matchState([{ a: 25, b: 20 }, { a: 20, b: 25 }, { a: 25, b: 23 }, { a: 22, b: 25 }], bo5);
    expect(s.setsA).toBe(2);
    expect(s.setsB).toBe(2);
    expect(s.nextDeciding).toBe(true);
    expect(s.nextTarget).toBe(15);
  });

  it('ignores incomplete sets when folding', () => {
    const s = matchState([{ a: 25, b: 20 }, { a: 24, b: 24 }], bo5);
    expect(s.setsA).toBe(1);
    expect(s.setsB).toBe(0);
    expect(s.decided).toBe(false);
  });
});

describe('readConfig — safe coercion & formats', () => {
  it('maps best-of formats to sets-to-win', () => {
    expect(readConfig({ format: 'bo5' }).setsToWin).toBe(3);
    expect(readConfig({ format: 'bo3' }).setsToWin).toBe(2);
  });

  it('fills sensible defaults', () => {
    const c = readConfig(undefined);
    expect(c).toEqual(DEFAULTS);
    expect(readConfig({}).pointsPerSet).toBe(25);
    expect(readConfig({}).decidingSetPoints).toBe(15);
  });

  it('respects win-by-two toggle and custom targets', () => {
    expect(readConfig({ winBy2: false }).winBy2).toBe(false);
    expect(readConfig({ winBy2: true }).winBy2).toBe(true);
    expect(readConfig({ pointsPerSet: 21, decidingSetPoints: 11 })).toMatchObject({
      pointsPerSet: 21,
      decidingSetPoints: 11,
    });
  });

  it('coerces junk to defaults and floors the cap', () => {
    expect(readConfig({ pointsPerSet: -5 }).pointsPerSet).toBe(25);
    expect(readConfig({ pointsPerSet: 'nonsense' }).pointsPerSet).toBe(25);
    expect(readConfig({ hardCap: 0 }).hardCap).toBe(0);
    expect(readConfig({ hardCap: 27.9 }).hardCap).toBe(27);
    expect(readConfig({ hardCap: -3 }).hardCap).toBe(0);
  });
});
