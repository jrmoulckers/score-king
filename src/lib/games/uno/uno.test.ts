import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import { uno } from './index';
import { unoStats } from './stats';
import {
  createUnoInput,
  emptyHand,
  handValue,
  isUnoFinished,
  opponentsTotal,
  readConfig,
  scoreUno,
  validateUno,
  type UnoInput,
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

function input(out: ID | null, left: Record<ID, number>): UnoInput {
  return { out, left };
}

// ---- config ----------------------------------------------------------------

describe('readConfig', () => {
  it('fills defaults when empty', () => {
    expect(readConfig({})).toEqual({ target: 500, mode: 'winner', actionValue: 20, wildValue: 50 });
  });

  it('honours overrides and coerces numeric strings', () => {
    const c = readConfig({ target: '250', mode: 'golf', actionValue: '15', wildValue: 40 });
    expect(c).toEqual({ target: 250, mode: 'golf', actionValue: 15, wildValue: 40 });
  });

  it('falls back on garbage values and unknown modes', () => {
    const c = readConfig({ target: 'nope', mode: 'chaos', actionValue: null, wildValue: undefined });
    expect(c).toEqual({ target: 500, mode: 'winner', actionValue: 20, wildValue: 50 });
  });
});

// ---- round input -----------------------------------------------------------

describe('createUnoInput', () => {
  it('starts with nobody out, everyone on zero, and a fresh per-kind hand each', () => {
    expect(createUnoInput(ids)).toEqual({
      out: null,
      left: { A: 0, B: 0, C: 0 },
      hands: {
        A: { numbers: 0, actions: 0, wilds: 0 },
        B: { numbers: 0, actions: 0, wilds: 0 },
        C: { numbers: 0, actions: 0, wilds: 0 },
      },
    });
  });
});

// ---- per-kind hand tally ---------------------------------------------------

describe('emptyHand', () => {
  it('is a zeroed per-kind hand', () => {
    expect(emptyHand()).toEqual({ numbers: 0, actions: 0, wilds: 0 });
  });
});

describe('handValue', () => {
  const cfg = { actionValue: 20, wildValue: 50 };

  it('sums number face value plus action and wild counts × their values', () => {
    expect(handValue({ numbers: 12, actions: 2, wilds: 1 }, cfg)).toBe(12 + 40 + 50);
  });

  it('treats a missing hand as zero', () => {
    expect(handValue(undefined, cfg)).toBe(0);
  });

  it('clamps negative counts to zero', () => {
    expect(handValue({ numbers: -5, actions: -1, wilds: 3 }, cfg)).toBe(150);
  });

  it('honours custom card values', () => {
    expect(handValue({ numbers: 0, actions: 1, wilds: 1 }, { actionValue: 15, wildValue: 40 })).toBe(55);
  });
});

// ---- scoring: standard (winner scoops) -------------------------------------

describe('scoreUno — standard (winner scoops)', () => {
  it('gives the player who went out the sum of the others’ leftovers', () => {
    const out = scoreUno(input('A', { A: 0, B: 25, C: 40 }), ids, { mode: 'winner' });
    expect(out).toEqual({ A: 65, B: 0, C: 0 });
  });

  it('defaults to winner mode when no mode is set', () => {
    expect(scoreUno(input('B', { A: 12, B: 0, C: 3 }), ids, {})).toEqual({ A: 0, B: 15, C: 0 });
  });

  it('scores nothing while no winner is chosen yet', () => {
    expect(scoreUno(input(null, { A: 5, B: 5, C: 5 }), ids, { mode: 'winner' })).toEqual({
      A: 0,
      B: 0,
      C: 0,
    });
  });

  it('ignores any stray leftover on the player who went out', () => {
    const out = scoreUno(input('A', { A: 999, B: 10, C: 10 }), ids, { mode: 'winner' });
    expect(out).toEqual({ A: 20, B: 0, C: 0 });
  });
});

// ---- scoring: golf (own cards, low wins) -----------------------------------

describe('scoreUno — golf (own cards)', () => {
  it('each player banks their own leftover; the one who went out banks 0', () => {
    const out = scoreUno(input('A', { A: 0, B: 25, C: 40 }), ids, { mode: 'golf' });
    expect(out).toEqual({ A: 0, B: 25, C: 40 });
  });

  it('forces the winner to 0 even with a stray leftover', () => {
    const out = scoreUno(input('C', { A: 8, B: 3, C: 50 }), ids, { mode: 'golf' });
    expect(out).toEqual({ A: 8, B: 3, C: 0 });
  });
});

// ---- helpers: opponentsTotal ----------------------------------------------

describe('opponentsTotal', () => {
  it('sums everyone except the player who went out and clamps negatives', () => {
    expect(opponentsTotal(input('A', { A: 100, B: 25, C: 40 }), ids)).toBe(65);
    expect(opponentsTotal(input('A', { A: 0, B: -5, C: 40 }), ids)).toBe(40);
  });
});

// ---- validation ------------------------------------------------------------

describe('validateUno', () => {
  it('requires a player to have gone out', () => {
    expect(validateUno(input(null, { A: 0, B: 0, C: 0 }), players)).toMatch(/went out/i);
  });

  it('rejects a winner who is not in the game', () => {
    expect(validateUno(input('Z', { A: 0, B: 0, C: 0 }), players)).toMatch(/not in this game/i);
  });

  it('rejects negative leftovers, naming the player', () => {
    expect(validateUno(input('A', { A: 0, B: -1, C: 0 }), players)).toContain('Bob');
  });

  it('passes a well-formed hand', () => {
    expect(validateUno(input('A', { A: 0, B: 20, C: 5 }), players)).toBeNull();
  });
});

// ---- end condition ---------------------------------------------------------

describe('isUnoFinished', () => {
  it('ends when any total reaches the target (standard)', () => {
    expect(isUnoFinished({ A: 500, B: 120 }, { target: 500 })).toBe(true);
    expect(isUnoFinished({ A: 499, B: 120 }, { target: 500 })).toBe(false);
  });

  it('ends in golf too — the low score just wins afterwards', () => {
    expect(isUnoFinished({ A: 60, B: 100 }, { mode: 'golf', target: 100 })).toBe(true);
  });

  it('never ends when the target is 0', () => {
    expect(isUnoFinished({ A: 9999 }, { target: 0 })).toBe(false);
  });
});

// ---- module wiring ---------------------------------------------------------

describe('uno module', () => {
  it('has the expected identity and roster', () => {
    expect(uno.id).toBe('uno');
    expect(uno.name).toBe('Uno');
    expect(uno.minPlayers).toBe(2);
    expect(uno.maxPlayers).toBe(10);
  });

  it('resolves win direction from the scoring mode', () => {
    expect(uno.resolveLowerIsBetter?.({ mode: 'golf' })).toBe(true);
    expect(uno.resolveLowerIsBetter?.({ mode: 'winner' })).toBe(false);
    expect(uno.resolveLowerIsBetter?.({})).toBe(false);
  });

  it('builds a fresh input and validates/scores through the context', () => {
    const fresh = uno.createRoundInput(ctx({})) as UnoInput;
    expect(fresh).toEqual({
      out: null,
      left: { A: 0, B: 0, C: 0 },
      hands: {
        A: { numbers: 0, actions: 0, wilds: 0 },
        B: { numbers: 0, actions: 0, wilds: 0 },
        C: { numbers: 0, actions: 0, wilds: 0 },
      },
    });

    const hand = input('A', { A: 0, B: 25, C: 40 });
    expect(uno.validateRound(hand, ctx({ mode: 'winner' }))).toBeNull();
    expect(uno.scoreRound(hand, ctx({ mode: 'winner' }))).toEqual({ A: 65, B: 0, C: 0 });
    expect(uno.scoreRound(hand, ctx({ mode: 'golf' }))).toEqual({ A: 0, B: 25, C: 40 });
  });

  it('scores from the authoritative left total even when a hands breakdown is present', () => {
    // The editor keeps `left` in sync with `hands`; scoring only ever reads `left`, so a
    // stale/absent breakdown can never change the points.
    const hand: UnoInput = {
      out: 'A',
      left: { A: 0, B: 25, C: 40 },
      hands: {
        A: { numbers: 0, actions: 0, wilds: 0 },
        B: { numbers: 5, actions: 1, wilds: 0 },
        C: { numbers: 0, actions: 2, wilds: 0 },
      },
    };
    expect(uno.scoreRound(hand, ctx({ mode: 'winner' }))).toEqual({ A: 65, B: 0, C: 0 });
  });

  it('ends the game via isFinished at the target', () => {
    expect(uno.isFinished?.({ A: 510, B: 90 }, { config: {}, roundCount: 8, playerCount: 3 })).toBe(
      true,
    );
  });

  it('crowns the highest total in standard and the lowest in golf', () => {
    const totals = { A: 480, B: 500, C: 260 };
    expect(defaultWinners(uno, totals, { mode: 'winner' })).toEqual(['B']);
    expect(defaultWinners(uno, totals, { mode: 'golf' })).toEqual(['C']);
  });

  it('summarises a recorded round for the history table (mode-neutral)', () => {
    const round = { input: input('A', { A: 0, B: 25, C: 40 }) } as Round;
    expect(uno.describeRound?.(round, players)).toBe('🎉 Alice out · 65 left in hands');
  });

  it('describes a hand where everyone else was empty as a clean sweep', () => {
    const round = { input: input('B', { A: 0, B: 0, C: 0 }) } as Round;
    expect(uno.describeRound?.(round, players)).toBe('🎉 Bob out · clean sweep');
  });
});

// ---- stats -----------------------------------------------------------------

describe('unoStats', () => {
  const game: Game = {
    id: 'g1',
    type: 'uno',
    config: {},
    playerIds: ids,
    status: 'finished',
    createdAt: 0,
    roundCount: 2,
  };
  const rounds = [
    { id: 'r1', gameId: 'g1', index: 0, input: input('A', { A: 0, B: 20, C: 35 }), deltas: {}, createdAt: 0 },
    { id: 'r2', gameId: 'g1', index: 1, input: input('B', { A: 5, B: 0, C: 50 }), deltas: {}, createdAt: 0 },
  ] as Round[];

  const res = unoStats({ games: [game], rounds, players, canonical: (id) => id });
  const perPlayer = res.perPlayer ?? {};
  const global = res.global ?? [];

  it('counts go-outs and go-out rate per player', () => {
    const a = perPlayer['A'] ?? [];
    expect(a.find((m) => m.key === 'u_out')?.value).toBe('1');
    expect(a.find((m) => m.key === 'u_rate')?.value).toBe('50%');
  });

  it('omits the go-out metric for a player who never went out', () => {
    const c = perPlayer['C'] ?? [];
    expect(c.find((m) => m.key === 'u_out')).toBeUndefined();
    expect(c.find((m) => m.key === 'u_stuck')?.value).toBe('85');
  });

  it('reports totals and the biggest hand counted globally', () => {
    expect(global.find((m) => m.key === 'u_out_all')?.value).toBe('2');
    expect(global.find((m) => m.key === 'u_scoop')?.value).toBe('55');
  });

  it('ignores rounds from other games', () => {
    const only = unoStats({ games: [], rounds, players, canonical: (id) => id });
    expect(only.perPlayer ?? {}).toEqual({});
    expect(only.global ?? []).toEqual([]);
  });
});
