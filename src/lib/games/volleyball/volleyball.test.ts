import { describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  defaultTeams,
  foldStandings,
  makeTeam,
  readConfig,
  setWinner,
  type Team,
  unassigned,
  validateSetScore,
  type VolleyballInput,
  type VolleyConfig,
  winningTeamId,
} from './logic';

const cfg: VolleyConfig = { ...DEFAULTS };

function set(home: string, away: string, h: number, a: number, teams: Team[]): VolleyballInput {
  return { teams, home, away, points: { home: h, away: a } };
}

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
    expect(setWinner(26, 25, 25, true)).toBeNull();
    expect(setWinner(30, 28, 25, true)).toBe('a');
  });

  it('honours a one-point win when win-by-two is off', () => {
    expect(setWinner(25, 24, 25, false)).toBe('a');
    expect(setWinner(24, 23, 25, false)).toBeNull();
  });

  it('scores a beach target of 21', () => {
    expect(setWinner(21, 19, 21, true)).toBe('a');
    expect(setWinner(21, 20, 21, true)).toBeNull();
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
  });
});

describe('validateSetScore — only legal final scores pass', () => {
  it('accepts clean and deuce finals', () => {
    expect(validateSetScore(25, 23, 25, true)).toBeNull();
    expect(validateSetScore(26, 24, 25, true)).toBeNull();
    expect(validateSetScore(30, 28, 25, true)).toBeNull();
  });

  it('rejects a set that is not over yet', () => {
    expect(validateSetScore(25, 24, 25, true)).toMatch(/isn.t over/i);
    expect(validateSetScore(25, 25, 25, true)).toMatch(/isn.t over/i);
  });

  it('rejects an unreachable (overshot) score', () => {
    expect(validateSetScore(26, 20, 25, true)).toMatch(/isn.t reachable/i);
  });

  it('rejects negative and non-integer scores', () => {
    expect(validateSetScore(-1, 25, 25, true)).toMatch(/negative/i);
    expect(validateSetScore(25.5, 20, 25, true)).toMatch(/whole/i);
  });
});

describe('readConfig — formats, sizes & safe coercion', () => {
  it('maps each style to a suggested roster size', () => {
    expect(readConfig({ format: 'beach' }).teamSize).toBe(2);
    expect(readConfig({ format: 'fours' }).teamSize).toBe(4);
    expect(readConfig({ format: 'indoor' }).teamSize).toBe(6);
  });

  it('lets Custom take a free-form team size', () => {
    expect(readConfig({ format: 'custom', teamSize: 3 }).teamSize).toBe(3);
    expect(readConfig({ format: 'custom' }).teamSize).toBe(0); // 0 = no limit
  });

  it('fills sensible defaults', () => {
    expect(readConfig(undefined)).toEqual(DEFAULTS);
    expect(readConfig({}).pointsPerSet).toBe(25);
    expect(readConfig({}).numberOfTeams).toBe(2);
  });

  it('clamps the team count to a sane range and floors the cap', () => {
    expect(readConfig({ numberOfTeams: 1 }).numberOfTeams).toBe(2);
    expect(readConfig({ numberOfTeams: 99 }).numberOfTeams).toBe(8);
    expect(readConfig({ hardCap: 27.9 }).hardCap).toBe(27);
    expect(readConfig({ hardCap: -3 }).hardCap).toBe(0);
  });

  it('respects win-by-two toggle and custom targets', () => {
    expect(readConfig({ winBy2: false }).winBy2).toBe(false);
    expect(readConfig({ pointsPerSet: 15 }).pointsPerSet).toBe(15);
    expect(readConfig({ pointsPerSet: -5 }).pointsPerSet).toBe(25);
  });
});

describe('defaultTeams — seeding a pool', () => {
  it('splits the pool round-robin across the requested number of teams', () => {
    const teams = defaultTeams({ ...cfg, numberOfTeams: 2, teamSize: 6 }, ['p1', 'p2', 'p3', 'p4']);
    expect(teams).toHaveLength(2);
    expect(teams[0].memberIds).toEqual(['p1', 'p3']);
    expect(teams[1].memberIds).toEqual(['p2', 'p4']);
  });

  it('honours the roster cap and leaves overflow unassigned', () => {
    const teams = defaultTeams({ ...cfg, numberOfTeams: 2, teamSize: 1 }, ['p1', 'p2', 'p3', 'p4']);
    expect(teams[0].memberIds).toEqual(['p1']);
    expect(teams[1].memberIds).toEqual(['p2']);
    expect(unassigned(teams, ['p1', 'p2', 'p3', 'p4'])).toEqual(['p3', 'p4']);
  });

  it('gives each team distinct branding', () => {
    const teams = defaultTeams({ ...cfg, numberOfTeams: 3 }, []);
    const ids = new Set(teams.map((t) => t.id));
    expect(ids.size).toBe(3);
    expect(teams[0].name).not.toBe(teams[1].name);
    expect(teams[0].emoji).not.toBe(teams[1].emoji);
  });
});

describe('winningTeamId — maps a set score to the winning team', () => {
  const teams = [makeTeam(0, ['p1', 'p2']), makeTeam(1, ['p3', 'p4'])];
  const [t0, t1] = teams;

  it('returns the home team when home wins', () => {
    expect(winningTeamId(set(t0.id, t1.id, 25, 20, teams), cfg)).toBe(t0.id);
  });
  it('returns the away team when away wins', () => {
    expect(winningTeamId(set(t0.id, t1.id, 20, 25, teams), cfg)).toBe(t1.id);
  });
  it('returns null while the set is still live', () => {
    expect(winningTeamId(set(t0.id, t1.id, 25, 24, teams), cfg)).toBeNull();
  });
});

describe('foldStandings — sets won per team across a session', () => {
  const teams = [makeTeam(0, ['p1']), makeTeam(1, ['p2']), makeTeam(2, ['p3'])];
  const [t0, t1, t2] = teams;

  it('counts sets won and sorts leaders first', () => {
    const sets = [
      set(t0.id, t1.id, 25, 20, teams),
      set(t0.id, t2.id, 25, 22, teams),
      set(t1.id, t2.id, 25, 18, teams),
    ];
    const table = foldStandings(teams, sets, cfg);
    expect(table[0].team.id).toBe(t0.id);
    expect(table[0].setsWon).toBe(2);
    const t1row = table.find((r) => r.team.id === t1.id)!;
    expect(t1row.setsWon).toBe(1);
    expect(t1row.setsPlayed).toBe(2);
  });

  it('ignores unfinished sets', () => {
    const table = foldStandings(teams, [set(t0.id, t1.id, 25, 24, teams)], cfg);
    expect(table.every((r) => r.setsWon === 0)).toBe(true);
  });

  it('tracks points scored for each team', () => {
    const table = foldStandings(teams, [set(t0.id, t1.id, 25, 20, teams)], cfg);
    expect(table.find((r) => r.team.id === t0.id)!.pointsFor).toBe(25);
    expect(table.find((r) => r.team.id === t1.id)!.pointsFor).toBe(20);
  });

  it('breaks a sets-won tie by points scored', () => {
    const two = [makeTeam(0, ['p1']), makeTeam(1, ['p2'])];
    const [a, b] = two;
    // a wins 25-10; b wins 25-23 — both 1 set, but a scored more points overall.
    const table = foldStandings(two, [set(a.id, b.id, 25, 10, two), set(a.id, b.id, 23, 25, two)], cfg);
    expect(table[0].team.id).toBe(a.id);
  });
});
