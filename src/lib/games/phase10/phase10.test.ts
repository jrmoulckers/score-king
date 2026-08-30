import { describe, expect, it } from 'vitest';
import type { Game, Player, Round, RoundContext } from '../../types';
import { phase10 } from './index';
import { phase10Stats } from './stats';
import {
  CARD_VALUE,
  PHASE_COUNT,
  PHASES,
  createPhase10Input,
  emptyHand,
  handValue,
  hasWon,
  isPhase10Finished,
  phaseLabel,
  phasesAfter,
  phasesBefore,
  pickPhase10Winners,
  scorePhase10,
  validatePhase10,
  type Phase10Input,
} from './logic';

// ---- helpers ---------------------------------------------------------------

function player(id: string, name = id): Player {
  return { id, name, color: '#7c5cff', createdAt: 0 };
}

const A = player('A', 'Alice');
const B = player('B', 'Bob');
const C = player('C', 'Cy');
const players = [A, B, C];
const ids = players.map((p) => p.id);

function ctx(config: Record<string, unknown> = {}, rounds: Round[] = [], roundIndex = 0): RoundContext {
  return {
    game: {} as Game,
    players,
    config,
    roundIndex,
    totals: {},
    rounds,
  };
}

function round(index: number, completed: Record<string, boolean>, penalty: Record<string, number> = {}): Round {
  const input: Phase10Input = {
    completed,
    penalty: { A: 0, B: 0, C: 0, ...penalty },
  };
  return {
    id: `r${index}`,
    gameId: 'g1',
    index,
    input,
    deltas: scorePhase10(input, ids),
    createdAt: 0,
  };
}

// ---- phase list --------------------------------------------------------------

describe('PHASES', () => {
  it('has all ten official phases in order', () => {
    expect(PHASE_COUNT).toBe(10);
    expect(PHASES.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(PHASES[0].label).toBe('2 sets of 3');
    expect(PHASES[9].label).toBe('1 set of 5 + 1 set of 3');
  });
});

// ---- round input -------------------------------------------------------------

describe('createPhase10Input', () => {
  it('starts with nobody completed, everyone on zero, and a fresh per-kind hand each', () => {
    expect(createPhase10Input(ids)).toEqual({
      completed: { A: false, B: false, C: false },
      penalty: { A: 0, B: 0, C: 0 },
      hands: {
        A: { low: 0, high: 0, skip: 0, wild: 0 },
        B: { low: 0, high: 0, skip: 0, wild: 0 },
        C: { low: 0, high: 0, skip: 0, wild: 0 },
      },
    });
  });
});

// ---- per-kind hand tally -------------------------------------------------------

describe('emptyHand', () => {
  it('is a zeroed per-kind hand', () => {
    expect(emptyHand()).toEqual({ low: 0, high: 0, skip: 0, wild: 0 });
  });
});

describe('handValue', () => {
  it('sums card counts × their official point values', () => {
    expect(handValue({ low: 2, high: 1, skip: 1, wild: 1 })).toBe(
      2 * CARD_VALUE.low + CARD_VALUE.high + CARD_VALUE.skip + CARD_VALUE.wild,
    );
  });

  it('treats a missing hand as zero', () => {
    expect(handValue(undefined)).toBe(0);
  });

  it('clamps negative counts to zero', () => {
    expect(handValue({ low: -5, high: -1, skip: 0, wild: 3 })).toBe(75);
  });
});

// ---- scoring -------------------------------------------------------------------

describe('scorePhase10', () => {
  it('reads the authoritative penalty field for each player', () => {
    const input = createPhase10Input(ids);
    input.penalty = { A: 0, B: 20, C: 45 };
    expect(scorePhase10(input, ids)).toEqual({ A: 0, B: 20, C: 45 });
  });

  it('clamps negative penalties to zero', () => {
    const input = createPhase10Input(ids);
    input.penalty = { A: -10, B: 0, C: 5 };
    expect(scorePhase10(input, ids)).toEqual({ A: 0, B: 0, C: 5 });
  });
});

// ---- validation -----------------------------------------------------------------

describe('validatePhase10', () => {
  it('rejects a negative penalty, naming the player', () => {
    const input = createPhase10Input(ids);
    input.penalty.B = -5;
    expect(validatePhase10(input, players)).toContain('Bob');
  });

  it('passes a well-formed hand', () => {
    const input = createPhase10Input(ids);
    input.penalty = { A: 0, B: 20, C: 45 };
    expect(validatePhase10(input, players)).toBeNull();
  });
});

// ---- phase replay ---------------------------------------------------------------

describe('phasesAfter', () => {
  it('starts everyone at phase 1 with no hands recorded', () => {
    expect(phasesAfter([], ids)).toEqual({ A: 1, B: 1, C: 1 });
  });

  it('advances only the players who completed their phase that hand', () => {
    const r0 = round(0, { A: true, B: false, C: true });
    expect(phasesAfter([r0], ids)).toEqual({ A: 2, B: 1, C: 2 });
  });

  it('accumulates across many hands, oldest first regardless of input order', () => {
    const r0 = round(0, { A: true, B: false, C: false });
    const r1 = round(1, { A: true, B: true, C: false });
    const r2 = round(2, { A: false, B: true, C: true });
    // Shuffle the order passed in — phasesAfter must sort by index itself.
    expect(phasesAfter([r2, r0, r1], ids)).toEqual({ A: 3, B: 3, C: 2 });
  });

  it('stops advancing once a player clears Phase 10', () => {
    const rounds = Array.from({ length: 10 }, (_, i) => round(i, { A: true, B: false, C: false }));
    // After 10 straight completions A has cleared Phase 10 (phase 11).
    expect(phasesAfter(rounds, ids).A).toBe(11);
    // An eleventh completion shouldn't push it any higher.
    const eleventh = round(10, { A: true, B: false, C: false });
    expect(phasesAfter([...rounds, eleventh], ids).A).toBe(11);
  });
});

describe('phasesBefore', () => {
  it('excludes the hand at roundIndex and everything after it', () => {
    const r0 = round(0, { A: true, B: false, C: false });
    const r1 = round(1, { A: true, B: true, C: false });
    expect(phasesBefore([r0, r1], 1, ids)).toEqual({ A: 2, B: 1, C: 1 });
    expect(phasesBefore([r0, r1], 0, ids)).toEqual({ A: 1, B: 1, C: 1 });
  });
});

describe('hasWon / phaseLabel', () => {
  it('hasWon is true only once phase exceeds the phase count', () => {
    expect(hasWon(10)).toBe(false);
    expect(hasWon(11)).toBe(true);
  });

  it('phaseLabel names the phase and its requirement', () => {
    expect(phaseLabel(1)).toBe('Phase 1 · 2 sets of 3');
    expect(phaseLabel(10)).toBe('Phase 10 · 1 set of 5 + 1 set of 3');
  });

  it('phaseLabel flags a win distinctly', () => {
    expect(phaseLabel(11)).toMatch(/complete/i);
  });
});

// ---- end condition & winners -----------------------------------------------------

describe('isPhase10Finished', () => {
  it('is false while nobody has cleared Phase 10', () => {
    const r0 = round(0, { A: true, B: false, C: false });
    expect(isPhase10Finished([r0], ids)).toBe(false);
  });

  it('is true the instant any player clears Phase 10', () => {
    const rounds = Array.from({ length: 10 }, (_, i) => round(i, { A: true, B: false, C: false }));
    expect(isPhase10Finished(rounds, ids)).toBe(true);
  });

  it('handles no recorded rounds', () => {
    expect(isPhase10Finished(undefined, ids)).toBe(false);
  });
});

describe('pickPhase10Winners', () => {
  it('returns no winner before anyone has cleared Phase 10', () => {
    const r0 = round(0, { A: true, B: false, C: false });
    expect(pickPhase10Winners({ A: 5, B: 20, C: 15 }, [r0])).toEqual([]);
  });

  it('crowns the sole player who cleared Phase 10', () => {
    const rounds = Array.from({ length: 10 }, (_, i) => round(i, { A: true, B: false, C: false }));
    expect(pickPhase10Winners({ A: 30, B: 90, C: 60 }, rounds)).toEqual(['A']);
  });

  it('breaks a simultaneous-finish tie by lowest total points', () => {
    // A and B both clear Phase 10 on the same, final hand.
    const rounds = Array.from({ length: 9 }, (_, i) =>
      round(i, { A: true, B: true, C: false }),
    );
    rounds.push(round(9, { A: true, B: true, C: false }));
    expect(pickPhase10Winners({ A: 40, B: 25, C: 200 }, rounds)).toEqual(['B']);
  });

  it('crowns both finishers when their points are exactly tied', () => {
    const rounds = Array.from({ length: 10 }, (_, i) => round(i, { A: true, B: true, C: false }));
    expect(pickPhase10Winners({ A: 50, B: 50, C: 300 }, rounds)).toEqual(['A', 'B']);
  });
});

// ---- module wiring ----------------------------------------------------------------

describe('phase10 module', () => {
  it('has the expected identity and roster', () => {
    expect(phase10.id).toBe('phase10');
    expect(phase10.name).toBe('Phase 10');
    expect(phase10.minPlayers).toBe(2);
    expect(phase10.maxPlayers).toBe(6);
    expect(phase10.lowerIsBetter).toBe(true);
  });

  it('builds a fresh input and validates/scores through the context', () => {
    const fresh = phase10.createRoundInput(ctx()) as Phase10Input;
    expect(fresh.completed).toEqual({ A: false, B: false, C: false });
    expect(fresh.penalty).toEqual({ A: 0, B: 0, C: 0 });

    const hand: Phase10Input = {
      completed: { A: true, B: false, C: false },
      penalty: { A: 0, B: 20, C: 45 },
    };
    expect(phase10.validateRound(hand, ctx())).toBeNull();
    expect(phase10.scoreRound(hand, ctx())).toEqual({ A: 0, B: 20, C: 45 });
  });

  it('is not finished while nobody has cleared Phase 10', () => {
    const r0 = round(0, { A: true, B: false, C: false });
    expect(
      phase10.isFinished?.(
        { A: 0, B: 10, C: 5 },
        { config: {}, roundCount: 1, playerCount: 3, rounds: [r0] },
      ),
    ).toBe(false);
  });

  it('is finished once a player clears Phase 10', () => {
    const rounds = Array.from({ length: 10 }, (_, i) => round(i, { A: true, B: false, C: false }));
    expect(
      phase10.isFinished?.(
        { A: 0, B: 90, C: 60 },
        { config: {}, roundCount: 10, playerCount: 3, rounds },
      ),
    ).toBe(true);
  });

  it('pickWinners crowns the player who cleared Phase 10, tie-broken by lowest points', () => {
    const rounds = Array.from({ length: 10 }, (_, i) => round(i, { A: true, B: true, C: false }));
    expect(phase10.pickWinners?.({ A: 40, B: 25, C: 200 }, {}, rounds)).toEqual(['B']);
  });

  it('summarises a recorded round for the history table', () => {
    const r = round(0, { A: true, B: false, C: false }, { B: 20, C: 5 });
    expect(phase10.describeRound?.(r, players)).toBe('✅ Alice advanced · 25 pts on the table');
  });

  it('describes a hand where nobody advanced', () => {
    const r = round(0, { A: false, B: false, C: false }, { A: 5, B: 20, C: 5 });
    expect(phase10.describeRound?.(r, players)).toBe('nobody advanced · 30 pts on the table');
  });
});

// ---- stats --------------------------------------------------------------------------

describe('phase10Stats', () => {
  const game: Game = {
    id: 'g1',
    type: 'phase10',
    config: {},
    playerIds: ids,
    status: 'finished',
    createdAt: 0,
    roundCount: 10,
  };
  const rounds = Array.from({ length: 10 }, (_, i) =>
    round(i, { A: true, B: i === 9, C: false }, { B: 10, C: 15 }),
  );

  const res = phase10Stats({ games: [game], rounds, players, canonical: (id) => id });
  const perPlayer = res.perPlayer ?? {};
  const global = res.global ?? [];

  it('credits the player who cleared Phase 10', () => {
    const a = perPlayer['A'] ?? [];
    expect(a.find((m) => m.key === 'p10_clears')?.value).toBe('1');
    expect(a.find((m) => m.key === 'p10_best')?.value).toBe('Phase 10');
  });

  it('tracks best phase reached for a player who never finished', () => {
    const c = perPlayer['C'] ?? [];
    expect(c.find((m) => m.key === 'p10_clears')).toBeUndefined();
    expect(c.find((m) => m.key === 'p10_best')?.value).toBe('Phase 1');
    expect(c.find((m) => m.key === 'p10_penalty')?.value).toBe('150');
  });

  it('reports the global clear count', () => {
    expect(global.find((m) => m.key === 'p10_clears_all')?.value).toBe('1');
  });

  it('ignores rounds from other games', () => {
    const only = phase10Stats({ games: [], rounds, players, canonical: (id) => id });
    expect(only.perPlayer ?? {}).toEqual({});
    expect(only.global ?? []).toEqual([]);
  });
});
