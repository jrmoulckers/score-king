import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import { defaultWinners } from '../../types';
import type { GameStatsInput, Metric } from '../../stats/types';
import { golf } from './index';
import { golfStats } from './stats';
import {
  cardCodes,
  cardValue,
  computeGrid,
  createGolfInput,
  gridCount,
  gridScore,
  gridShape,
  holeCeiling,
  holeFloor,
  holeTag,
  holeVerdict,
  minCardValue,
  readConfig,
  rulesetLines,
  scoreGolf,
  validateGolf,
  type CardCode,
  type GolfConfig,
  type GolfInput,
} from './logic';

const player = (id: string, name = id): Player => ({ id, name, color: '#7c5cff', createdAt: 0 });

function mkCtx(
  players: Player[],
  config: Record<string, unknown> = {},
  extra: Partial<RoundContext> = {},
): RoundContext {
  return {
    game: { id: 'g', type: 'golf', config, playerIds: players.map((p) => p.id), status: 'active', createdAt: 0, roundCount: 0 },
    players,
    config,
    roundIndex: 0,
    totals: {},
    rounds: [],
    ...extra,
  };
}

const cfg = (over: Partial<GolfConfig> = {}): GolfConfig => ({
  holes: 9,
  grid: '6',
  kingValue: 0,
  jokers: false,
  ...over,
});

describe('golf ruleset helpers', () => {
  it('maps grid size to card count with a 6-card default', () => {
    expect(gridCount('4')).toBe(4);
    expect(gridCount('6')).toBe(6);
    expect(gridCount('9')).toBe(9);
    expect(gridCount('nonsense')).toBe(6);
  });

  it('reads + normalises config with sane defaults', () => {
    expect(readConfig({})).toEqual(cfg());
    expect(readConfig({ holes: 18, grid: '9', kingValue: '-2', jokers: true })).toEqual(
      cfg({ holes: 18, grid: '9', kingValue: -2, jokers: true }),
    );
  });

  it('clamps holes into 1..18 and falls back on garbage', () => {
    expect(readConfig({ holes: 0 }).holes).toBe(1);
    expect(readConfig({ holes: 99 }).holes).toBe(18);
    expect(readConfig({ holes: 'x' }).holes).toBe(9);
    expect(readConfig({ holes: 12.7 }).holes).toBe(12);
  });

  it('rejects unknown grid values back to 6-card', () => {
    expect(readConfig({ grid: '5' }).grid).toBe('6');
    expect(readConfig({ grid: '4' }).grid).toBe('4');
  });

  it('derives the min card value only from negative kings / jokers', () => {
    expect(minCardValue(cfg())).toBe(0);
    expect(minCardValue(cfg({ kingValue: -2 }))).toBe(-2);
    expect(minCardValue(cfg({ jokers: true }))).toBe(-2);
    expect(minCardValue(cfg({ kingValue: -2, jokers: true }))).toBe(-2);
  });

  it('computes hole floor and ceiling from the grid + ruleset', () => {
    expect(holeFloor(cfg())).toBe(0);
    expect(holeFloor(cfg({ jokers: true }))).toBe(-12);
    expect(holeFloor(cfg({ grid: '4', kingValue: -2 }))).toBe(-8);
    expect(holeCeiling(cfg())).toBe(72);
    expect(holeCeiling(cfg({ grid: '9' }))).toBe(108);
  });

  it('tags a hole score below / at / above zero', () => {
    expect(holeTag(-3)).toBe('under');
    expect(holeTag(0)).toBe('clean');
    expect(holeTag(7)).toBeNull();
  });

  it('renders a live, config-aware card reference', () => {
    const base = rulesetLines(cfg());
    expect(base[0]).toContain('K 0');
    expect(base[0]).not.toContain('Joker');
    expect(base[2]).toContain('6-card grid');
    expect(base[2]).toContain('9 holes wins');

    const spicy = rulesetLines(cfg({ kingValue: -2, jokers: true, holes: 1 }));
    expect(spicy[0]).toContain('K -2');
    expect(spicy[0]).toContain('Joker −2');
    expect(spicy[2]).toContain('1 hole wins');
  });
});

describe('golf grid helper', () => {
  it('maps grid size to a physical column/row layout', () => {
    expect(gridShape('6')).toEqual({ cols: 3, rows: 2 });
    expect(gridShape('4')).toEqual({ cols: 2, rows: 2 });
    expect(gridShape('9')).toEqual({ cols: 3, rows: 3 });
    expect(gridShape('nonsense')).toEqual({ cols: 3, rows: 2 });
  });

  it('values each card by the common ruleset, honouring the king variant', () => {
    const base = cfg();
    expect(cardValue('A', base)).toBe(1);
    expect(cardValue('7', base)).toBe(7);
    expect(cardValue('10', base)).toBe(10);
    expect(cardValue('J', base)).toBe(10);
    expect(cardValue('Q', base)).toBe(10);
    expect(cardValue('K', base)).toBe(0);
    expect(cardValue('JK', base)).toBe(-2);
    expect(cardValue(null, base)).toBe(0);
    expect(cardValue('K', cfg({ kingValue: -2 }))).toBe(-2);
  });

  it('offers the joker in the picker only when the ruleset enables it', () => {
    expect(cardCodes(cfg())).not.toContain('JK');
    expect(cardCodes(cfg({ jokers: true }))).toContain('JK');
  });

  it('sums a grid with no column matches', () => {
    // 3×2: cols are [0,3] [1,4] [2,5]
    const cells: (CardCode | null)[] = ['A', '5', 'K', '3', 'Q', '2'];
    expect(gridScore(cells, cfg())).toBe(1 + 5 + 0 + 3 + 10 + 2);
  });

  it('cancels a matched pair in one column to zero', () => {
    const cells: (CardCode | null)[] = ['7', '5', 'K', '7', 'Q', '2'];
    const { total, canceled } = computeGrid(cells, cfg());
    expect(total).toBe(5 + 0 + 10 + 2);
    expect(canceled[0]).toBe(true);
    expect(canceled[3]).toBe(true);
    expect(canceled[1]).toBe(false);
  });

  it('cancels matches in two columns independently', () => {
    const cells: (CardCode | null)[] = ['7', '5', '3', '7', '5', '9'];
    expect(gridScore(cells, cfg())).toBe(3 + 9);
  });

  it('lets negative cards drive a hole into the red', () => {
    // Two aces cancel in a column, leaving a lone joker at −2.
    const cells: (CardCode | null)[] = ['JK', 'A', 'A', 'K', 'A', 'A'];
    expect(gridScore(cells, cfg({ jokers: true }))).toBe(-2);
  });

  it('cancels a full column of a kind (triple) to zero on a 3×3 grid', () => {
    const cells: (CardCode | null)[] = ['4', 'A', null, '4', null, null, '4', null, null];
    const { total, canceled } = computeGrid(cells, cfg({ grid: '9' }));
    expect(total).toBe(1);
    expect(canceled[0] && canceled[3] && canceled[6]).toBe(true);
  });

  it('scores a 2×2 grid with a cancelled column', () => {
    // 2×2: cols are [0,2] [1,3]
    const cells: (CardCode | null)[] = ['8', '8', '8', '5'];
    expect(gridScore(cells, cfg({ grid: '4' }))).toBe(8 + 5);
  });

  it('treats an empty grid as zero with nothing cancelled', () => {
    const { total, canceled } = computeGrid([null, null, null, null, null, null], cfg());
    expect(total).toBe(0);
    expect(canceled.some(Boolean)).toBe(false);
  });
});

describe('golf caddie verdict', () => {
  it('reads par, birdie and the rough on a plain ruleset', () => {
    const base = cfg();
    expect(holeVerdict(0, base).kind).toBe('clean');
    expect(holeVerdict(-1, base).kind).toBe('birdie');
    expect(holeVerdict(5, base).kind).toBe('ok');
    expect(holeVerdict(5, base).label).toBe('');
    expect(holeVerdict(50, base).kind).toBe('rough');
  });

  it('promotes a deep-red hole to an eagle only when negatives are in play', () => {
    const spicy = cfg({ jokers: true }); // floor −12
    expect(holeVerdict(-2, spicy).kind).toBe('birdie');
    expect(holeVerdict(-8, spicy).kind).toBe('eagle');
    // With no negative cards a hole can never dip far enough for an eagle.
    expect(holeVerdict(-4, cfg()).kind).toBe('birdie');
  });
});

describe('golf round entry', () => {
  it('creates a zeroed hole for every player', () => {
    expect(createGolfInput([player('a'), player('b')])).toEqual({ scores: { a: 0, b: 0 } });
  });

  it('accepts whole-number hole scores within range', () => {
    const ctx = mkCtx([player('a'), player('b')]);
    expect(validateGolf({ scores: { a: 5, b: 0 } }, ctx)).toBeNull();
  });

  it('rejects non-integer scores', () => {
    const ctx = mkCtx([player('a', 'Ana')]);
    expect(validateGolf({ scores: { a: 2.5 } }, ctx)).toMatch(/whole-number/);
  });

  it('rejects scores below the ruleset floor', () => {
    const ctx = mkCtx([player('a', 'Ana')]);
    expect(validateGolf({ scores: { a: -1 } }, ctx)).toMatch(/below the lowest/);
  });

  it('rejects absurdly high scores', () => {
    const ctx = mkCtx([player('a', 'Ana')]);
    expect(validateGolf({ scores: { a: 500 } }, ctx)).toMatch(/too high/);
  });

  it('allows negative holes once jokers or a −2 king are in play', () => {
    expect(validateGolf({ scores: { a: -4 } }, mkCtx([player('a')], { jokers: true }))).toBeNull();
    expect(validateGolf({ scores: { a: -3 } }, mkCtx([player('a')], { kingValue: '-2' }))).toBeNull();
  });

  it('scores the called-out totals, truncating and filling gaps with 0', () => {
    const ctx = mkCtx([player('a'), player('b'), player('c')]);
    expect(scoreGolf({ scores: { a: 7, b: 3.9 } as Record<ID, number>, }, ctx)).toEqual({ a: 7, b: 3, c: 0 });
  });
});

describe('golf module contract', () => {
  it('is a lower-is-better cards module keyed by its folder', () => {
    expect(golf.id).toBe('golf');
    expect(golf.name).toBe('Golf');
    expect(golf.emoji).toBe('⛳');
    expect(golf.lowerIsBetter).toBe(true);
    expect(golf.minPlayers).toBeLessThanOrEqual(golf.maxPlayers);
  });

  it('ends after the configured number of holes', () => {
    expect(golf.maxRounds?.({}, 4)).toBe(9);
    expect(golf.maxRounds?.({ holes: 18 }, 4)).toBe(18);
    expect(golf.maxRounds?.({ holes: 99 }, 4)).toBe(18);
  });

  it('builds a fresh input through the module entrypoint', () => {
    expect(golf.createRoundInput(mkCtx([player('a'), player('b')]))).toEqual({ scores: { a: 0, b: 0 } });
  });

  it('awards the win to the lowest total', () => {
    expect(defaultWinners(golf, { a: 20, b: 8, c: 15 })).toEqual(['b']);
  });

  it('summarises a hole for the history table', () => {
    const round: Round = {
      id: 'r0',
      gameId: 'g',
      index: 0,
      input: { scores: { a: 3, b: -1 } } satisfies GolfInput,
      deltas: { a: 3, b: -1 },
      createdAt: 0,
    };
    const text = golf.describeRound!(round, [player('a', 'Ana'), player('b', 'Bo')]);
    expect(text).toBe('Hole 1 · Ana 3 · Bo -1');
  });
});

const identity = (id: ID): ID => id;

function mkGame(id: string): Game {
  return { id, type: 'golf', config: {}, playerIds: [], status: 'finished', createdAt: 0, roundCount: 0 };
}
function mkRound(gameId: string, index: number, scores: Record<ID, number>): Round {
  return { id: `${gameId}-r${index}`, gameId, index, input: { scores }, deltas: scores, createdAt: 0 };
}
const metric = (list: Metric[] | undefined, key: string): Metric | undefined =>
  list?.find((m) => m.key === key);

describe('golf stats', () => {
  const input: GameStatsInput = {
    games: [mkGame('g1')],
    rounds: [
      mkRound('g1', 0, { A: 5, B: 0 }),
      mkRound('g1', 1, { A: -2, B: 3 }),
      mkRound('g1', 2, { A: 4, B: 1 }),
      mkRound('other', 0, { A: -99, B: -99 }),
    ],
    players: [player('A'), player('B')],
    canonical: identity,
  };
  const res = golfStats(input);

  it('reports best hole, average per hole and birdies per player', () => {
    const a = res.perPlayer!['A'];
    expect(metric(a, 'golf_best')?.value).toBe('-2');
    expect(metric(a, 'golf_avg')?.value).toBe('2.3');
    expect(metric(a, 'golf_birdie')?.value).toBe('1');

    const b = res.perPlayer!['B'];
    expect(metric(b, 'golf_best')?.value).toBe('0');
    expect(metric(b, 'golf_birdie')).toBeUndefined();
  });

  it('ignores rounds from other games', () => {
    // The −99 round belongs to a game not in `games`, so it never lands.
    expect(metric(res.perPlayer!['A'], 'golf_best')?.value).toBe('-2');
  });

  it('surfaces the lowest hole as a global record', () => {
    expect(metric(res.global, 'golf_record')?.value).toBe('-2');
  });

  it('folds merged member ids through the canonicalizer', () => {
    const merged = golfStats({
      ...input,
      rounds: [mkRound('g1', 0, { A: 5 }), mkRound('g1', 1, { A2: -6 })],
      canonical: (id) => (id === 'A2' ? 'A' : id),
    });
    expect(metric(merged.perPlayer!['A'], 'golf_best')?.value).toBe('-6');
    expect(merged.perPlayer!['A2']).toBeUndefined();
  });

  it('counts eagles for deep-red holes under a ruleset with negatives', () => {
    const jokerGame: Game = { id: 'gj', type: 'golf', config: { jokers: true }, playerIds: [], status: 'finished', createdAt: 0, roundCount: 0 };
    const res2 = golfStats({
      games: [jokerGame],
      rounds: [
        mkRound('gj', 0, { A: -7 }), // ≤ −6 → eagle
        mkRound('gj', 1, { A: -2 }), // under par but not deep → birdie only
      ],
      players: [player('A')],
      canonical: identity,
    });
    const a = res2.perPlayer!['A'];
    expect(metric(a, 'golf_birdie')?.value).toBe('2');
    expect(metric(a, 'golf_eagle')?.value).toBe('1');
  });

  it('awards no eagles when the plain ruleset has no negative cards', () => {
    // The base game (config {}) has a floor of 0, so an eagle is impossible.
    expect(metric(res.perPlayer!['A'], 'golf_eagle')).toBeUndefined();
  });
});
