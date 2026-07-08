import { describe, expect, it } from 'vitest';
import type { Game, Player, Round, RoundContext } from '../../types';
import type { GameStatsInput } from '../../stats/types';
import { mariokart } from './index';
import { mariokartStats } from './stats';
import {
  POINTS_TABLES,
  freshPositions,
  normalizeRaces,
  normalizeRacers,
  normalizeTable,
  pointsForPosition,
  scoreRace,
  validateRace,
  type MarioKartInput,
  type PointsTableId,
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
const P = [player('a', 'Alice'), player('b', 'Bob'), player('c', 'Carol'), player('d', 'Dan')];

describe('mario kart points tables', () => {
  it('modern12 is the Mario Kart 8 / Wii 12-racer curve', () => {
    expect(POINTS_TABLES.modern12).toEqual([15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('classic8 is the Mario Kart Wii 8-racer curve', () => {
    expect(POINTS_TABLES.classic8).toEqual([15, 12, 10, 9, 8, 7, 6, 5]);
  });

  it('retro4 is the MK64 / Super Mario Kart top-4 curve', () => {
    expect(POINTS_TABLES.retro4).toEqual([9, 6, 3, 1]);
  });

  it('maps every modern12 position to its exact points', () => {
    const expected = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    expected.forEach((v, i) => expect(pointsForPosition('modern12', i + 1, 12)).toBe(v));
  });

  it('maps every classic8 position to its exact points', () => {
    const expected = [15, 12, 10, 9, 8, 7, 6, 5];
    expected.forEach((v, i) => expect(pointsForPosition('classic8', i + 1, 8)).toBe(v));
  });

  it('maps every retro4 position and scores 0 from 5th back', () => {
    expect([1, 2, 3, 4].map((p) => pointsForPosition('retro4', p, 8))).toEqual([9, 6, 3, 1]);
    for (const p of [5, 6, 7, 8]) expect(pointsForPosition('retro4', p, 8)).toBe(0);
  });

  it('party scales to the field so everyone scores (1st = racers, last = 1)', () => {
    expect(pointsForPosition('party', 1, 12)).toBe(12);
    expect(pointsForPosition('party', 12, 12)).toBe(1);
    expect(pointsForPosition('party', 1, 8)).toBe(8);
    expect(pointsForPosition('party', 8, 8)).toBe(1);
    // Past the field, even party scores nothing.
    expect(pointsForPosition('party', 13, 12)).toBe(0);
  });

  it('scores 0 past the end of a fixed table', () => {
    expect(pointsForPosition('modern12', 13, 24)).toBe(0);
    expect(pointsForPosition('classic8', 9, 12)).toBe(0);
  });

  it('scores 0 for invalid positions (0, negative, NaN)', () => {
    for (const table of ['modern12', 'classic8', 'retro4', 'party'] as PointsTableId[]) {
      expect(pointsForPosition(table, 0, 12)).toBe(0);
      expect(pointsForPosition(table, -3, 12)).toBe(0);
      expect(pointsForPosition(table, Number.NaN, 12)).toBe(0);
    }
  });
});

describe('scoreRace', () => {
  it('maps a full race under modern12', () => {
    const input: MarioKartInput = { positions: { a: 1, b: 3, c: 12, d: 6 } };
    expect(scoreRace(input, { pointsTable: 'modern12', racers: 12 })).toEqual({
      a: 15,
      b: 10,
      c: 1,
      d: 7,
    });
  });

  it('honours the chosen table', () => {
    const input: MarioKartInput = { positions: { a: 1, b: 2, c: 3, d: 4 } };
    expect(scoreRace(input, { pointsTable: 'retro4', racers: 8 })).toEqual({
      a: 9,
      b: 6,
      c: 3,
      d: 1,
    });
  });

  it('defaults to modern12 when the table is missing/unknown', () => {
    const input: MarioKartInput = { positions: { a: 1 } };
    expect(scoreRace(input, {})).toEqual({ a: 15 });
    expect(scoreRace(input, { pointsTable: 'nonsense' })).toEqual({ a: 15 });
  });

  it('accumulates across a 4-race cup (highest total wins)', () => {
    const cfg = { pointsTable: 'modern12', racers: 12 };
    const races: MarioKartInput[] = [
      { positions: { a: 1, b: 2 } },
      { positions: { a: 2, b: 1 } },
      { positions: { a: 1, b: 3 } },
      { positions: { a: 3, b: 1 } },
    ];
    const totals: Record<string, number> = { a: 0, b: 0 };
    for (const r of races) {
      const d = scoreRace(r, cfg);
      for (const id of Object.keys(d)) totals[id] += d[id];
    }
    // a: 15+12+15+10 = 52 ; b: 12+15+10+15 = 52 — a genuine tie.
    expect(totals).toEqual({ a: 52, b: 52 });
  });
});

describe('validateRace', () => {
  const cfg = { pointsTable: 'modern12', racers: 12 };

  it('passes when every racer has a distinct spot', () => {
    expect(validateRace({ positions: { a: 1, b: 2, c: 3, d: 4 } }, P, cfg)).toBeNull();
  });

  it('flags a racer with no finishing spot', () => {
    const err = validateRace({ positions: { a: 1, b: 0, c: 3, d: 4 } }, P, cfg);
    expect(err).toMatch(/Bob/);
  });

  it('flags two racers sharing a spot', () => {
    const err = validateRace({ positions: { a: 1, b: 1, c: 3, d: 4 } }, P, cfg);
    expect(err).toMatch(/both finish 1st/);
  });

  it('flags a spot beyond the field', () => {
    const err = validateRace({ positions: { a: 5, b: 2, c: 3, d: 4 } }, P, { racers: 4 });
    expect(err).toMatch(/5th/);
  });

  it('flags more players than karts', () => {
    const err = validateRace({ positions: { a: 1, b: 2, c: 3, d: 4 } }, P, { racers: 3 });
    expect(err).toMatch(/Only 3 karts/);
  });
});

describe('freshPositions', () => {
  it('seeds every player into a distinct, valid spot', () => {
    const input = freshPositions(P, { racers: 12 });
    expect(input.positions).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    expect(validateRace(input, P, { racers: 12 })).toBeNull();
  });
});

describe('config normalizers', () => {
  it('normalizeTable falls back to modern12', () => {
    expect(normalizeTable('classic8')).toBe('classic8');
    expect(normalizeTable('party')).toBe('party');
    expect(normalizeTable(undefined)).toBe('modern12');
    expect(normalizeTable('???')).toBe('modern12');
  });

  it('normalizeRacers clamps to 2–24 and defaults to 12', () => {
    expect(normalizeRacers(8)).toBe(8);
    expect(normalizeRacers(1)).toBe(2);
    expect(normalizeRacers(99)).toBe(24);
    expect(normalizeRacers(undefined)).toBe(12);
  });

  it('normalizeRaces keeps >= 0 and defaults invalid to 4', () => {
    expect(normalizeRaces(4)).toBe(4);
    expect(normalizeRaces(0)).toBe(0);
    expect(normalizeRaces(-2)).toBe(4);
    expect(normalizeRaces(undefined)).toBe(4);
  });
});

describe('mariokart game module', () => {
  it('exposes the folder id and sane bounds', () => {
    expect(mariokart.id).toBe('mariokart');
    expect(mariokart.minPlayers).toBeLessThanOrEqual(mariokart.maxPlayers);
    expect(mariokart.emoji).toBeTruthy();
    expect(mariokart.tagline).toBeTruthy();
    expect(mariokart.lowerIsBetter).toBeFalsy(); // highest total wins
  });

  it('maxRounds is the cup length, or open-ended at 0', () => {
    expect(mariokart.maxRounds?.({ racesPerCup: 4 }, 4)).toBe(4);
    expect(mariokart.maxRounds?.({ racesPerCup: 8 }, 4)).toBe(8);
    expect(mariokart.maxRounds?.({ racesPerCup: 0 }, 4)).toBeNull();
    expect(mariokart.maxRounds?.({}, 4)).toBe(4); // default cup
  });

  it('createRoundInput seeds distinct spots that validate', () => {
    const ctx = ctxOf(P, { pointsTable: 'modern12', racers: 12 });
    const input = mariokart.createRoundInput(ctx) as MarioKartInput;
    expect(mariokart.validateRound(input, ctx)).toBeNull();
  });

  it('scoreRound routes through the configured table', () => {
    const ctx = ctxOf(P, { pointsTable: 'classic8', racers: 8 });
    const input: MarioKartInput = { positions: { a: 1, b: 2, c: 3, d: 8 } };
    expect(mariokart.scoreRound(input, ctx)).toEqual({ a: 15, b: 12, c: 10, d: 5 });
  });

  it('validateRound surfaces entry problems', () => {
    const ctx = ctxOf(P, { pointsTable: 'modern12', racers: 12 });
    expect(mariokart.validateRound({ positions: { a: 1, b: 1, c: 3, d: 4 } }, ctx)).toMatch(/1st/);
  });

  it('describeRound lists the podium in finishing order', () => {
    const input: MarioKartInput = { positions: { a: 2, b: 1, c: 3, d: 4 } };
    const round = { input } as unknown as Round;
    const desc = mariokart.describeRound?.(round, P) ?? '';
    expect(desc).toMatch(/🥇Bob/);
    expect(desc.indexOf('Bob')).toBeLessThan(desc.indexOf('Alice'));
    expect(desc).toContain('+1'); // Dan (4th) rolled into the tail
  });

  it('help mentions the cup and the authentic tables', () => {
    expect(mariokart.help).toMatch(/cup/i);
    expect(mariokart.help).toContain('15·12·10·9·8·7·6·5·4·3·2·1');
  });
});

describe('mariokart stats', () => {
  function statsInput(rounds: MarioKartInput[]): GameStatsInput {
    const games = [{ id: 'g1' } as unknown as Game];
    const roundRecords = rounds.map(
      (input, i) => ({ id: `r${i}`, gameId: 'g1', index: i, input } as unknown as Round),
    );
    return { games, rounds: roundRecords, players: P, canonical: (id) => id };
  }

  it('derives wins, podium rate and average finish per player', () => {
    // Alice: 1st, 1st, 2nd → 2 wins, 3 podiums, avg (1+1+2)/3 = 1.3
    // Bob:   2nd, 3rd, 1st → 1 win, 3 podiums, avg 2.0
    const res = mariokartStats(
      statsInput([
        { positions: { a: 1, b: 2 } },
        { positions: { a: 1, b: 3 } },
        { positions: { a: 2, b: 1 } },
      ]),
    );
    const alice = res.perPlayer?.a ?? [];
    const wins = alice.find((m) => m.key === 'mk_wins');
    const avg = alice.find((m) => m.key === 'mk_avg');
    expect(wins?.value).toBe('2');
    expect(avg?.value).toBe('1.3');
    const bob = res.perPlayer?.b ?? [];
    expect(bob.find((m) => m.key === 'mk_avg')?.value).toBe('2');
    expect(res.global?.find((m) => m.key === 'mk_races')?.value).toBe('3');
  });

  it('ignores rounds from other games', () => {
    const input = statsInput([{ positions: { a: 1, b: 2 } }]);
    input.rounds = input.rounds.map((r) => ({ ...r, gameId: 'other' }) as Round);
    const res = mariokartStats(input);
    expect(res.perPlayer?.a).toBeUndefined();
    expect(res.global?.length ?? 0).toBe(0);
  });
});
