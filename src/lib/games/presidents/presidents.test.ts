import { describe, expect, it } from 'vitest';
import type { Game, Player, Round, RoundContext } from '../../types';
import type { GameStatsInput } from '../../stats/types';
import { presidents } from './index';
import { presidentsStats } from './stats';
import {
  SCHEME_META,
  freshPositions,
  isFinished,
  maxRounds,
  normalizeRoundCount,
  normalizeScheme,
  normalizeTargetScore,
  pointsForPosition,
  readConfig,
  roundComplete,
  scoreRound,
  titleFor,
  validateRound,
  type PresidentsInput,
  type SchemeId,
} from './logic';

// ── Test helpers ──────────────────────────────────────────────────────────────
function player(id: string, name = id): Player {
  return { id, name, color: '#7c5cff', createdAt: 0 };
}
function ctxOf(players: Player[], config: Record<string, unknown>): RoundContext {
  return {
    game: { id: 'g', config } as unknown as Game,
    players,
    config,
    roundIndex: 0,
    totals: {},
    rounds: [],
  };
}
const P4 = [player('a', 'Alice'), player('b', 'Bob'), player('c', 'Carol'), player('d', 'Dan')];
const P3 = [player('a', 'Alice'), player('b', 'Bob'), player('c', 'Carol')];

// ── titles ─────────────────────────────────────────────────────────────────
describe('titleFor', () => {
  it('is just President/Scum with 2 players', () => {
    expect(titleFor(1, 2).tier).toBe('president');
    expect(titleFor(2, 2).tier).toBe('scum');
  });

  it('has no VP/Vice Scum at 3 players — the middle seat is a Citizen', () => {
    expect(titleFor(1, 3).tier).toBe('president');
    expect(titleFor(2, 3).tier).toBe('neutral');
    expect(titleFor(3, 3).tier).toBe('scum');
  });

  it('introduces Vice President and Vice Scum at 4 players (no Citizen)', () => {
    expect([1, 2, 3, 4].map((p) => titleFor(p, 4).tier)).toEqual([
      'president',
      'vp',
      'vs',
      'scum',
    ]);
  });

  it('fills the middle with Citizens at 5+ players', () => {
    expect([1, 2, 3, 4, 5].map((p) => titleFor(p, 5).tier)).toEqual([
      'president',
      'vp',
      'neutral',
      'vs',
      'scum',
    ]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((p) => titleFor(p, 8).tier)).toEqual([
      'president',
      'vp',
      'neutral',
      'neutral',
      'neutral',
      'neutral',
      'vs',
      'scum',
    ]);
  });

  it('clamps out-of-range positions into the field', () => {
    expect(titleFor(0, 4).tier).toBe('president');
    expect(titleFor(99, 4).tier).toBe('scum');
  });
});

// ── scoring ──────────────────────────────────────────────────────────────
describe('pointsForPosition', () => {
  it('rankPoints scales with the table: 1st = n-1 down to 0 for last', () => {
    expect([1, 2, 3, 4, 5].map((p) => pointsForPosition('rankPoints', p, 5))).toEqual([
      4, 3, 2, 1, 0,
    ]);
  });

  it('tieredTitles is fixed regardless of table size', () => {
    expect(pointsForPosition('tieredTitles', 1, 5)).toBe(3); // President
    expect(pointsForPosition('tieredTitles', 2, 5)).toBe(1); // VP
    expect(pointsForPosition('tieredTitles', 3, 5)).toBe(0); // Citizen
    expect(pointsForPosition('tieredTitles', 4, 5)).toBe(-1); // Vice Scum
    expect(pointsForPosition('tieredTitles', 5, 5)).toBe(-3); // Scum
    // Same tiers, different table size — the values don't change.
    expect(pointsForPosition('tieredTitles', 1, 8)).toBe(3);
    expect(pointsForPosition('tieredTitles', 8, 8)).toBe(-3);
  });

  it('winsOnly only rewards the President', () => {
    expect(pointsForPosition('winsOnly', 1, 4)).toBe(1);
    expect([2, 3, 4].map((p) => pointsForPosition('winsOnly', p, 4))).toEqual([0, 0, 0]);
  });

  it('scores 0 for invalid or out-of-field positions', () => {
    for (const scheme of ['rankPoints', 'tieredTitles', 'winsOnly'] as SchemeId[]) {
      expect(pointsForPosition(scheme, 0, 4)).toBe(0);
      expect(pointsForPosition(scheme, -1, 4)).toBe(0);
      expect(pointsForPosition(scheme, 5, 4)).toBe(0);
      expect(pointsForPosition(scheme, Number.NaN, 4)).toBe(0);
    }
  });
});

describe('scoreRound', () => {
  it('maps a full round under rankPoints (default)', () => {
    const input: PresidentsInput = { positions: { a: 1, b: 2, c: 3, d: 4 } };
    expect(scoreRound(input, {})).toEqual({ a: 3, b: 2, c: 1, d: 0 });
  });

  it('honors the tieredTitles scheme', () => {
    const input: PresidentsInput = { positions: { a: 1, b: 2, c: 3, d: 4, e: 5 } };
    expect(scoreRound(input, { scheme: 'tieredTitles' })).toEqual({
      a: 3,
      b: 1,
      c: 0,
      d: -1,
      e: -3,
    });
  });

  it('honors the winsOnly scheme', () => {
    const input: PresidentsInput = { positions: { a: 2, b: 1, c: 3, d: 4 } };
    expect(scoreRound(input, { scheme: 'winsOnly' })).toEqual({ a: 0, b: 1, c: 0, d: 0 });
  });

  it('accumulates across rounds (highest total wins)', () => {
    const rounds: PresidentsInput[] = [
      { positions: { a: 1, b: 2 } },
      { positions: { a: 2, b: 1 } },
      { positions: { a: 1, b: 2 } },
    ];
    const totals: Record<string, number> = { a: 0, b: 0 };
    for (const r of rounds) {
      const d = scoreRound(r, {});
      for (const id of Object.keys(d)) totals[id] += d[id];
    }
    // rankPoints for 2 players: 1st=1, 2nd=0. a: 1+0+1=2, b: 0+1+0=1.
    expect(totals).toEqual({ a: 2, b: 1 });
  });
});

// ── validation ─────────────────────────────────────────────────────────────
describe('validateRound', () => {
  it('passes when every player has a distinct finishing spot', () => {
    expect(validateRound({ positions: { a: 1, b: 2, c: 3, d: 4 } }, P4)).toBeNull();
  });

  it('flags a player with no finishing spot', () => {
    const err = validateRound({ positions: { a: 1, b: 0, c: 3, d: 4 } }, P4);
    expect(err).toMatch(/Bob/);
  });

  it('flags two players sharing a spot', () => {
    const err = validateRound({ positions: { a: 1, b: 1, c: 3, d: 4 } }, P4);
    expect(err).toMatch(/can't both finish/);
  });

  it('flags a spot beyond the seated table', () => {
    const err = validateRound({ positions: { a: 1, b: 2, c: 3, d: 5 } }, P4);
    expect(err).toMatch(/only 4 players/);
  });
});

describe('freshPositions / roundComplete', () => {
  it('seeds every player into a distinct, valid spot', () => {
    const input = freshPositions(P4);
    expect(input.positions).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    expect(validateRound(input, P4)).toBeNull();
    expect(roundComplete(input, P4)).toBe(true);
  });

  it('is incomplete when a spot is missing or clashing', () => {
    expect(roundComplete({ positions: { a: 1, b: 0, c: 3, d: 4 } }, P4)).toBe(false);
    expect(roundComplete({ positions: { a: 1, b: 1, c: 3, d: 4 } }, P4)).toBe(false);
  });
});

// ── config ───────────────────────────────────────────────────────────────
describe('config normalizers', () => {
  it('normalizeScheme falls back to rankPoints', () => {
    expect(normalizeScheme('tieredTitles')).toBe('tieredTitles');
    expect(normalizeScheme('winsOnly')).toBe('winsOnly');
    expect(normalizeScheme(undefined)).toBe('rankPoints');
    expect(normalizeScheme('???')).toBe('rankPoints');
  });

  it('normalizeTargetScore keeps >= 0 and defaults invalid to 15', () => {
    expect(normalizeTargetScore(20)).toBe(20);
    expect(normalizeTargetScore(0)).toBe(0);
    expect(normalizeTargetScore(-5)).toBe(15);
    expect(normalizeTargetScore(undefined)).toBe(15);
  });

  it('normalizeRoundCount keeps >= 0, caps at 500, defaults invalid to 0', () => {
    expect(normalizeRoundCount(10)).toBe(10);
    expect(normalizeRoundCount(0)).toBe(0);
    expect(normalizeRoundCount(-5)).toBe(0);
    expect(normalizeRoundCount(9999)).toBe(500);
  });

  it('readConfig applies all defaults together', () => {
    expect(readConfig({})).toEqual({ scheme: 'rankPoints', targetScore: 15, roundCount: 0 });
  });
});

describe('isFinished / maxRounds', () => {
  it('ends when a player reaches the target score', () => {
    expect(isFinished({ a: 15, b: 3 }, {})).toBe(true);
    expect(isFinished({ a: 14, b: 3 }, {})).toBe(false);
    expect(isFinished({ a: 10, b: 3 }, { targetScore: 10 })).toBe(true);
  });

  it('never finishes on target when the target is disabled (0)', () => {
    expect(isFinished({ a: 999 }, { targetScore: 0 })).toBe(false);
  });

  it('maxRounds is the configured round count, or open-ended at 0', () => {
    expect(maxRounds({ roundCount: 8 })).toBe(8);
    expect(maxRounds({ roundCount: 0 })).toBeNull();
    expect(maxRounds({})).toBeNull(); // default is open-ended (target-only)
  });
});

// ── module wiring ──────────────────────────────────────────────────────────
describe('presidents module', () => {
  it('exposes the folder id and sane bounds', () => {
    expect(presidents.id).toBe('presidents');
    expect(presidents.minPlayers).toBe(3);
    expect(presidents.maxPlayers).toBe(8);
    expect(presidents.minPlayers).toBeLessThanOrEqual(presidents.maxPlayers);
    expect(presidents.emoji).toBeTruthy();
    expect(presidents.tagline).toBeTruthy();
    expect(presidents.lowerIsBetter).toBeFalsy(); // highest total wins
  });

  it('offers all three scoring schemes in config', () => {
    const field = presidents.configFields?.find((f) => f.key === 'scheme');
    expect(field?.type).toBe('select');
    const values = (field as { options: { value: string }[] }).options.map((o) => o.value);
    expect(values.sort()).toEqual(['rankPoints', 'tieredTitles', 'winsOnly']);
    expect(Object.keys(SCHEME_META).sort()).toEqual(values.sort());
  });

  it('createRoundInput seeds distinct spots that validate', () => {
    const ctx = ctxOf(P4, {});
    const input = presidents.createRoundInput(ctx) as PresidentsInput;
    expect(presidents.validateRound(input, ctx)).toBeNull();
  });

  it('scoreRound routes through the configured scheme', () => {
    const ctx = ctxOf(P3, { scheme: 'tieredTitles' });
    const input: PresidentsInput = { positions: { a: 2, b: 1, c: 3 } };
    expect(presidents.scoreRound(input, ctx)).toEqual({ a: 0, b: 3, c: -3 });
  });

  it('validateRound surfaces entry problems', () => {
    const ctx = ctxOf(P4, {});
    expect(presidents.validateRound({ positions: { a: 1, b: 1, c: 3, d: 4 } }, ctx)).toMatch(
      /can't both finish/,
    );
  });

  it('isFinished delegates to the shared logic with config', () => {
    expect(presidents.isFinished!({ a: 15 }, { config: {}, roundCount: 1, playerCount: 4 })).toBe(
      true,
    );
  });

  it('maxRounds delegates to the shared logic with config', () => {
    expect(presidents.maxRounds!({ roundCount: 5 }, 4)).toBe(5);
    expect(presidents.maxRounds!({}, 4)).toBeNull();
  });

  it('describeRound names the President and the Scum', () => {
    const input: PresidentsInput = { positions: { a: 2, b: 1, c: 4, d: 3 } };
    const round = { input } as unknown as Round;
    const desc = presidents.describeRound?.(round, P4) ?? '';
    expect(desc).toContain('👑 Bob');
    expect(desc).toContain('💩 Carol');
  });

  it('help mentions card passing as a physical, unscored ritual', () => {
    expect(presidents.help).toMatch(/President/);
    expect(presidents.help).toMatch(/Scum/);
    expect(presidents.help).toMatch(/not scored/i);
  });
});

// ── stats ────────────────────────────────────────────────────────────────
describe('presidents stats', () => {
  function statsInput(rounds: PresidentsInput[]): GameStatsInput {
    const games = [{ id: 'g1' } as unknown as Game];
    const roundRecords = rounds.map(
      (input, i) => ({ id: `r${i}`, gameId: 'g1', index: i, input }) as unknown as Round,
    );
    return { games, rounds: roundRecords, players: P4, canonical: (id) => id };
  }

  it('derives presidencies, scum counts, and average finish per player', () => {
    // Alice: 1st, 1st, 2nd → 2 presidencies, avg (1+1+2)/3 = 1.3
    // Bob: 2nd, 4th, 1st → 1 presidency, 1 scum stretch
    const res = presidentsStats(
      statsInput([
        { positions: { a: 1, b: 2, c: 3, d: 4 } },
        { positions: { a: 1, b: 4, c: 2, d: 3 } },
        { positions: { a: 2, b: 1, c: 4, d: 3 } },
      ]),
    );
    const alice = res.perPlayer?.a ?? [];
    expect(alice.find((m) => m.key === 'p_pres')?.value).toBe('2');
    expect(alice.find((m) => m.key === 'p_avg')?.value).toBe('1.3');
    const bob = res.perPlayer?.b ?? [];
    expect(bob.find((m) => m.key === 'p_pres')?.value).toBe('1');
    expect(bob.find((m) => m.key === 'p_scum')?.value).toBe('1');
    expect(res.global?.find((m) => m.key === 'p_rounds')?.value).toBe('3');
  });

  it('ignores rounds from other games', () => {
    const input = statsInput([{ positions: { a: 1, b: 2, c: 3, d: 4 } }]);
    input.rounds = input.rounds.map((r) => ({ ...r, gameId: 'other' }) as Round);
    const res = presidentsStats(input);
    expect(res.perPlayer?.a).toBeUndefined();
    expect(res.global?.length ?? 0).toBe(0);
  });
});
