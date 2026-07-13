import { describe, expect, it } from 'vitest';
import type { Game, Player, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import {
  DEFAULTS,
  closestToPin,
  emptyHand,
  handStrokes,
  resolveConfig,
  scoreHole,
  validateHole,
  type UnoGolfInput,
} from './logic';
import { unogolf } from './index';
import { unogolfStats } from './stats';

const player = (id: string, name = id.toUpperCase()): Player => ({
  id,
  name,
  color: '#7c5cff',
  createdAt: 0,
});

const players = [player('a'), player('b'), player('c')];
const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?';

function ctxOf(
  config: Record<string, unknown> = {},
  roundIndex = 0,
  ps: Player[] = players,
): RoundContext {
  const game: Game = {
    id: 'g',
    type: 'unogolf',
    config,
    playerIds: ps.map((p) => p.id),
    status: 'active',
    createdAt: 0,
    roundCount: 0,
  };
  return {
    game,
    players: ps,
    config,
    roundIndex,
    totals: Object.fromEntries(ps.map((p) => [p.id, 0])),
    rounds: [],
  };
}

function mkRound(input: UnoGolfInput, deltas: Record<string, number>, index = 0): Round {
  return { id: `g-${index}`, gameId: 'g', index, input, deltas, createdAt: 0 };
}

describe('resolveConfig', () => {
  it('falls back to sensible defaults', () => {
    expect(resolveConfig({})).toEqual(DEFAULTS);
    expect(resolveConfig(undefined)).toEqual(DEFAULTS);
  });

  it('normalises the format and clamps numbers', () => {
    const cfg = resolveConfig({
      format: 'nonsense',
      holes: 0,
      target: -5,
      actionValue: -3,
      wildValue: 'x',
    });
    expect(cfg.format).toBe('holes');
    expect(cfg.holes).toBe(1); // clamped to >= 1
    expect(cfg.target).toBe(1); // clamped to >= 1
    expect(cfg.actionValue).toBe(0); // clamped to >= 0
    expect(cfg.wildValue).toBe(DEFAULTS.wildValue); // invalid -> default
  });

  it('accepts a target format and custom card values', () => {
    const cfg = resolveConfig({ format: 'target', holes: 12, actionValue: 10, wildValue: 25 });
    expect(cfg).toEqual({ holes: 12, format: 'target', target: 100, actionValue: 10, wildValue: 25 });
  });
});

describe('handStrokes', () => {
  const vals = { actionValue: 20, wildValue: 50 };

  it('sums number faces + action + wild values', () => {
    expect(handStrokes({ numbers: 7, actions: 1, wilds: 0 }, vals)).toBe(27);
    expect(handStrokes({ numbers: 12, actions: 2, wilds: 1 }, vals)).toBe(12 + 40 + 50);
  });

  it('treats an empty or missing hand as zero', () => {
    expect(handStrokes(emptyHand(), vals)).toBe(0);
    expect(handStrokes(undefined, vals)).toBe(0);
  });

  it('clamps negatives and coerces junk to zero', () => {
    expect(handStrokes({ numbers: -5, actions: -1, wilds: -2 }, vals)).toBe(0);
    expect(
      handStrokes({ numbers: NaN as unknown as number, actions: 1, wilds: 0 }, vals),
    ).toBe(20);
  });

  it('honours custom card values', () => {
    expect(handStrokes({ numbers: 5, actions: 2, wilds: 1 }, { actionValue: 10, wildValue: 25 })).toBe(
      5 + 20 + 25,
    );
  });
});

describe('scoreHole', () => {
  const input: UnoGolfInput = {
    hands: {
      a: { numbers: 5, actions: 1, wilds: 0 },
      b: emptyHand(),
      c: { numbers: 12, actions: 2, wilds: 1 },
    },
    out: 'b',
  };

  it('scores the player who went out as zero, others by their hand', () => {
    const out = scoreHole(input, ['a', 'b', 'c'], DEFAULTS);
    expect(out).toEqual({ a: 25, b: 0, c: 102 });
  });

  it('scales with the configured card values', () => {
    const out = scoreHole(input, ['a', 'b', 'c'], { ...DEFAULTS, actionValue: 10, wildValue: 25 });
    expect(out).toEqual({ a: 15, b: 0, c: 12 + 20 + 25 });
  });

  it('emits a zero for a player with no recorded hand', () => {
    const out = scoreHole({ hands: {}, out: null }, ['a', 'b'], DEFAULTS);
    expect(out).toEqual({ a: 0, b: 0 });
  });
});

describe('closestToPin', () => {
  const vals = { actionValue: 20, wildValue: 50 };

  it('picks the non-sinker holding the fewest strokes', () => {
    const input: UnoGolfInput = {
      hands: {
        a: { numbers: 3, actions: 0, wilds: 0 },
        b: emptyHand(),
        c: { numbers: 9, actions: 0, wilds: 0 },
      },
      out: 'b',
    };
    expect(closestToPin(input, ['a', 'b', 'c'], vals)).toBe('a');
  });

  it('returns null when nobody has sunk the hole yet', () => {
    const input: UnoGolfInput = {
      hands: { a: { numbers: 3, actions: 0, wilds: 0 }, b: emptyHand(), c: emptyHand() },
      out: null,
    };
    expect(closestToPin(input, ['a', 'b', 'c'], vals)).toBeNull();
  });

  it('returns null on a tie for the fewest strokes', () => {
    const input: UnoGolfInput = {
      hands: {
        a: { numbers: 5, actions: 0, wilds: 0 },
        b: emptyHand(),
        c: { numbers: 5, actions: 0, wilds: 0 },
      },
      out: 'b',
    };
    expect(closestToPin(input, ['a', 'b', 'c'], vals)).toBeNull();
  });

  it('returns null when only one player is left counting', () => {
    const input: UnoGolfInput = {
      hands: { a: { numbers: 3, actions: 0, wilds: 0 }, b: emptyHand() },
      out: 'b',
    };
    expect(closestToPin(input, ['a', 'b'], vals)).toBeNull();
  });
});

describe('validateHole', () => {
  const good: UnoGolfInput = {
    hands: { a: { numbers: 5, actions: 0, wilds: 0 }, b: emptyHand(), c: emptyHand() },
    out: 'b',
  };

  it('passes a well-formed hole', () => {
    expect(validateHole(good, ['a', 'b', 'c'], nameOf)).toBeNull();
  });

  it('requires someone to be marked out', () => {
    expect(validateHole({ ...good, out: null }, ['a', 'b', 'c'], nameOf)).toMatch(/sank the hole/i);
  });

  it('rejects an out player who is not in the game', () => {
    expect(validateHole({ ...good, out: 'z' }, ['a', 'b', 'c'], nameOf)).toMatch(/isn’t in this game/i);
  });

  it('rejects negative card counts', () => {
    const bad: UnoGolfInput = { hands: { ...good.hands, a: { numbers: -1, actions: 0, wilds: 0 } }, out: 'b' };
    expect(validateHole(bad, ['a', 'b', 'c'], nameOf)).toMatch(/can’t be negative/i);
  });
});

describe('unogolf module metadata', () => {
  it('is a lower-is-better game with the expected identity', () => {
    expect(unogolf.id).toBe('unogolf');
    expect(unogolf.name).toBe('Uno Golf');
    expect(unogolf.lowerIsBetter).toBe(true);
    expect(unogolf.minPlayers).toBeLessThanOrEqual(unogolf.maxPlayers);
    expect(unogolf.help).toBeTruthy();
    expect(unogolf.RoundEditor).toBeTruthy();
  });

  it('picks the lowest total as the winner', () => {
    expect(defaultWinners(unogolf, { a: 25, b: 3, c: 100 })).toEqual(['b']);
  });
});

describe('unogolf round lifecycle', () => {
  it('creates a fresh input with an empty hand per player and nobody out', () => {
    const input = unogolf.createRoundInput(ctxOf()) as UnoGolfInput;
    expect(input.out).toBeNull();
    expect(Object.keys(input.hands).sort()).toEqual(['a', 'b', 'c']);
    for (const id of ['a', 'b', 'c']) expect(input.hands[id]).toEqual(emptyHand());
  });

  it('validates and scores a round through the module using ctx config', () => {
    const input: UnoGolfInput = {
      hands: { a: { numbers: 5, actions: 1, wilds: 0 }, b: emptyHand(), c: { numbers: 0, actions: 0, wilds: 1 } },
      out: 'b',
    };
    const ctx = ctxOf({ actionValue: 10, wildValue: 25 });
    expect(unogolf.validateRound(input, ctx)).toBeNull();
    expect(unogolf.scoreRound(input, ctx)).toEqual({ a: 15, b: 0, c: 25 });
  });

  it('describes a round with the sinker and everyone’s strokes', () => {
    const input: UnoGolfInput = {
      hands: { a: { numbers: 5, actions: 1, wilds: 0 }, b: emptyHand(), c: { numbers: 12, actions: 2, wilds: 1 } },
      out: 'b',
    };
    const round = mkRound(input, { a: 25, b: 0, c: 102 });
    const text = unogolf.describeRound!(round, players);
    expect(text).toContain('⛳ B sank it');
    expect(text).toContain('A +25');
    expect(text).toContain('C +102');
    expect(text).not.toContain('B +');
  });
});

describe('unogolf end conditions', () => {
  it('caps fixed-holes games at the configured hole count', () => {
    expect(unogolf.maxRounds!({}, 4)).toBe(DEFAULTS.holes);
    expect(unogolf.maxRounds!({ holes: 18 }, 4)).toBe(18);
  });

  it('runs target games open-ended (no fixed hole cap)', () => {
    expect(unogolf.maxRounds!({ format: 'target' }, 4)).toBeNull();
  });

  it('finishes a target game once a player reaches the cap', () => {
    const info = { config: { format: 'target', target: 100 }, roundCount: 5, playerCount: 2 };
    expect(unogolf.isFinished!({ a: 90, b: 40 }, info)).toBe(false);
    expect(unogolf.isFinished!({ a: 110, b: 40 }, info)).toBe(true);
  });

  it('never finishes early in fixed-holes format', () => {
    const info = { config: {}, roundCount: 3, playerCount: 2 };
    expect(unogolf.isFinished!({ a: 999, b: 0 }, info)).toBe(false);
  });
});

describe('unogolfStats', () => {
  const games: Game[] = [
    {
      id: 'g1',
      type: 'unogolf',
      config: {},
      playerIds: ['a', 'b', 'c'],
      status: 'finished',
      createdAt: 0,
      roundCount: 2,
    },
  ];
  const rounds: Round[] = [
    {
      id: 'g1-0',
      gameId: 'g1',
      index: 0,
      input: {
        hands: { a: { numbers: 5, actions: 1, wilds: 0 }, b: emptyHand(), c: { numbers: 0, actions: 0, wilds: 1 } },
        out: 'b',
      },
      deltas: { a: 25, b: 0, c: 50 },
      createdAt: 0,
    },
    {
      id: 'g1-1',
      gameId: 'g1',
      index: 1,
      input: {
        hands: { a: emptyHand(), b: { numbers: 3, actions: 0, wilds: 0 }, c: { numbers: 0, actions: 0, wilds: 1 } },
        out: 'a',
      },
      deltas: { a: 0, b: 3, c: 50 },
      createdAt: 0,
    },
  ];

  const res = unogolfStats({ games, rounds, players, canonical: (id) => id });
  const perPlayer = res.perPlayer ?? {};
  const global = res.global ?? [];

  it('reports a scoring average per player', () => {
    expect(perPlayer['a']?.find((m) => m.key === 'ug_avg')?.value).toBe('12.5');
    expect(perPlayer['b']?.find((m) => m.key === 'ug_avg')?.value).toBe('1.5');
    expect(perPlayer['c']?.find((m) => m.key === 'ug_avg')?.value).toBe('50');
  });

  it('counts holes sunk and wilds caught', () => {
    expect(perPlayer['a']?.find((m) => m.key === 'ug_sunk')?.value).toBe('1');
    expect(perPlayer['b']?.find((m) => m.key === 'ug_sunk')?.value).toBe('1');
    // C never sank a hole and carried two wilds.
    expect(perPlayer['c']?.some((m) => m.key === 'ug_sunk')).toBe(false);
    expect(perPlayer['c']?.find((m) => m.key === 'ug_wilds')?.value).toBe('2');
  });

  it('reports each player’s best (fewest-stroke) hole', () => {
    // A: holes of 25 then 0 → best 0. B: 0 then 3 → best 0. C: 50 then 50 → best 50.
    expect(perPlayer['a']?.find((m) => m.key === 'ug_best')?.value).toBe('0');
    expect(perPlayer['b']?.find((m) => m.key === 'ug_best')?.value).toBe('0');
    expect(perPlayer['c']?.find((m) => m.key === 'ug_best')?.value).toBe('50');
  });

  it('aggregates total holes sunk and the course record globally', () => {
    expect(global.find((m) => m.key === 'ug_sunk_all')?.value).toBe('2');
    expect(global.find((m) => m.key === 'ug_record')?.value).toBe('0');
  });
});
