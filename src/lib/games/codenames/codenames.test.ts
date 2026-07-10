import { describe, it, expect } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import {
  balanceTeams,
  carryTeams,
  codeword,
  createInput,
  defaultTeams,
  describe as summarize,
  matchOver,
  otherTeam,
  pickWinners,
  score,
  seriesState,
  shuffleTeams,
  streak,
  swapTeams,
  tally,
  teamCounts,
  validate,
  type CodenamesInput,
  type Team,
} from './logic';
import { codenamesStats } from './stats';

// ── fixtures ────────────────────────────────────────────────────────────────
const player = (id: string): Player => ({ id, name: id.toUpperCase(), color: '#7c5cff', createdAt: 0 });
const players = (...ids: string[]): Player[] => ids.map(player);

const input = (
  teams: Record<ID, Team>,
  winner: Team | null = null,
  ending: CodenamesInput['ending'] = 'agents',
  spymasters?: CodenamesInput['spymasters'],
): CodenamesInput => ({ teams, winner, ending, ...(spymasters ? { spymasters } : {}) });

const round = (index: number, inp: CodenamesInput): Round => ({
  id: `r${index}`,
  gameId: 'g',
  index,
  input: inp,
  deltas: {},
  createdAt: index,
});

const ctx = (ps: Player[], rounds: Round[] = [], config: Record<string, unknown> = {}): RoundContext => {
  const game: Game = {
    id: 'g',
    type: 'codenames',
    config,
    playerIds: ps.map((p) => p.id),
    status: 'active',
    createdAt: 0,
    roundCount: rounds.length,
  };
  return { game, players: ps, config, roundIndex: rounds.length, totals: {}, rounds };
};

// ── team helpers ──────────────────────────────────────────────────────────────
describe('defaultTeams', () => {
  it('alternates Red/Blue by seat order', () => {
    expect(defaultTeams(['a', 'b', 'c', 'd'])).toEqual({ a: 'red', b: 'blue', c: 'red', d: 'blue' });
  });
  it('handles a single player', () => {
    expect(defaultTeams(['solo'])).toEqual({ solo: 'red' });
  });
});

describe('carryTeams', () => {
  it('defaults when there is no previous map', () => {
    expect(carryTeams(undefined, ['a', 'b', 'c'])).toEqual(defaultTeams(['a', 'b', 'c']));
  });
  it('keeps known players and defaults new ones', () => {
    expect(carryTeams({ a: 'blue', b: 'red' }, ['a', 'b', 'c'])).toEqual({ a: 'blue', b: 'red', c: 'red' });
  });
  it('drops players no longer in the game', () => {
    const out = carryTeams({ a: 'blue', gone: 'red' }, ['a', 'b']);
    expect(out).toEqual({ a: 'blue', b: 'blue' });
    expect('gone' in out).toBe(false);
  });
  it('ignores a corrupt team value and falls back to the default', () => {
    expect(carryTeams({ a: 'green' as unknown as Team }, ['a'])).toEqual({ a: 'red' });
  });
});

describe('teamCounts', () => {
  it('counts each side over the given roster only', () => {
    expect(teamCounts({ a: 'red', b: 'blue', c: 'red' }, ['a', 'b', 'c'])).toEqual({ red: 2, blue: 1 });
  });
  it('only counts players in the roster', () => {
    expect(teamCounts({ a: 'red', b: 'blue' }, ['a'])).toEqual({ red: 1, blue: 0 });
  });
});

describe('otherTeam', () => {
  it('flips sides', () => {
    expect(otherTeam('red')).toBe('blue');
    expect(otherTeam('blue')).toBe('red');
  });
});

// ── createInput ───────────────────────────────────────────────────────────────
describe('createInput', () => {
  it('starts a fresh match with balanced teams and no winner', () => {
    const out = createInput(ctx(players('a', 'b', 'c')));
    expect(out).toEqual({ teams: { a: 'red', b: 'blue', c: 'red' }, winner: null, ending: 'agents' });
  });
  it('carries the previous game\'s teams forward and clears the winner', () => {
    const prev = round(0, input({ a: 'blue', b: 'blue', c: 'red' }, 'blue', 'assassin'));
    const out = createInput(ctx(players('a', 'b', 'c'), [prev]));
    expect(out.teams).toEqual({ a: 'blue', b: 'blue', c: 'red' });
    expect(out.winner).toBeNull();
    expect(out.ending).toBe('agents');
  });
  it('carries from the highest-index round regardless of array order', () => {
    const r0 = round(0, input({ a: 'red', b: 'blue' }, 'red'));
    const r1 = round(1, input({ a: 'blue', b: 'red' }, 'blue'));
    const out = createInput(ctx(players('a', 'b'), [r1, r0]));
    expect(out.teams).toEqual({ a: 'blue', b: 'red' });
  });
});

// ── validate ──────────────────────────────────────────────────────────────────
describe('validate', () => {
  const ids = ['a', 'b'];
  it('passes when both teams are staffed and a winner is chosen', () => {
    expect(validate(input({ a: 'red', b: 'blue' }, 'red'), ids)).toBeNull();
  });
  it('rejects an empty side', () => {
    expect(validate(input({ a: 'red', b: 'red' }, 'red'), ids)).toMatch(/each team/i);
  });
  it('rejects a missing winner', () => {
    expect(validate(input({ a: 'red', b: 'blue' }, null), ids)).toMatch(/won this game/i);
  });
});

// ── score ─────────────────────────────────────────────────────────────────────
describe('score', () => {
  it('awards +1 to the winning team and 0 to the rest', () => {
    const ids = ['a', 'b', 'c'];
    const out = score(input({ a: 'red', b: 'red', c: 'blue' }, 'red'), ids);
    expect(out).toEqual({ a: 1, b: 1, c: 0 });
  });
  it('flips when the other team wins', () => {
    const ids = ['a', 'b', 'c'];
    const out = score(input({ a: 'red', b: 'red', c: 'blue' }, 'blue'), ids);
    expect(out).toEqual({ a: 0, b: 0, c: 1 });
  });
});

// ── pickWinners ───────────────────────────────────────────────────────────────
describe('pickWinners', () => {
  it('returns nothing for an empty or scoreless match', () => {
    expect(pickWinners({})).toEqual([]);
    expect(pickWinners({ a: 0, b: 0 })).toEqual([]);
  });
  it('returns the leading team', () => {
    expect(pickWinners({ a: 2, b: 2, c: 1 }).sort()).toEqual(['a', 'b']);
  });
  it('returns both teams (co-winners) when the match is level', () => {
    expect(pickWinners({ a: 3, b: 3 }).sort()).toEqual(['a', 'b']);
  });
});

// ── matchOver ─────────────────────────────────────────────────────────────────
describe('matchOver', () => {
  it('is open-ended when the target is 0 or missing', () => {
    expect(matchOver({ a: 5 }, 0)).toBe(false);
    expect(matchOver({ a: 5 }, Number.NaN)).toBe(false);
  });
  it('ends once a team reaches the target', () => {
    expect(matchOver({ a: 3, b: 1 }, 3)).toBe(true);
    expect(matchOver({ a: 2, b: 1 }, 3)).toBe(false);
  });
});

// ── tally ─────────────────────────────────────────────────────────────────────
describe('tally', () => {
  it('counts games won per side and ignores unresolved rounds', () => {
    const rounds = [
      round(0, input({ a: 'red', b: 'blue' }, 'red')),
      round(1, input({ a: 'red', b: 'blue' }, 'blue')),
      round(2, input({ a: 'red', b: 'blue' }, 'red')),
      round(3, input({ a: 'red', b: 'blue' }, null)),
    ];
    expect(tally(rounds)).toEqual({ red: 2, blue: 1 });
  });
});

// ── describe ──────────────────────────────────────────────────────────────────
describe('describe', () => {
  it('summarises a clean win', () => {
    expect(summarize(input({ a: 'red' }, 'red', 'agents'))).toBe('🔴 Red won');
  });
  it('flags an assassin ending', () => {
    expect(summarize(input({ a: 'blue' }, 'blue', 'assassin'))).toBe('🔵 Blue won · 💀 assassin');
  });
  it('handles an unrecorded winner', () => {
    expect(summarize(input({ a: 'red' }, null))).toBe('No winner recorded');
  });
});

// ── end-to-end match ──────────────────────────────────────────────────────────
describe('a full match', () => {
  it('accumulates game wins and crowns the leading team', () => {
    const ids = ['a', 'b', 'c'];
    const teams: Record<ID, Team> = { a: 'red', b: 'red', c: 'blue' };
    const games: Array<Team> = ['red', 'blue', 'red']; // Red 2, Blue 1

    const totals: Record<ID, number> = { a: 0, b: 0, c: 0 };
    for (const winner of games) {
      const deltas = score(input(teams, winner), ids);
      for (const id of ids) totals[id] += deltas[id];
    }

    expect(totals).toEqual({ a: 2, b: 2, c: 1 });
    expect(pickWinners(totals).sort()).toEqual(['a', 'b']);
    expect(matchOver(totals, 2)).toBe(true);
  });
});

// ── seriesState ─────────────────────────────────────────────────────────────
describe('seriesState', () => {
  it('is an open head-to-head with no target', () => {
    const s = seriesState({ red: 3, blue: 1 }, 0);
    expect(s).toMatchObject({ target: 0, leader: 'red', matchPoint: false, decider: false, over: false });
  });
  it('reports a level series with no leader', () => {
    expect(seriesState({ red: 2, blue: 2 }, 4).leader).toBeNull();
  });
  it('flags match point one game from the target', () => {
    const s = seriesState({ red: 2, blue: 0 }, 3);
    expect(s).toMatchObject({ leader: 'red', redNeeded: 1, blueNeeded: 3, matchPoint: true, decider: false, over: false });
  });
  it('flags a decider when both sides need one', () => {
    const s = seriesState({ red: 2, blue: 2 }, 3);
    expect(s).toMatchObject({ matchPoint: true, decider: true, over: false });
  });
  it('reports the series as over once a side reaches the target', () => {
    const s = seriesState({ red: 3, blue: 1 }, 3);
    expect(s).toMatchObject({ over: true, matchPoint: false, decider: false });
  });
  it('sanitises a junk target', () => {
    expect(seriesState({ red: 1, blue: 0 }, Number.NaN).target).toBe(0);
    expect(seriesState({ red: 1, blue: 0 }, -4).target).toBe(0);
  });
});

// ── streak ──────────────────────────────────────────────────────────────────
describe('streak', () => {
  it('is empty with no resolved games', () => {
    expect(streak([])).toEqual({ team: null, length: 0 });
    expect(streak([round(0, input({ a: 'red', b: 'blue' }, null))])).toEqual({ team: null, length: 0 });
  });
  it('counts the current run and resets on a side change', () => {
    const rounds = [
      round(0, input({ a: 'red', b: 'blue' }, 'blue')),
      round(1, input({ a: 'red', b: 'blue' }, 'red')),
      round(2, input({ a: 'red', b: 'blue' }, 'red')),
    ];
    expect(streak(rounds)).toEqual({ team: 'red', length: 2 });
  });
  it('reads in play order regardless of array order and skips unresolved rounds', () => {
    const rounds = [
      round(2, input({ a: 'red', b: 'blue' }, 'blue')),
      round(0, input({ a: 'red', b: 'blue' }, 'blue')),
      round(1, input({ a: 'red', b: 'blue' }, null)),
    ];
    expect(streak(rounds)).toEqual({ team: 'blue', length: 2 });
  });
});

// ── fast team assignment ──────────────────────────────────────────────────────
describe('balanceTeams', () => {
  it('matches the alternating default split', () => {
    expect(balanceTeams(['a', 'b', 'c', 'd'])).toEqual(defaultTeams(['a', 'b', 'c', 'd']));
  });
});

describe('swapTeams', () => {
  it('flips every side', () => {
    expect(swapTeams({ a: 'red', b: 'blue', c: 'red' })).toEqual({ a: 'blue', b: 'red', c: 'blue' });
  });
  it('repairs a corrupt entry to a valid side', () => {
    expect(swapTeams({ a: 'green' as unknown as Team })).toEqual({ a: 'red' });
  });
});

describe('shuffleTeams', () => {
  it('is deterministic under an injected RNG and stays balanced', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const seq = [0.9, 0.1, 0.7, 0.3, 0.5];
    let i = 0;
    const rand = () => seq[i++ % seq.length];
    const out = shuffleTeams(ids, rand);
    const counts = teamCounts(out, ids);
    expect(Math.abs(counts.red - counts.blue)).toBeLessThanOrEqual(1);
    // Same RNG sequence → same assignment.
    i = 0;
    expect(shuffleTeams(ids, () => seq[i++ % seq.length])).toEqual(out);
  });
  it('assigns every player a valid side', () => {
    const ids = ['a', 'b', 'c'];
    const out = shuffleTeams(ids, () => 0);
    expect(Object.keys(out).sort()).toEqual(ids);
    for (const id of ids) expect(['red', 'blue']).toContain(out[id]);
  });
});

// ── codeword ──────────────────────────────────────────────────────────────────
describe('codeword', () => {
  it('is deterministic for the same seed', () => {
    expect(codeword('g1')).toBe(codeword('g1'));
    expect(codeword(42)).toBe(codeword(42));
  });
  it('returns an uppercase word from the list', () => {
    const w = codeword('anything');
    expect(w).toMatch(/^[A-Z]+$/);
  });
});

// ── spymasters are non-scoring ────────────────────────────────────────────────
describe('optional spymasters', () => {
  const ids = ['a', 'b', 'c'];
  const spies = { red: 'a', blue: 'c' };
  it('does not change scoring', () => {
    const withSpies = input({ a: 'red', b: 'red', c: 'blue' }, 'red', 'agents', spies);
    const without = input({ a: 'red', b: 'red', c: 'blue' }, 'red');
    expect(score(withSpies, ids)).toEqual(score(without, ids));
  });
  it('does not change validation', () => {
    expect(validate(input({ a: 'red', b: 'blue' }, 'red', 'agents', { red: 'a', blue: 'b' }), ['a', 'b'])).toBeNull();
  });
});

// ── stats ─────────────────────────────────────────────────────────────────────
const game = (id = 'g', config: Record<string, unknown> = {}): Game => ({
  id,
  type: 'codenames',
  config,
  playerIds: [],
  status: 'active',
  createdAt: 0,
  roundCount: 0,
});
const statsInput = (rounds: Round[], ps: Player[] = players('a', 'b', 'c', 'd')) => ({
  games: [game()],
  rounds,
  players: ps,
  canonical: (id: ID) => id,
});

describe('codenamesStats', () => {
  it('surfaces the longest win streak (min 2)', () => {
    const rounds = [
      round(0, input({ a: 'red', b: 'blue' }, 'red')),
      round(1, input({ a: 'red', b: 'blue' }, 'red')),
      round(2, input({ a: 'red', b: 'blue' }, 'red')),
      round(3, input({ a: 'red', b: 'blue' }, 'blue')),
    ];
    const { global } = codenamesStats(statsInput(rounds));
    const streakMetric = global?.find((m) => m.key === 'cn_streak');
    expect(streakMetric?.value).toContain('3 in a row');
    expect(streakMetric?.value).toContain('🔴');
  });
  it('omits the streak metric when no side wins twice running', () => {
    const rounds = [
      round(0, input({ a: 'red', b: 'blue' }, 'red')),
      round(1, input({ a: 'red', b: 'blue' }, 'blue')),
    ];
    const { global } = codenamesStats(statsInput(rounds));
    expect(global?.some((m) => m.key === 'cn_streak')).toBe(false);
  });
  it('computes spymaster win rate only when logged', () => {
    const rounds = [
      round(0, input({ a: 'red', b: 'blue' }, 'red', 'agents', { red: 'a', blue: 'b' })),
      round(1, input({ a: 'red', b: 'blue' }, 'blue', 'agents', { red: 'a', blue: 'b' })),
    ];
    const { perPlayer } = codenamesStats(statsInput(rounds));
    const aSpy = perPlayer?.['a']?.find((m) => m.key === 'cn_spymaster');
    expect(aSpy?.value).toBe('50%');
    expect(aSpy?.sub).toContain('1/2');
  });
  it('omits spymaster metrics when no desks were logged', () => {
    const rounds = [round(0, input({ a: 'red', b: 'blue' }, 'red'))];
    const { perPlayer } = codenamesStats(statsInput(rounds));
    const hasSpy = Object.values(perPlayer ?? {}).some((ms) => ms.some((m) => m.key === 'cn_spymaster'));
    expect(hasSpy).toBe(false);
  });
});
