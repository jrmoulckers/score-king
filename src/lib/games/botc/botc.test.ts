import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import {
  aliveCount,
  aliveTeamCount,
  carryRoster,
  demonStatus,
  describe as describePhase,
  evilKnowledge,
  evilWinsIn,
  ghostVotesLeft,
  initialRoster,
  isDemonRole,
  isResolved,
  phaseEmoji,
  phaseKind,
  phaseLabel,
  phaseNumber,
  pickWinners,
  roleTeam,
  roleType,
  rolesFor,
  scoreRound,
  scriptRef,
  teamCount,
  teamOfType,
  validate,
  voteThreshold,
  type BotcInput,
  type PlayerState,
} from './logic';
import { botc } from './index';
import { botcStats } from './stats';

const player = (id: string, name = id): Player => ({ id, name, color: '#7c5cff', createdAt: 0 });

function state(partial: Partial<PlayerState> = {}): PlayerState {
  return { role: '', team: 'good', alive: true, ghostUsed: false, ...partial };
}

function input(partial: Partial<BotcInput> = {}): BotcInput {
  return { states: {}, nominations: [], result: null, note: '', ...partial };
}

function ctxFor(
  playerIds: string[],
  opts: { roundIndex?: number; config?: Record<string, unknown>; rounds?: Round[] } = {},
): RoundContext {
  const config = opts.config ?? { script: 'tb' };
  return {
    game: {
      id: 'g',
      type: 'botc',
      config,
      playerIds,
      status: 'active',
      createdAt: 0,
      roundCount: 0,
    } as Game,
    players: playerIds.map((id) => player(id)),
    config,
    roundIndex: opts.roundIndex ?? 0,
    totals: Object.fromEntries(playerIds.map((id) => [id, 0])),
    rounds: opts.rounds ?? [],
  };
}

function mkRound(index: number, inp: BotcInput, playerIds: string[]): Round {
  return { id: `g-r${index}`, gameId: 'g', index, input: inp, deltas: scoreRound(inp, playerIds), createdAt: 0 };
}

// ── Phase math ──────────────────────────────────────────────────────────────

describe('phase math — alternates night → day from the first night', () => {
  it('reads kind straight from the round index', () => {
    expect(phaseKind(0)).toBe('night');
    expect(phaseKind(1)).toBe('day');
    expect(phaseKind(2)).toBe('night');
    expect(phaseKind(3)).toBe('day');
  });

  it('numbers each night/day pair', () => {
    expect(phaseNumber(0)).toBe(1);
    expect(phaseNumber(1)).toBe(1);
    expect(phaseNumber(2)).toBe(2);
    expect(phaseNumber(3)).toBe(2);
  });

  it('labels and emojis the phase', () => {
    expect(phaseLabel(0)).toBe('Night 1');
    expect(phaseLabel(1)).toBe('Day 1');
    expect(phaseLabel(4)).toBe('Night 3');
    expect(phaseEmoji(0)).toBe('🌙');
    expect(phaseEmoji(1)).toBe('☀️');
  });
});

// ── Roster ────────────────────────────────────────────────────────────────

describe('initialRoster — everyone alive, unassigned, presumed good', () => {
  it('seats every player fresh', () => {
    const r = initialRoster(['A', 'B']);
    expect(Object.keys(r).sort()).toEqual(['A', 'B']);
    expect(r.A).toEqual(state());
  });
});

describe('carryRoster — persists role/team/alive/ghost between phases', () => {
  it('carries each seat forward', () => {
    const prev = { A: state({ role: 'Imp', team: 'evil', alive: false, ghostUsed: true }), B: state() };
    const next = carryRoster(prev, ['A', 'B']);
    expect(next.A).toEqual({ role: 'Imp', team: 'evil', alive: false, ghostUsed: true });
    expect(next.B).toEqual(state());
  });

  it('carries the Grimoire notes (demon, reminder, suspect) forward', () => {
    const prev = { A: state({ role: 'Imp', team: 'evil', isDemon: true, reminder: 'red herring', suspect: 'Fortune Teller' }) };
    const next = carryRoster(prev, ['A']);
    expect(next.A.isDemon).toBe(true);
    expect(next.A.reminder).toBe('red herring');
    expect(next.A.suspect).toBe('Fortune Teller');
  });

  it('seats a brand-new player fresh (defensive)', () => {
    const next = carryRoster({ A: state({ team: 'evil' }) }, ['A', 'C']);
    expect(next.C).toEqual(state());
  });

  it('clones so editing the next phase never mutates the previous one', () => {
    const prev = { A: state({ role: 'Chef' }) };
    const next = carryRoster(prev, ['A']);
    next.A.role = 'Imp';
    next.A.alive = false;
    expect(prev.A.role).toBe('Chef');
    expect(prev.A.alive).toBe(true);
  });

  it('starts empty when there is no previous roster', () => {
    expect(carryRoster(undefined, ['A'])).toEqual({ A: state() });
  });
});

describe('counts & the vote threshold', () => {
  const states = {
    A: state({ alive: true, team: 'good' }),
    B: state({ alive: false, team: 'good' }),
    C: state({ alive: true, team: 'evil' }),
  };

  it('counts the living', () => {
    expect(aliveCount(states)).toBe(2);
  });

  it('counts by team and living-by-team', () => {
    expect(teamCount(states, 'good')).toBe(2);
    expect(teamCount(states, 'evil')).toBe(1);
    expect(aliveTeamCount(states, 'good')).toBe(1);
    expect(aliveTeamCount(states, 'evil')).toBe(1);
  });

  it('needs a majority of the living to reach the block', () => {
    expect(voteThreshold(5)).toBe(3);
    expect(voteThreshold(6)).toBe(3);
    expect(voteThreshold(1)).toBe(1);
    expect(voteThreshold(0)).toBe(0);
  });
});

// ── Grimoire nudges (demon, ghost votes, evil-at-2, evil knowledge) ──────────

describe('ghostVotesLeft — dead players who still hold a ghost vote', () => {
  it('counts unspent ghost votes among the dead only', () => {
    const states = {
      A: state({ alive: true }),
      B: state({ alive: false, ghostUsed: false }),
      C: state({ alive: false, ghostUsed: true }),
      D: state({ alive: false, ghostUsed: false }),
    };
    expect(ghostVotesLeft(states)).toBe(2);
    expect(ghostVotesLeft({ A: state() })).toBe(0);
  });
});

describe('demonStatus — the Demon’s fate for the Good-wins nudge', () => {
  it('is unmarked until a Demon is flagged', () => {
    expect(demonStatus({ A: state(), B: state({ team: 'evil' }) })).toBe('unmarked');
  });

  it('is alive while any flagged Demon lives', () => {
    expect(demonStatus({ A: state({ team: 'evil', isDemon: true }), B: state() })).toBe('alive');
  });

  it('is fallen once every flagged Demon is dead', () => {
    expect(demonStatus({ A: state({ team: 'evil', isDemon: true, alive: false }), B: state() })).toBe('fallen');
  });
});

describe('evilWinsIn — deaths remaining until only two are left alive', () => {
  it('counts the living above the two-player floor', () => {
    expect(evilWinsIn({ A: state(), B: state(), C: state(), D: state() })).toBe(2);
    expect(evilWinsIn({ A: state(), B: state() })).toBe(0);
    expect(evilWinsIn({ A: state(), B: state({ alive: false }) })).toBe(0);
  });
});

describe('evilKnowledge — the first-night reveal for an evil seat', () => {
  const states = {
    A: state({ team: 'evil', isDemon: true }),
    B: state({ team: 'evil' }),
    C: state({ team: 'good' }),
  };

  it('shows a Minion their fellow evil and the Demon (excluding themselves)', () => {
    expect(evilKnowledge(states, 'B')).toEqual({ fellowEvil: ['A'], demonId: 'A' });
  });

  it('shows the Demon their Minions', () => {
    expect(evilKnowledge(states, 'A')).toEqual({ fellowEvil: ['B'], demonId: 'A' });
  });

  it('returns no Demon when none is flagged', () => {
    expect(evilKnowledge({ A: state({ team: 'evil' }), B: state({ team: 'evil' }) }, 'A')).toEqual({
      fellowEvil: ['B'],
      demonId: null,
    });
  });
});

// ── Scoring / winners ───────────────────────────────────────────────────────

describe('scoreRound — scoreless until a winner is recorded', () => {
  const states = { A: state({ team: 'good' }), B: state({ team: 'evil' }), C: state({ team: 'evil' }) };

  it('scores every seat 0 while tracking', () => {
    expect(scoreRound(input({ states }), ['A', 'B', 'C'])).toEqual({ A: 0, B: 0, C: 0 });
  });

  it('awards +1 to the whole winning team on the resolving phase', () => {
    expect(scoreRound(input({ states, result: 'evil' }), ['A', 'B', 'C'])).toEqual({ A: 0, B: 1, C: 1 });
    expect(scoreRound(input({ states, result: 'good' }), ['A', 'B', 'C'])).toEqual({ A: 1, B: 0, C: 0 });
  });

  it('keys every seat, even one missing from the roster snapshot', () => {
    const out = scoreRound(input({ states: { A: state({ team: 'evil' }) }, result: 'evil' }), ['A', 'B']);
    expect(out).toEqual({ A: 1, B: 0 });
  });
});

describe('pickWinners — the winning team shares the top total', () => {
  it('returns everyone tied at the top once a winner exists', () => {
    expect(pickWinners({ A: 0, B: 1, C: 1 }).sort()).toEqual(['B', 'C']);
    expect(pickWinners({ A: 1, B: 0 })).toEqual(['A']);
  });

  it('crowns nobody before a result is recorded', () => {
    expect(pickWinners({ A: 0, B: 0 })).toEqual([]);
    expect(pickWinners({})).toEqual([]);
  });
});

describe('isResolved — a result exists once any total crosses zero', () => {
  it('is false while scoreless and true after a win', () => {
    expect(isResolved({ A: 0, B: 0 })).toBe(false);
    expect(isResolved({ A: 0, B: 1 })).toBe(true);
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('validate — light guardrails for a tracker', () => {
  it('accepts an ordinary tracking phase', () => {
    expect(validate(input({ states: { A: state() } }), ['A'])).toBeNull();
  });

  it('nudges an empty nomination', () => {
    const bad = input({ nominations: [{ nominatorId: 'A', nomineeId: null, votes: 0, executed: false }] });
    expect(validate(bad, ['A'])).toMatch(/who was nominated/i);
  });

  it('rejects negative votes', () => {
    const bad = input({ nominations: [{ nominatorId: null, nomineeId: 'A', votes: -1, executed: false }] });
    expect(validate(bad, ['A'])).toMatch(/negative/i);
  });

  it('refuses to record a win for a team nobody is on', () => {
    const states = { A: state({ team: 'good' }), B: state({ team: 'good' }) };
    expect(validate(input({ states, result: 'evil' }), ['A', 'B'])).toMatch(/Evil team/i);
    expect(validate(input({ states, result: 'good' }), ['A', 'B'])).toBeNull();
  });
});

// ── Describe ────────────────────────────────────────────────────────────────

describe('describe — a glanceable one-line phase summary', () => {
  const nameOf = (id: ID) => ({ A: 'Ana', B: 'Bo', C: 'Cy' })[id] ?? '?';

  it('summarises a night by the living count', () => {
    const inp = input({ states: { A: state(), B: state({ alive: false }) } });
    expect(describePhase(inp, 2, nameOf)).toBe('🌙 Night 2 · 1 alive');
  });

  it('names the executed player on a day', () => {
    const inp = input({ nominations: [{ nominatorId: 'A', nomineeId: 'B', votes: 4, executed: true }] });
    expect(describePhase(inp, 1, nameOf)).toBe('☀️ Day 1 · Bo executed');
  });

  it('reports nominations with no execution', () => {
    const inp = input({ nominations: [{ nominatorId: 'A', nomineeId: 'B', votes: 1, executed: false }] });
    expect(describePhase(inp, 1, nameOf)).toBe('☀️ Day 1 · 1 nomination, no execution');
  });

  it('reports a quiet day', () => {
    expect(describePhase(input(), 3, nameOf)).toBe('☀️ Day 2 · no nominations');
  });

  it('always leads with the winner once recorded', () => {
    expect(describePhase(input({ result: 'evil' }), 2, nameOf)).toBe('🏁 Night 2 · Evil wins');
  });
});

// ── Script / role reference ─────────────────────────────────────────────────

describe('script & role reference (data only)', () => {
  it('maps role types to teams', () => {
    expect(teamOfType('townsfolk')).toBe('good');
    expect(teamOfType('outsider')).toBe('good');
    expect(teamOfType('minion')).toBe('evil');
    expect(teamOfType('demon')).toBe('evil');
  });

  it('exposes each edition’s character list', () => {
    expect(rolesFor('tb').some((r) => r.name === 'Imp' && r.type === 'demon')).toBe(true);
    expect(rolesFor('snv').some((r) => r.name === 'Vortox')).toBe(true);
    expect(rolesFor('custom')).toEqual([]);
  });

  it('infers a known role’s team case-insensitively, else null', () => {
    expect(roleTeam('imp', 'tb')).toBe('evil');
    expect(roleTeam('Washerwoman', 'tb')).toBe('good');
    expect(roleTeam('Poisoner', 'tb')).toBe('evil');
    expect(roleTeam('Not A Role', 'tb')).toBeNull();
    expect(roleTeam('', 'tb')).toBeNull();
  });

  it('exposes a known role’s type, else null', () => {
    expect(roleType('Imp', 'tb')).toBe('demon');
    expect(roleType('Poisoner', 'tb')).toBe('minion');
    expect(roleType('Butler', 'tb')).toBe('outsider');
    expect(roleType('Chef', 'tb')).toBe('townsfolk');
    expect(roleType('Nope', 'tb')).toBeNull();
  });

  it('flags a demon role for the auto-marker (case-insensitive)', () => {
    expect(isDemonRole('imp', 'tb')).toBe(true);
    expect(isDemonRole('Vortox', 'snv')).toBe(true);
    expect(isDemonRole('Poisoner', 'tb')).toBe(false);
    expect(isDemonRole('', 'tb')).toBe(false);
  });

  it('falls back to Trouble Brewing for an unknown script', () => {
    expect(scriptRef('nope').value).toBe('tb');
    expect(scriptRef(undefined).value).toBe('tb');
  });
});

// ── Module wiring ───────────────────────────────────────────────────────────

describe('botc module', () => {
  it('has the folder id and a Storyteller-sized seat range', () => {
    expect(botc.id).toBe('botc');
    expect(botc.minPlayers).toBe(5);
    expect(botc.maxPlayers).toBe(20);
    expect(typeof botc.emoji).toBe('string');
    expect(typeof botc.help).toBe('string');
    expect(botc.maxRounds).toBeUndefined();
  });

  it('opens Night 1 with a fresh roster', () => {
    const first = botc.createRoundInput(ctxFor(['A', 'B', 'C', 'D', 'E'])) as BotcInput;
    expect(first.states).toEqual(initialRoster(['A', 'B', 'C', 'D', 'E']));
    expect(first.nominations).toEqual([]);
    expect(first.result).toBeNull();
  });

  it('carries the roster forward into later phases but resets phase events', () => {
    const night1 = mkRound(
      0,
      input({ states: { A: state({ role: 'Imp', team: 'evil' }), B: state({ alive: false }) }, note: 'kept me busy' }),
      ['A', 'B'],
    );
    const next = botc.createRoundInput(ctxFor(['A', 'B'], { roundIndex: 1, rounds: [night1] })) as BotcInput;
    expect(next.states.A).toEqual({ role: 'Imp', team: 'evil', alive: true, ghostUsed: false });
    expect(next.states.B.alive).toBe(false);
    expect(next.nominations).toEqual([]);
    expect(next.result).toBeNull();
    expect(next.note).toBe('');
  });

  it('validates & scores a resolving phase through the context', () => {
    const ctx = ctxFor(['A', 'B', 'C', 'D', 'E']);
    const inp = input({
      states: {
        A: state({ team: 'evil' }),
        B: state({ team: 'good' }),
        C: state({ team: 'good' }),
        D: state({ team: 'good' }),
        E: state({ team: 'good' }),
      },
      result: 'evil',
    });
    expect(botc.validateRound(inp, ctx)).toBeNull();
    expect(botc.scoreRound(inp, ctx)).toEqual({ A: 1, B: 0, C: 0, D: 0, E: 0 });
  });

  it('finishes only once a winner is recorded, then returns that team', () => {
    const info = { config: {}, roundCount: 3, playerCount: 5 };
    expect(botc.isFinished!({ A: 0, B: 0 }, info)).toBe(false);
    expect(botc.isFinished!({ A: 1, B: 0 }, info)).toBe(true);
    expect(botc.pickWinners!({ A: 1, B: 1, C: 0 }, {}).sort()).toEqual(['A', 'B']);
  });

  it('describes a recorded round for the history table', () => {
    const players = [player('A', 'Ana'), player('B', 'Bo')];
    const round = mkRound(1, input({ nominations: [{ nominatorId: 'A', nomineeId: 'B', votes: 3, executed: true }] }), ['A', 'B']);
    expect(botc.describeRound!(round, players)).toBe('☀️ Day 1 · Bo executed');
  });
});

// ── Stats ─────────────────────────────────────────────────────────────────

describe('botcStats', () => {
  const games: Game[] = [
    { id: 'g', type: 'botc', config: {}, playerIds: ['A', 'B', 'C'], status: 'finished', createdAt: 0, roundCount: 3 } as Game,
  ];
  // Night 1, Day 1 (B executed), Night 2 → Evil wins. A evil & alive; B good & dead; C good & alive.
  const rounds: Round[] = [
    mkRound(0, input({ states: { A: state({ team: 'evil' }), B: state(), C: state() } }), ['A', 'B', 'C']),
    mkRound(1, input({ states: { A: state({ team: 'evil' }), B: state({ alive: false }), C: state() }, nominations: [{ nominatorId: 'C', nomineeId: 'B', votes: 2, executed: true }] }), ['A', 'B', 'C']),
    mkRound(2, input({ states: { A: state({ team: 'evil' }), B: state({ alive: false }), C: state() }, result: 'evil' }), ['A', 'B', 'C']),
  ];
  const out = botcStats({ games, rounds, players: [], canonical: (id: ID) => id });

  it('counts Good vs Evil wins globally', () => {
    expect(out.global?.find((m) => m.key === 'botc_split')?.value).toBe('0–1');
  });

  it('reports average game length in phases', () => {
    expect(out.global?.find((m) => m.key === 'botc_len')?.value).toBe('3 phases');
  });

  it('counts games on the Evil team', () => {
    expect(out.perPlayer?.['A']?.find((m) => m.key === 'botc_evil')?.value).toBe('1');
    expect(out.perPlayer?.['C']?.some((m) => m.key === 'botc_evil')).toBeFalsy();
  });

  it('counts executions and survival', () => {
    expect(out.perPlayer?.['B']?.find((m) => m.key === 'botc_exec')?.value).toBe('1');
    expect(out.perPlayer?.['B']?.find((m) => m.key === 'botc_survive')?.value).toBe('0%');
    expect(out.perPlayer?.['C']?.find((m) => m.key === 'botc_survive')?.value).toBe('100%');
  });

  it('maps merged players to their canonical id', () => {
    const merged = botcStats({
      games,
      rounds: [
        mkRound(1, input({ nominations: [{ nominatorId: 'A', nomineeId: 'B2', votes: 2, executed: true }], states: { A: state(), B2: state({ alive: false }), C: state() } }), ['A', 'B2', 'C']),
      ],
      players: [],
      canonical: (id: ID) => (id === 'B2' ? 'B' : id),
    });
    expect(merged.perPlayer?.['B']?.find((m) => m.key === 'botc_exec')?.value).toBe('1');
  });
});
