import { describe, expect, it } from 'vitest';
import { defaultWinners, type GameModule, type ID } from '../../types';
import {
  ROUND_THEMES,
  TEAM_EMOJI,
  bowlTotal,
  createInput,
  describe as describeRound,
  makeTeams,
  pointsPerWord,
  roundCount,
  score,
  teamCount,
  themeFor,
  turnSeconds,
  validate,
  wordsFor,
  type SaladBowlInput,
} from './logic';

/** Sum an array of per-player delta maps into cumulative totals. */
function accumulate(deltaMaps: Record<ID, number>[]): Record<ID, number> {
  const totals: Record<ID, number> = {};
  for (const m of deltaMaps) {
    for (const [id, d] of Object.entries(m)) totals[id] = (totals[id] ?? 0) + d;
  }
  return totals;
}

describe('makeTeams', () => {
  it('splits an even roster into equal contiguous teams', () => {
    const teams = makeTeams(['a', 'b', 'c', 'd'], 2);
    expect(teams.map((t) => t.playerIds)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('gives the remainder to the earlier teams', () => {
    const teams = makeTeams(['a', 'b', 'c', 'd', 'e'], 2);
    expect(teams.map((t) => t.playerIds)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
  });

  it('handles 3 teams from 7 players → 3 / 2 / 2', () => {
    const teams = makeTeams(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3);
    expect(teams.map((t) => t.playerIds.length)).toEqual([3, 2, 2]);
    // Every player lands in exactly one team, order preserved.
    expect(teams.flatMap((t) => t.playerIds)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('never creates an empty team: caps team count at the player count', () => {
    const teams = makeTeams(['a', 'b', 'c'], 4);
    expect(teams).toHaveLength(3);
    expect(teams.every((t) => t.playerIds.length === 1)).toBe(true);
  });

  it('supports a single team', () => {
    const teams = makeTeams(['a', 'b', 'c'], 1);
    expect(teams).toHaveLength(1);
    expect(teams[0].playerIds).toEqual(['a', 'b', 'c']);
  });

  it('returns no teams for an empty roster', () => {
    expect(makeTeams([], 2)).toEqual([]);
  });

  it('labels teams with a name and a distinct veggie badge', () => {
    const teams = makeTeams(['a', 'b', 'c', 'd'], 2);
    expect(teams[0].name).toBe('Team 1');
    expect(teams[1].name).toBe('Team 2');
    expect(teams[0].emoji).toBe(TEAM_EMOJI[0]);
    expect(teams[1].emoji).toBe(TEAM_EMOJI[1]);
  });
});

describe('config accessors', () => {
  it('teamCount defaults to 2 and clamps to 2–4', () => {
    expect(teamCount({})).toBe(2);
    expect(teamCount({ teams: '3' })).toBe(3); // select stores strings
    expect(teamCount({ teams: 4 })).toBe(4);
    expect(teamCount({ teams: 9 })).toBe(4);
    expect(teamCount({ teams: 1 })).toBe(2);
    expect(teamCount({ teams: 'nonsense' })).toBe(2);
  });

  it('roundCount defaults to 3 and clamps to 1–4', () => {
    expect(roundCount({})).toBe(3);
    expect(roundCount({ rounds: 2 })).toBe(2);
    expect(roundCount({ rounds: 4 })).toBe(4);
    expect(roundCount({ rounds: 99 })).toBe(4);
    expect(roundCount({ rounds: 0 })).toBe(1);
  });

  it('pointsPerWord defaults to 1 and stays >= 1', () => {
    expect(pointsPerWord({})).toBe(1);
    expect(pointsPerWord({ pointsPerWord: 5 })).toBe(5);
    expect(pointsPerWord({ pointsPerWord: 0 })).toBe(1);
    expect(pointsPerWord({ pointsPerWord: -3 })).toBe(1);
  });

  it('turnSeconds defaults to 60', () => {
    expect(turnSeconds({})).toBe(60);
    expect(turnSeconds({ turnSeconds: 90 })).toBe(90);
    expect(turnSeconds({ turnSeconds: 'x' })).toBe(60);
  });
});

describe('themeFor', () => {
  it('maps each round index to its escalating constraint', () => {
    expect(themeFor(0).name).toBe('Describe');
    expect(themeFor(1).name).toBe('One Word');
    expect(themeFor(2).name).toBe('Charades');
    expect(themeFor(3).name).toBe('Sculptor');
  });

  it('clamps out-of-range indices', () => {
    expect(themeFor(-1)).toBe(ROUND_THEMES[0]);
    expect(themeFor(10)).toBe(ROUND_THEMES[ROUND_THEMES.length - 1]);
  });
});

describe('createInput', () => {
  it('builds a zeroed slot per team', () => {
    expect(createInput(3)).toEqual({ guessed: [0, 0, 0] });
    expect(createInput(0)).toEqual({ guessed: [] });
  });
});

describe('wordsFor / bowlTotal', () => {
  const teams = makeTeams(['a', 'b', 'c', 'd'], 2);

  it('coerces to a non-negative integer', () => {
    expect(wordsFor({ guessed: [5, 3] }, 0)).toBe(5);
    expect(wordsFor({ guessed: [2.9, 3] }, 0)).toBe(2);
    expect(wordsFor({ guessed: [-4, 3] }, 0)).toBe(0);
    expect(wordsFor({ guessed: [] }, 0)).toBe(0);
  });

  it('sums the bowl across teams', () => {
    expect(bowlTotal({ guessed: [5, 3] }, teams)).toBe(8);
    expect(bowlTotal({ guessed: [0, 0] }, teams)).toBe(0);
  });
});

describe('validate', () => {
  const teams = makeTeams(['a', 'b', 'c', 'd'], 2);

  it('accepts a well-formed round', () => {
    expect(validate({ guessed: [5, 3] }, teams)).toBeNull();
    expect(validate({ guessed: [0, 0] }, teams)).toBeNull();
  });

  it('requires at least two teams', () => {
    const solo = makeTeams(['a'], 1);
    expect(validate({ guessed: [1] }, solo)).toMatch(/at least 2 teams/i);
  });

  it('rejects negative or fractional counts', () => {
    expect(validate({ guessed: [-1, 2] }, teams)).toMatch(/whole words/i);
    expect(validate({ guessed: [1.5, 2] }, teams)).toMatch(/whole words/i);
  });

  it('tolerates missing per-team entries', () => {
    expect(validate({ guessed: [] }, teams)).toBeNull();
  });
});

describe('score', () => {
  it('awards every teammate their team’s words × pointsPerWord', () => {
    const teams = makeTeams(['a', 'b', 'c', 'd'], 2);
    const out = score({ guessed: [5, 3] }, teams, 1);
    expect(out).toEqual({ a: 5, b: 5, c: 3, d: 3 });
  });

  it('applies points-per-word', () => {
    const teams = makeTeams(['a', 'b', 'c', 'd'], 2);
    expect(score({ guessed: [4, 1] }, teams, 2)).toEqual({ a: 8, b: 8, c: 2, d: 2 });
  });

  it('floors fractional and floors negative words to zero', () => {
    const teams = makeTeams(['a', 'b', 'c', 'd'], 2);
    expect(score({ guessed: [2.8, -3] }, teams, 1)).toEqual({ a: 2, b: 2, c: 0, d: 0 });
  });

  it('returns a delta for every selected player', () => {
    const teams = makeTeams(['a', 'b', 'c', 'd', 'e'], 2);
    const out = score({ guessed: [1, 1] }, teams, 1);
    expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('describe', () => {
  it('summarises the round with its theme and per-team tallies', () => {
    expect(describeRound({ index: 0, input: { guessed: [5, 3] } })).toBe('🗣️ Describe — 🥬 5 · 🍅 3');
    expect(describeRound({ index: 2, input: { guessed: [1, 4] } })).toBe('🎭 Charades — 🥬 1 · 🍅 4');
  });

  it('degrades gracefully with no recorded teams', () => {
    expect(describeRound({ index: 1, input: { guessed: [] } })).toBe('☝️ One Word');
    expect(describeRound({ index: 0, input: undefined })).toBe('🗣️ Describe');
  });
});

describe('a full game accumulates per team and the highest team wins', () => {
  it('crowns the whole leading team via the shell default winner logic', () => {
    const players = ['p1', 'p2', 'p3', 'p4'];
    const teams = makeTeams(players, 2); // [p1,p2] vs [p3,p4]

    // Three escalating rounds of words guessed per team.
    const rounds: SaladBowlInput[] = [
      { guessed: [5, 3] }, // Describe
      { guessed: [2, 4] }, // One Word
      { guessed: [6, 1] }, // Charades
    ];
    const totals = accumulate(rounds.map((r) => score(r, teams, 1)));

    // Team 1 = 13 each, Team 2 = 8 each.
    expect(totals).toEqual({ p1: 13, p2: 13, p3: 8, p4: 8 });

    const winners = defaultWinners({} as GameModule, totals).sort();
    expect(winners).toEqual(['p1', 'p2']);
  });

  it('ties across teams crown both teams', () => {
    const teams = makeTeams(['a', 'b', 'c', 'd'], 2);
    const totals = accumulate([score({ guessed: [4, 4] }, teams, 1)]);
    expect(defaultWinners({} as GameModule, totals).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
