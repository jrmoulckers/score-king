import { describe, expect, it } from 'vitest';
import type { ID, Round } from '../../types';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  clampPlayers,
  clinch,
  decidedBefore,
  describeAvalon,
  expectedWinnerCount,
  isResolved,
  outcomeOf,
  pickAvalonWinners,
  roleList,
  roleSetup,
  scoreAvalon,
  tallyBefore,
  validateAvalon,
  winningSide,
  type AvalonInput,
  type RolesConfig,
} from './logic';

function inp(partial: Partial<AvalonInput> = {}): AvalonInput {
  return { fails: 0, teamSize: 3, assassinFoundMerlin: null, winners: [], ...partial };
}

function mkRound(index: number, input: AvalonInput): Round {
  return { id: `r${index}`, gameId: 'g', index, input, deltas: {}, createdAt: 0 };
}

const seats = (n: number): ID[] => Array.from({ length: n }, (_, i) => `p${i + 1}`);

const noRoles: RolesConfig = { percival: false, morgana: false, mordred: false, oberon: false };

describe('clampPlayers', () => {
  it('clamps to the 5–10 range', () => {
    expect(clampPlayers(3)).toBe(MIN_PLAYERS);
    expect(clampPlayers(11)).toBe(MAX_PLAYERS);
    expect(clampPlayers(7)).toBe(7);
  });
  it('rounds and tolerates junk', () => {
    expect(clampPlayers(7.4)).toBe(7);
    expect(clampPlayers(NaN)).toBe(MIN_PLAYERS);
  });
});

describe('roleSetup', () => {
  it('splits Good/Evil by the standard table', () => {
    expect([roleSetup(5).good, roleSetup(5).evil]).toEqual([3, 2]);
    expect([roleSetup(6).good, roleSetup(6).evil]).toEqual([4, 2]);
    expect([roleSetup(7).good, roleSetup(7).evil]).toEqual([4, 3]);
    expect([roleSetup(8).good, roleSetup(8).evil]).toEqual([5, 3]);
    expect([roleSetup(9).good, roleSetup(9).evil]).toEqual([6, 3]);
    expect([roleSetup(10).good, roleSetup(10).evil]).toEqual([6, 4]);
  });

  it('good + evil always equals the (clamped) player count', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const s = roleSetup(n);
      expect(s.good + s.evil).toBe(n);
      expect(s.players).toBe(n);
    }
  });

  it('provides five quest team sizes', () => {
    expect(roleSetup(5).questTeams).toEqual([2, 3, 2, 3, 3]);
    expect(roleSetup(7).questTeams).toEqual([2, 3, 3, 4, 4]);
    expect(roleSetup(10).questTeams).toEqual([3, 4, 4, 5, 5]);
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      expect(roleSetup(n).questTeams).toHaveLength(5);
    }
  });

  it('marks Quest 4 as the two-fail quest only at 7+ players', () => {
    expect(roleSetup(5).twoFailQuests).toEqual([false, false, false, false, false]);
    expect(roleSetup(6).twoFailQuests[3]).toBe(false);
    expect(roleSetup(7).twoFailQuests).toEqual([false, false, false, true, false]);
    expect(roleSetup(10).twoFailQuests[3]).toBe(true);
  });

  it('clamps out-of-range counts', () => {
    expect(roleSetup(4).players).toBe(5);
    expect(roleSetup(99).players).toBe(10);
  });
});

describe('roleList', () => {
  it('always seats exactly the Good and Evil counts', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const list = roleList(n, noRoles);
      const setup = roleSetup(n);
      expect(list).toHaveLength(n);
      expect(list.filter((r) => r.side === 'good')).toHaveLength(setup.good);
      expect(list.filter((r) => r.side === 'evil')).toHaveLength(setup.evil);
    }
  });

  it('always includes Merlin and the Assassin', () => {
    const list = roleList(5, noRoles);
    expect(list.some((r) => r.name === 'Merlin')).toBe(true);
    expect(list.some((r) => r.name === 'Assassin')).toBe(true);
  });

  it('adds optional roles without changing head counts', () => {
    // 10 players => 4 Evil seats, enough to fit Assassin + Morgana + Mordred + Oberon.
    const cfg: RolesConfig = { percival: true, morgana: true, mordred: true, oberon: true };
    const list = roleList(10, cfg);
    const setup = roleSetup(10);
    expect(list.filter((r) => r.side === 'good')).toHaveLength(setup.good);
    expect(list.filter((r) => r.side === 'evil')).toHaveLength(setup.evil);
    expect(list.some((r) => r.name === 'Percival')).toBe(true);
    expect(list.some((r) => r.name === 'Morgana')).toBe(true);
    expect(list.some((r) => r.name === 'Mordred')).toBe(true);
    expect(list.some((r) => r.name === 'Oberon')).toBe(true);
  });

  it('never exceeds the Evil count even with every Evil toggle on', () => {
    // 5 players => only 2 Evil seats; Assassin + Morgana + Mordred + Oberon must be trimmed.
    const cfg: RolesConfig = { percival: false, morgana: true, mordred: true, oberon: true };
    const list = roleList(5, cfg);
    expect(list.filter((r) => r.side === 'evil')).toHaveLength(2);
    expect(list.filter((r) => r.side === 'good')).toHaveLength(3);
  });
});

describe('outcomeOf', () => {
  it('treats a single Fail as a failed quest normally', () => {
    expect(outcomeOf({ fails: 0 }, false)).toBe('success');
    expect(outcomeOf({ fails: 1 }, false)).toBe('fail');
    expect(outcomeOf({ fails: 3 }, false)).toBe('fail');
  });
  it('requires two Fails on the two-fail quest', () => {
    expect(outcomeOf({ fails: 1 }, true)).toBe('success');
    expect(outcomeOf({ fails: 2 }, true)).toBe('fail');
  });
});

describe('tallyBefore', () => {
  it('counts only quests before the given index', () => {
    const setup = roleSetup(5);
    const rounds = [
      mkRound(0, inp({ fails: 0 })), // success
      mkRound(1, inp({ fails: 1 })), // fail
      mkRound(2, inp({ fails: 0 })), // success (ignored when index=2)
    ];
    expect(tallyBefore(rounds, 2, setup)).toEqual({ successes: 1, fails: 1 });
    expect(tallyBefore(rounds, 3, setup)).toEqual({ successes: 2, fails: 1 });
    expect(tallyBefore(rounds, 0, setup)).toEqual({ successes: 0, fails: 0 });
  });

  it('honors the two-fail quest when tallying', () => {
    const setup = roleSetup(7); // Quest 4 (index 3) is two-fail
    const rounds = [mkRound(3, inp({ fails: 1, teamSize: 4 }))];
    expect(tallyBefore(rounds, 4, setup)).toEqual({ successes: 1, fails: 0 });
    const rounds2 = [mkRound(3, inp({ fails: 2, teamSize: 4 }))];
    expect(tallyBefore(rounds2, 4, setup)).toEqual({ successes: 0, fails: 1 });
  });
});

describe('clinch', () => {
  it('flags Good on the third success', () => {
    expect(clinch({ successes: 2, fails: 0 }, 'success')).toBe('good');
    expect(clinch({ successes: 1, fails: 2 }, 'success')).toBeNull();
  });
  it('flags Evil on the third fail', () => {
    expect(clinch({ successes: 0, fails: 2 }, 'fail')).toBe('evil');
    expect(clinch({ successes: 2, fails: 1 }, 'fail')).toBeNull();
  });
});

describe('winningSide', () => {
  it('keeps the win for Good when the Assassin misses', () => {
    expect(winningSide('good', false)).toBe('good');
    expect(winningSide('good', null)).toBe('good');
  });
  it('lets Evil steal a Good clinch when the Assassin finds Merlin', () => {
    expect(winningSide('good', true)).toBe('evil');
  });
  it('always gives an Evil clinch to Evil', () => {
    expect(winningSide('evil', null)).toBe('evil');
    expect(winningSide('evil', true)).toBe('evil');
  });
});

describe('decidedBefore & expectedWinnerCount', () => {
  it('detects a game already decided', () => {
    expect(decidedBefore({ successes: 3, fails: 0 })).toBe(true);
    expect(decidedBefore({ successes: 0, fails: 3 })).toBe(true);
    expect(decidedBefore({ successes: 2, fails: 2 })).toBe(false);
  });
  it('maps a side to its seat count', () => {
    const setup = roleSetup(7);
    expect(expectedWinnerCount(setup, 'good')).toBe(4);
    expect(expectedWinnerCount(setup, 'evil')).toBe(3);
  });
});

describe('validateAvalon', () => {
  it('rejects out-of-range player counts', () => {
    expect(validateAvalon(inp(), [], 0, seats(4))).toMatch(/5–10 players/);
    expect(validateAvalon(inp(), [], 0, seats(11))).toMatch(/5–10 players/);
  });

  it('blocks adding a quest once a side already reached three', () => {
    const rounds = [
      mkRound(0, inp({ fails: 0 })),
      mkRound(1, inp({ fails: 0 })),
      mkRound(2, inp({ fails: 0 })),
    ];
    expect(validateAvalon(inp(), rounds, 3, seats(5))).toMatch(/already decided/);
  });

  it('validates team size and fail bounds', () => {
    expect(validateAvalon(inp({ teamSize: 1 }), [], 0, seats(5))).toMatch(/team size/);
    expect(validateAvalon(inp({ teamSize: 6 }), [], 0, seats(5))).toMatch(/team size/);
    expect(validateAvalon(inp({ teamSize: 3, fails: 4 }), [], 0, seats(5))).toMatch(/fails/);
  });

  it('is happy with an ordinary non-clinching quest', () => {
    expect(validateAvalon(inp({ teamSize: 2, fails: 0 }), [], 0, seats(5))).toBeNull();
    expect(validateAvalon(inp({ teamSize: 2, fails: 1 }), [], 0, seats(5))).toBeNull();
  });

  it('requires the Assassin guess when Good clinches', () => {
    const rounds = [mkRound(0, inp({ fails: 0 })), mkRound(1, inp({ fails: 0 }))];
    const draft = inp({ teamSize: 2, fails: 0, assassinFoundMerlin: null });
    expect(validateAvalon(draft, rounds, 2, seats(5))).toMatch(/Assassin/);
  });

  it('requires the correct number of winners at the clinch', () => {
    const rounds = [mkRound(0, inp({ fails: 0 })), mkRound(1, inp({ fails: 0 }))];
    // Good clinch, Assassin missed => 3 Good winners needed.
    const draft = inp({ teamSize: 2, fails: 0, assassinFoundMerlin: false, winners: ['p1'] });
    expect(validateAvalon(draft, rounds, 2, seats(5))).toMatch(/3 Good/);
    const ok = inp({
      teamSize: 2,
      fails: 0,
      assassinFoundMerlin: false,
      winners: ['p1', 'p2', 'p3'],
    });
    expect(validateAvalon(ok, rounds, 2, seats(5))).toBeNull();
  });

  it('needs the Evil team recorded when Evil clinches (no Assassin step)', () => {
    const rounds = [mkRound(0, inp({ fails: 1 })), mkRound(1, inp({ fails: 1 }))];
    const draft = inp({ teamSize: 3, fails: 1, winners: ['p1', 'p2'] }); // 2 Evil at 5p
    expect(validateAvalon(draft, rounds, 2, seats(5))).toBeNull();
    const wrong = inp({ teamSize: 3, fails: 1, winners: ['p1'] });
    expect(validateAvalon(wrong, rounds, 2, seats(5))).toMatch(/2 Evil/);
  });

  it('rejects winners who are not seated, and duplicates', () => {
    const rounds = [mkRound(0, inp({ fails: 0 })), mkRound(1, inp({ fails: 0 }))];
    const outsider = inp({
      teamSize: 2,
      fails: 0,
      assassinFoundMerlin: false,
      winners: ['p1', 'p2', 'zzz'],
    });
    expect(validateAvalon(outsider, rounds, 2, seats(5))).toMatch(/not in this game/);
    const dupe = inp({
      teamSize: 2,
      fails: 0,
      assassinFoundMerlin: false,
      winners: ['p1', 'p1', 'p2'],
    });
    expect(validateAvalon(dupe, rounds, 2, seats(5))).toMatch(/twice/);
  });
});

describe('scoreAvalon', () => {
  it('scores every player zero on a non-clinching quest', () => {
    const deltas = scoreAvalon(inp({ fails: 1, teamSize: 3 }), [], 0, seats(5));
    expect(Object.values(deltas)).toEqual([0, 0, 0, 0, 0]);
  });

  it('marks the winning side 1 and everyone else 0 at a Good clinch', () => {
    const rounds = [mkRound(0, inp({ fails: 0 })), mkRound(1, inp({ fails: 0 }))];
    const draft = inp({
      teamSize: 2,
      fails: 0,
      assassinFoundMerlin: false,
      winners: ['p1', 'p2', 'p3'],
    });
    const deltas = scoreAvalon(draft, rounds, 2, seats(5));
    expect(deltas).toEqual({ p1: 1, p2: 1, p3: 1, p4: 0, p5: 0 });
  });

  it('credits the Evil team when the Assassin steals the win', () => {
    const rounds = [mkRound(0, inp({ fails: 0 })), mkRound(1, inp({ fails: 0 }))];
    // Good reached 3 quests, but Assassin found Merlin => the 2 Evil players win.
    const draft = inp({
      teamSize: 2,
      fails: 0,
      assassinFoundMerlin: true,
      winners: ['p4', 'p5'],
    });
    const deltas = scoreAvalon(draft, rounds, 2, seats(5));
    expect(deltas).toEqual({ p1: 0, p2: 0, p3: 0, p4: 1, p5: 1 });
    expect(pickAvalonWinners(deltas)).toEqual(['p4', 'p5']);
  });
});

describe('isResolved & pickAvalonWinners', () => {
  it('is unresolved while every total is zero', () => {
    expect(isResolved({ p1: 0, p2: 0 })).toBe(false);
    expect(pickAvalonWinners({ p1: 0, p2: 0 })).toEqual([]);
  });
  it('resolves once a positive total exists', () => {
    expect(isResolved({ p1: 1, p2: 0 })).toBe(true);
    expect(pickAvalonWinners({ p1: 1, p2: 0, p3: 1 })).toEqual(['p1', 'p3']);
  });
});

describe('describeAvalon', () => {
  it('summarizes a plain success and a plain fail', () => {
    expect(describeAvalon(mkRound(0, inp({ fails: 0 })), 5)).toBe('Quest 1 ✓ succeeded');
    expect(describeAvalon(mkRound(1, inp({ fails: 1 })), 5)).toBe('Quest 2 ✗ failed · 1 fail');
    expect(describeAvalon(mkRound(1, inp({ fails: 2 })), 5)).toBe('Quest 2 ✗ failed · 2 fails');
  });

  it('narrates a Good victory finale', () => {
    const r = mkRound(2, inp({ fails: 0, assassinFoundMerlin: false, winners: ['p1', 'p2', 'p3'] }));
    expect(describeAvalon(r, 5)).toContain('🛡️ Good prevails');
  });

  it('narrates the Assassin stealing the win', () => {
    const r = mkRound(2, inp({ fails: 0, assassinFoundMerlin: true, winners: ['p4', 'p5'] }));
    expect(describeAvalon(r, 5)).toContain('Evil steals it');
  });

  it('narrates an Evil quest-fail victory', () => {
    const r = mkRound(2, inp({ fails: 1, winners: ['p4', 'p5'] }));
    expect(describeAvalon(r, 5)).toContain('🗡️ Evil triumphs');
  });

  it('handles a round with no recorded input', () => {
    const r: Round = { id: 'x', gameId: 'g', index: 0, input: undefined, deltas: {}, createdAt: 0 };
    expect(describeAvalon(r, 5)).toBe('Quest 1');
  });
});
