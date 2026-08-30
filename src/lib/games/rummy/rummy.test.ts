import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import { rummy } from './index';
import { rummyStats } from './stats';
import {
  aceValue,
  createRummyInput,
  emptyHand,
  handValue,
  isRummyFinished,
  opponentsTotal,
  readConfig,
  scoreRummy,
  validateRummy,
  type RummyInput,
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

function ctx(config: Record<string, unknown>): RoundContext {
  return {
    game: {} as Game,
    players,
    config,
    roundIndex: 0,
    totals: {},
    rounds: [],
  };
}

function input(out: ID | null, left: Record<ID, number>, wentRummy = false): RummyInput {
  return { out, left, wentRummy };
}

// ---- config ------------------------------------------------------------------

describe('readConfig', () => {
  it('fills defaults when empty', () => {
    expect(readConfig({})).toEqual({ target: 100, aceHigh: false, allowRummyBonus: true });
  });

  it('honours overrides and coerces numeric strings', () => {
    const c = readConfig({ target: '500', aceHigh: true, allowRummyBonus: false });
    expect(c).toEqual({ target: 500, aceHigh: true, allowRummyBonus: false });
  });

  it('falls back on garbage values', () => {
    const c = readConfig({ target: 'nope', aceHigh: 'yes', allowRummyBonus: 'no' });
    expect(c).toEqual({ target: 100, aceHigh: false, allowRummyBonus: true });
  });
});

describe('aceValue', () => {
  it('is 1 when low (default)', () => {
    expect(aceValue({ aceHigh: false })).toBe(1);
  });

  it('is 15 when high', () => {
    expect(aceValue({ aceHigh: true })).toBe(15);
  });
});

// ---- round input -------------------------------------------------------------

describe('createRummyInput', () => {
  it('starts with nobody out, everyone on zero, and a fresh per-kind hand each', () => {
    expect(createRummyInput(ids)).toEqual({
      out: null,
      left: { A: 0, B: 0, C: 0 },
      hands: {
        A: { pips: 0, faces: 0, aces: 0 },
        B: { pips: 0, faces: 0, aces: 0 },
        C: { pips: 0, faces: 0, aces: 0 },
      },
      wentRummy: false,
    });
  });
});

// ---- per-kind hand tally -------------------------------------------------------

describe('emptyHand', () => {
  it('is a zeroed per-kind hand', () => {
    expect(emptyHand()).toEqual({ pips: 0, faces: 0, aces: 0 });
  });
});

describe('handValue', () => {
  const cfg = { aceHigh: false };

  it('sums pips plus 10 per face card plus ace value per ace', () => {
    expect(handValue({ pips: 12, faces: 2, aces: 1 }, cfg)).toBe(12 + 20 + 1);
  });

  it('treats a missing hand as zero', () => {
    expect(handValue(undefined, cfg)).toBe(0);
  });

  it('clamps negative counts to zero', () => {
    expect(handValue({ pips: -5, faces: -1, aces: 3 }, cfg)).toBe(3);
  });

  it('honours ace-high scoring', () => {
    expect(handValue({ pips: 0, faces: 1, aces: 2 }, { aceHigh: true })).toBe(10 + 30);
  });
});

// ---- helpers: opponentsTotal ---------------------------------------------------

describe('opponentsTotal', () => {
  it('sums everyone except the player who went out and clamps negatives', () => {
    expect(opponentsTotal(input('A', { A: 100, B: 25, C: 40 }), ids)).toBe(65);
    expect(opponentsTotal(input('A', { A: 0, B: -5, C: 40 }), ids)).toBe(40);
  });
});

// ---- validation -----------------------------------------------------------------

describe('validateRummy', () => {
  it('requires a player to have gone out', () => {
    expect(validateRummy(input(null, { A: 0, B: 0, C: 0 }), players)).toMatch(/went out/i);
  });

  it('rejects a winner who is not in the game', () => {
    expect(validateRummy(input('Z', { A: 0, B: 0, C: 0 }), players)).toMatch(/not in this game/i);
  });

  it('rejects negative leftovers, naming the player', () => {
    expect(validateRummy(input('A', { A: 0, B: -1, C: 0 }), players)).toContain('Bob');
  });

  it('passes a well-formed hand', () => {
    expect(validateRummy(input('A', { A: 0, B: 20, C: 5 }), players)).toBeNull();
  });
});

// ---- scoring ---------------------------------------------------------------------

describe('scoreRummy', () => {
  it('gives the player who went out the sum of the others’ deadwood', () => {
    const out = scoreRummy(input('A', { A: 0, B: 25, C: 40 }), ids, {});
    expect(out).toEqual({ A: 65, B: 0, C: 0 });
  });

  it('scores nothing while no winner is chosen yet', () => {
    expect(scoreRummy(input(null, { A: 5, B: 5, C: 5 }), ids, {})).toEqual({
      A: 0,
      B: 0,
      C: 0,
    });
  });

  it('ignores any stray leftover on the player who went out', () => {
    const out = scoreRummy(input('A', { A: 999, B: 10, C: 10 }), ids, {});
    expect(out).toEqual({ A: 20, B: 0, C: 0 });
  });

  it('doubles the score for a "went Rummy" hand when the bonus is allowed', () => {
    const out = scoreRummy(input('A', { A: 0, B: 25, C: 40 }, true), ids, {
      allowRummyBonus: true,
    });
    expect(out).toEqual({ A: 130, B: 0, C: 0 });
  });

  it('ignores the "went Rummy" flag when the bonus is disabled', () => {
    const out = scoreRummy(input('A', { A: 0, B: 25, C: 40 }, true), ids, {
      allowRummyBonus: false,
    });
    expect(out).toEqual({ A: 65, B: 0, C: 0 });
  });
});

// ---- end condition ----------------------------------------------------------------

describe('isRummyFinished', () => {
  it('ends when any total reaches the target', () => {
    expect(isRummyFinished({ A: 100, B: 40 }, { target: 100 })).toBe(true);
    expect(isRummyFinished({ A: 99, B: 40 }, { target: 100 })).toBe(false);
  });

  it('never ends when the target is 0', () => {
    expect(isRummyFinished({ A: 9999 }, { target: 0 })).toBe(false);
  });

  it('defaults to a target of 100', () => {
    expect(isRummyFinished({ A: 100 }, {})).toBe(true);
    expect(isRummyFinished({ A: 99 }, {})).toBe(false);
  });
});

// ---- module wiring -----------------------------------------------------------------

describe('rummy module', () => {
  it('has the expected identity and roster', () => {
    expect(rummy.id).toBe('rummy');
    expect(rummy.name).toBe('Rummy');
    expect(rummy.minPlayers).toBe(2);
    expect(rummy.maxPlayers).toBe(6);
  });

  it('builds a fresh input and validates/scores through the context', () => {
    const fresh = rummy.createRoundInput(ctx({})) as RummyInput;
    expect(fresh).toEqual({
      out: null,
      left: { A: 0, B: 0, C: 0 },
      hands: {
        A: { pips: 0, faces: 0, aces: 0 },
        B: { pips: 0, faces: 0, aces: 0 },
        C: { pips: 0, faces: 0, aces: 0 },
      },
      wentRummy: false,
    });

    const hand = input('A', { A: 0, B: 25, C: 40 });
    expect(rummy.validateRound(hand, ctx({}))).toBeNull();
    expect(rummy.scoreRound(hand, ctx({}))).toEqual({ A: 65, B: 0, C: 0 });
  });

  it('ends the game via isFinished at the target', () => {
    expect(
      rummy.isFinished?.({ A: 110, B: 60 }, { config: {}, roundCount: 4, playerCount: 3 }),
    ).toBe(true);
  });

  it('crowns the highest total (default winner logic)', () => {
    const totals = { A: 80, B: 110, C: 40 };
    expect(defaultWinners(rummy, totals, {})).toEqual(['B']);
  });

  it('summarises a recorded round for the history table', () => {
    const round = { input: input('A', { A: 0, B: 25, C: 40 }) } as Round;
    expect(rummy.describeRound?.(round, players)).toBe('🎴 Alice out · 65 deadwood left');
  });

  it('describes a hand where everyone else was empty as a clean sweep', () => {
    const round = { input: input('B', { A: 0, B: 0, C: 0 }) } as Round;
    expect(rummy.describeRound?.(round, players)).toBe('🎴 Bob out · clean sweep');
  });

  it('flags a "went Rummy" round in the history summary', () => {
    const round = { input: input('A', { A: 0, B: 25, C: 40 }, true) } as Round;
    expect(rummy.describeRound?.(round, players)).toBe(
      '🎴 Alice out · 65 deadwood left · went Rummy! ×2',
    );
  });
});

// ---- stats ------------------------------------------------------------------------

describe('rummyStats', () => {
  const game: Game = {
    id: 'g1',
    type: 'rummy',
    config: {},
    playerIds: ids,
    status: 'finished',
    createdAt: 0,
    roundCount: 2,
  };
  const rounds = [
    {
      id: 'r1',
      gameId: 'g1',
      index: 0,
      input: input('A', { A: 0, B: 20, C: 35 }),
      deltas: {},
      createdAt: 0,
    },
    {
      id: 'r2',
      gameId: 'g1',
      index: 1,
      input: input('B', { A: 5, B: 0, C: 50 }, true),
      deltas: {},
      createdAt: 0,
    },
  ] as Round[];

  const res = rummyStats({ games: [game], rounds, players, canonical: (id) => id });
  const perPlayer = res.perPlayer ?? {};
  const global = res.global ?? [];

  it('counts go-outs and go-out rate per player', () => {
    const a = perPlayer['A'] ?? [];
    expect(a.find((m) => m.key === 'r_out')?.value).toBe('1');
    expect(a.find((m) => m.key === 'r_rate')?.value).toBe('50%');
  });

  it('omits the go-out metric for a player who never went out', () => {
    const c = perPlayer['C'] ?? [];
    expect(c.find((m) => m.key === 'r_out')).toBeUndefined();
    expect(c.find((m) => m.key === 'r_stuck')?.value).toBe('85');
  });

  it('counts went-Rummy bonuses for the winner', () => {
    const b = perPlayer['B'] ?? [];
    expect(b.find((m) => m.key === 'r_rummy')?.value).toBe('1');
  });

  it('reports totals, the biggest hand (doubled), and rummy bonuses globally', () => {
    expect(global.find((m) => m.key === 'r_out_all')?.value).toBe('2');
    expect(global.find((m) => m.key === 'r_scoop')?.value).toBe('110');
    expect(global.find((m) => m.key === 'r_rummy_all')?.value).toBe('1');
  });

  it('ignores rounds from other games', () => {
    const only = rummyStats({ games: [], rounds, players, canonical: (id) => id });
    expect(only.perPlayer ?? {}).toEqual({});
    expect(only.global ?? []).toEqual([]);
  });
});
