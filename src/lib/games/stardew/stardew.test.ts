import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import {
  CANDLE_THRESHOLDS,
  EVAL_CATEGORIES,
  MAX_CANDLES,
  MAX_EVALUATION,
  MAX_YEARS,
  SEASONS_PER_YEAR,
  STARDEW_HELP,
  candleTier,
  candleVerdict,
  clean,
  describeSeason,
  emptySeason,
  evaluationScore,
  groupWon,
  maxSeasons,
  priorCategoryTotals,
  remainingCap,
  scoreForTier,
  seasonLabel,
  seasonPoints,
  targetCandles,
  validateSeason,
  years,
  type CategoryTotals,
  type StardewSeasonInput,
} from './logic';
import { stardew } from './index';
import { MODULES, getModule } from '../registry';

function player(id: string, name = id): Player {
  return { id, name, color: '#7c5cff', createdAt: 0 };
}
const players = [player('a', 'Ada'), player('b', 'Bo'), player('c', 'Cy')];

function ctxWith(
  ps: Player[],
  opts: {
    config?: Record<string, unknown>;
    roundIndex?: number;
    rounds?: Round[];
    totals?: Record<ID, number>;
  } = {},
): RoundContext {
  const config = opts.config ?? {};
  const game: Game = {
    id: 'g',
    type: 'stardew',
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
    roundIndex: opts.roundIndex ?? 0,
    totals: opts.totals ?? Object.fromEntries(ps.map((p) => [p.id, 0])),
    rounds: opts.rounds ?? [],
  };
}

function season(overrides: Partial<StardewSeasonInput> = {}): StardewSeasonInput {
  return { ...emptySeason(), ...overrides };
}

function round(index: number, input: Partial<StardewSeasonInput>): Round {
  return { id: `r${index}`, gameId: 'g', index, input, deltas: {}, createdAt: 0 };
}

const noPrior: CategoryTotals = { bundles: 0, goals: 0, fish: 0, gold: 0 };

describe('Stardew evaluation categories', () => {
  it('has the four evaluation categories with unique keys and a top score of 18', () => {
    expect(EVAL_CATEGORIES).toHaveLength(4);
    const keys = EVAL_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['bundles', 'goals', 'fish', 'gold']);
    expect(EVAL_CATEGORIES.map((c) => c.cap)).toEqual([6, 4, 5, 3]);
    expect(MAX_EVALUATION).toBe(18);
  });

  it('starts a season empty', () => {
    expect(emptySeason()).toEqual({ bundles: 0, goals: 0, fish: 0, gold: 0 });
  });
});

describe('season scoring', () => {
  it('sums a season across its categories', () => {
    expect(seasonPoints(season({ bundles: 2, goals: 1, fish: 1, gold: 1 }))).toBe(5);
  });

  it('is zero for an empty or missing season', () => {
    expect(seasonPoints(emptySeason())).toBe(0);
    expect(seasonPoints(undefined)).toBe(0);
  });

  it('coerces junk to a safe, non-negative whole number', () => {
    expect(clean('3')).toBe(3);
    expect(clean(2.9)).toBe(2);
    expect(clean(-4)).toBe(0);
    expect(clean(NaN)).toBe(0);
    expect(clean(undefined)).toBe(0);
    expect(seasonPoints({ bundles: -3, goals: 2.7, fish: NaN, gold: 1 })).toBe(3);
  });

  it('labels seasons as Spring→Winter, rolling into the next year', () => {
    expect(seasonLabel(0)).toMatchObject({ name: 'Spring', year: 1, ordinal: 1 });
    expect(seasonLabel(3)).toMatchObject({ name: 'Winter', year: 1, ordinal: 4 });
    expect(seasonLabel(4)).toMatchObject({ name: 'Spring', year: 2, ordinal: 1 });
    expect(seasonLabel(9)).toMatchObject({ name: 'Summer', year: 3, ordinal: 2 });
  });

  it('runs four seasons per configured year, clamped to 1–4 years', () => {
    expect(maxSeasons({ years: 1 })).toBe(SEASONS_PER_YEAR);
    expect(maxSeasons({ years: 3 })).toBe(12);
    expect(maxSeasons({})).toBe(4);
    expect(years({ years: 99 })).toBe(MAX_YEARS);
    expect(years({ years: 0 })).toBe(1);
    expect(years(undefined)).toBe(1);
  });

  it('sums prior seasons per category, ignoring the round being edited and later ones', () => {
    const rounds = [
      round(0, { bundles: 2, fish: 1 }),
      round(1, { bundles: 1, goals: 2 }),
      round(2, { gold: 3 }),
    ];
    expect(priorCategoryTotals(rounds, 2)).toEqual({ bundles: 3, goals: 2, fish: 1, gold: 0 });
    expect(priorCategoryTotals(rounds, 0)).toEqual(noPrior);
    expect(priorCategoryTotals(undefined, 4)).toEqual(noPrior);
  });
});

describe('candle tiers', () => {
  it('lights no candle at zero', () => {
    expect(candleTier(0)).toBe(0);
    expect(candleTier(-5)).toBe(0);
  });

  it('maps 1–5 → 1, 6–9 → 2, 10–13 → 3, 14+ → 4', () => {
    for (const s of [1, 2, 3, 4, 5]) expect(candleTier(s)).toBe(1);
    for (const s of [6, 7, 8, 9]) expect(candleTier(s)).toBe(2);
    for (const s of [10, 11, 12, 13]) expect(candleTier(s)).toBe(3);
    for (const s of [14, 17, MAX_EVALUATION, 99]) expect(candleTier(s)).toBe(4);
  });

  it('lights exactly one more candle at each threshold boundary', () => {
    CANDLE_THRESHOLDS.forEach((threshold, i) => {
      expect(candleTier(threshold)).toBe(i + 1);
      expect(candleTier(threshold - 1)).toBe(i);
    });
  });

  it('reports the lowest score that reaches each tier', () => {
    expect(scoreForTier(0)).toBe(0);
    expect(scoreForTier(1)).toBe(1);
    expect(scoreForTier(2)).toBe(6);
    expect(scoreForTier(3)).toBe(10);
    expect(scoreForTier(4)).toBe(14);
    // Clamped rather than throwing on out-of-range input.
    expect(scoreForTier(-2)).toBe(0);
    expect(scoreForTier(9)).toBe(14);
  });

  it('gives a warm verdict for every tier', () => {
    const said = [0, 1, 2, 3, 4].map(candleVerdict);
    expect(new Set(said).size).toBe(5);
    expect(said[0]).toMatch(/needs you/i);
    expect(said[4]).toMatch(/beaming/i);
  });
});

describe('validation', () => {
  it('accepts a legal season', () => {
    expect(validateSeason(season({ bundles: 2, goals: 1 }), noPrior)).toBeNull();
  });

  it('rejects fractional and negative entries', () => {
    expect(validateSeason({ ...emptySeason(), bundles: 1.5 }, noPrior)).toMatch(/whole number/i);
    expect(validateSeason({ ...emptySeason(), goals: -1 }, noPrior)).toMatch(/whole number/i);
  });

  it('rejects a category pushed past its lifetime cap, naming what is left', () => {
    const prior: CategoryTotals = { bundles: 5, goals: 0, fish: 0, gold: 0 };
    const msg = validateSeason(season({ bundles: 2 }), prior);
    expect(msg).toMatch(/tops out at 6/);
    expect(msg).toMatch(/only 1 left/);
    // Exactly reaching the cap is legal.
    expect(validateSeason(season({ bundles: 1 }), prior)).toBeNull();
  });

  it('reports the remaining headroom per category', () => {
    expect(remainingCap('fish', { ...noPrior, fish: 2 })).toBe(3);
    expect(remainingCap('gold', { ...noPrior, gold: 9 })).toBe(0);
  });

  it('validates through the module against the rounds already recorded', () => {
    const rounds = [round(0, { bundles: 4 }), round(1, { bundles: 2 })];
    const ctx = ctxWith(players, { rounds, roundIndex: 2 });
    expect(stardew.validateRound(season({ bundles: 1 }), ctx)).toMatch(/tops out at 6/);
    expect(stardew.validateRound(season({ goals: 1 }), ctx)).toBeNull();
  });
});

describe('cooperative scoring — one farm, one score', () => {
  it('hands the identical season delta to every seat', () => {
    const ctx = ctxWith(players);
    const deltas = stardew.scoreRound(season({ bundles: 2, fish: 1 }), ctx);
    expect(deltas).toEqual({ a: 3, b: 3, c: 3 });
  });

  it('keeps a solo farm working', () => {
    const ctx = ctxWith([player('solo')]);
    expect(stardew.scoreRound(season({ gold: 2 }), ctx)).toEqual({ solo: 2 });
  });

  it('gives every seat zero for a quiet season rather than skipping them', () => {
    const ctx = ctxWith(players);
    expect(stardew.scoreRound(emptySeason(), ctx)).toEqual({ a: 0, b: 0, c: 0 });
  });

  it('reads the shared evaluation score off the (identical) totals', () => {
    expect(evaluationScore({ a: 11, b: 11, c: 11 })).toBe(11);
    expect(evaluationScore({})).toBe(0);
    expect(evaluationScore(undefined)).toBe(0);
  });

  it('declares itself cooperative so the shell narrates a shared outcome', () => {
    expect(stardew.coop).toBe(true);
  });
});

describe('shared win and shared loss', () => {
  const target = (t: number) => ({ targetCandles: t });

  it('crowns every seat when the group reaches its target tier', () => {
    const totals = { a: 14, b: 14, c: 14 };
    expect(groupWon(14, target(4))).toBe(true);
    expect(stardew.pickWinners!(totals, target(4))).toEqual(['a', 'b', 'c']);
  });

  it('crowns nobody when the group falls short — never an arbitrary leader', () => {
    const totals = { a: 13, b: 13, c: 13 };
    expect(groupWon(13, target(4))).toBe(false);
    expect(stardew.pickWinners!(totals, target(4))).toEqual([]);
  });

  it('overshooting the target still wins', () => {
    expect(stardew.pickWinners!({ a: 18, b: 18 }, target(2))).toEqual(['a', 'b']);
  });

  it('honours a lowered target, so 2 candles can be a win', () => {
    const totals = { a: 6, b: 6 };
    expect(stardew.pickWinners!(totals, target(2))).toEqual(['a', 'b']);
    expect(stardew.pickWinners!(totals, target(3))).toEqual([]);
  });

  it('a scoreless farm never wins, even at the gentlest target', () => {
    expect(stardew.pickWinners!({ a: 0, b: 0 }, target(1))).toEqual([]);
  });

  it('clamps a nonsense target into 1–4 rather than making the game unwinnable', () => {
    expect(targetCandles({ targetCandles: 99 })).toBe(MAX_CANDLES);
    expect(targetCandles({ targetCandles: 0 })).toBe(1);
    expect(targetCandles(undefined)).toBe(MAX_CANDLES);
    expect(stardew.pickWinners!({ a: 18 }, { targetCandles: 99 })).toEqual(['a']);
  });

  it('offers "looks complete" only once the target is secured', () => {
    const info = (config: Record<string, unknown>) => ({
      config,
      roundCount: 2,
      playerCount: 3,
    });
    expect(stardew.isFinished!({ a: 9, b: 9, c: 9 }, info(target(3)))).toBe(false);
    expect(stardew.isFinished!({ a: 10, b: 10, c: 10 }, info(target(3)))).toBe(true);
  });
});

describe('module wiring', () => {
  it('is actually discovered by the auto-discovery registry', () => {
    // registry.ts duck-types discovered modules and requires `editorLoader` to be a
    // function; a module that misses it is silently dropped with a green build. So
    // assert real discovery, not just a well-formed export.
    expect(MODULES.map((m) => m.id)).toContain('stardew');
    expect(getModule('stardew')).toBe(stardew);
  });

  it('is a cooperative 1–4 player game with a lazily loaded editor', () => {
    expect(stardew.id).toBe('stardew');
    expect(stardew.minPlayers).toBe(1);
    expect(stardew.maxPlayers).toBe(4);
    expect(typeof stardew.editorLoader).toBe('function');
    expect(stardew.RoundEditor).toBeTruthy();
    expect(stardew.lowerIsBetter).toBeFalsy();
  });

  it('runs 4 seasons per configured year', () => {
    expect(stardew.maxRounds!({ years: 2 }, 3)).toBe(8);
  });

  it('starts every season from a clean sheet', () => {
    expect(stardew.createRoundInput(ctxWith(players))).toEqual(emptySeason());
  });

  it('offers year and candle-target config within legal bounds', () => {
    const byKey = Object.fromEntries((stardew.configFields ?? []).map((f) => [f.key, f]));
    expect(byKey.years).toMatchObject({ type: 'number', default: 1, min: 1, max: MAX_YEARS });
    expect(byKey.targetCandles).toMatchObject({ type: 'number', default: 4, min: 1, max: 4 });
  });

  it('describes a season with its label, categories and shared points', () => {
    const text = describeSeason(round(4, { bundles: 1, fish: 2 }));
    expect(text).toContain('Spring');
    expect(text).toContain('Y2');
    expect(text).toContain('🎁1');
    expect(text).toContain('🐟2');
    expect(text).toContain('+3');
  });

  it('describes an empty season without pretending points were scored', () => {
    const text = describeSeason(round(1, {}));
    expect(text).toContain('quiet season');
    expect(text).toContain('+0');
  });

  it('explains the co-op shape and the candle ladder in its help', () => {
    expect(stardew.help).toBe(STARDEW_HELP);
    expect(STARDEW_HELP).toMatch(/co-op/i);
    expect(STARDEW_HELP).toMatch(/whole table wins together/i);
    expect(STARDEW_HELP).toContain('14+');
  });
});

describe('stats', () => {
  const game = (id: string): Game => ({
    id,
    type: 'stardew',
    config: {},
    playerIds: ['a', 'b'],
    status: 'finished',
    createdAt: 0,
    roundCount: 0,
  });
  const statRound = (gameId: string, index: number, input: Partial<StardewSeasonInput>): Round => ({
    ...round(index, input),
    id: `${gameId}-${index}`,
    gameId,
  });

  function run(games: Game[], rounds: Round[]) {
    return stardew.stats!({
      games,
      rounds,
      players: players.slice(0, 2),
      canonical: (id: ID) => id,
    });
  }

  it('rolls each farm up into one shared evaluation, never a per-player split', () => {
    const result = run(
      [game('g1'), game('g2')],
      [
        statRound('g1', 0, { bundles: 6, goals: 4 }),
        statRound('g1', 1, { fish: 5, gold: 3 }),
        statRound('g2', 0, { bundles: 2 }),
      ],
    );
    expect(result.perPlayer).toBeUndefined();
    const byKey = Object.fromEntries((result.global ?? []).map((m) => [m.key, m]));
    expect(byKey.sv_best.value).toBe('18');
    expect(byKey.sv_best.sub).toContain('🕯️🕯️🕯️🕯️');
    expect(byKey.sv_perfect.value).toBe('1');
    expect(byKey.sv_seasons.value).toBe('3');
    expect(byKey.sv_bundles.value).toBe('8');
    expect(byKey.sv_goals.value).toBe('4');
    expect(byKey.sv_fish.value).toBe('5');
  });

  it('ignores rounds belonging to other games', () => {
    const result = run([game('g1')], [statRound('other', 0, { bundles: 6 })]);
    expect(result.global ?? []).toEqual([]);
  });

  it('produces nothing from no games', () => {
    expect(run([], []).global ?? []).toEqual([]);
  });
});
