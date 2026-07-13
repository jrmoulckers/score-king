import { describe, expect, it } from 'vitest';
import type { Player, RoundContext } from '../../types';
import { spikeball } from './index';
import {
  readConfig,
  teamSize,
  requiredPlayers,
  splitTeams,
  gamesToWin,
  gameWinner,
  gamePointTeam,
  isMatchPoint,
  isDeuce,
  clinchesMatch,
  currentRun,
  pushRally,
  popRally,
  scoreFromRallies,
  matchOver,
  scoreDeltas,
  validate,
  summarize,
  type SpikeballConfig,
  type SpikeballInput,
} from './logic';

const cfg = (over: Partial<SpikeballConfig> = {}): SpikeballConfig => ({
  format: '2v2',
  target: 21,
  winByTwo: true,
  bestOf: 3,
  ...over,
});

describe('readConfig', () => {
  it('defaults an empty config to 2v2 · 21 · win-by-2 · best-of-3', () => {
    expect(readConfig({})).toEqual({ format: '2v2', target: 21, winByTwo: true, bestOf: 3 });
  });

  it('coerces string select values into numbers/booleans', () => {
    expect(readConfig({ format: '1v1', target: '15', winByTwo: false, bestOf: '5' })).toEqual({
      format: '1v1',
      target: 15,
      winByTwo: false,
      bestOf: 5,
    });
  });

  it('falls back to sane values for garbage input', () => {
    expect(readConfig({ target: 'abc', bestOf: 4 })).toMatchObject({ target: 21, bestOf: 3 });
  });
});

describe('teams', () => {
  it('has one player per side in 1v1 and two in 2v2', () => {
    expect(teamSize('1v1')).toBe(1);
    expect(teamSize('2v2')).toBe(2);
    expect(requiredPlayers('1v1')).toBe(2);
    expect(requiredPlayers('2v2')).toBe(4);
  });

  it('splits the roster into first-half vs. second-half teams', () => {
    expect(splitTeams(['a', 'b'], '1v1')).toEqual([['a'], ['b']]);
    expect(splitTeams(['a', 'b', 'c', 'd'], '2v2')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('gamesToWin (match length)', () => {
  it('needs a majority of the best-of-N games', () => {
    expect(gamesToWin(1)).toBe(1);
    expect(gamesToWin(3)).toBe(2);
    expect(gamesToWin(5)).toBe(3);
  });
});

describe('gameWinner — first to 21, win by 2', () => {
  it('is undecided before a team reaches the target', () => {
    expect(gameWinner(20, 18, 21, true)).toBeNull();
    expect(gameWinner(0, 0, 21, true)).toBeNull();
  });

  it('awards the game at 21 with a two-point lead', () => {
    expect(gameWinner(21, 19, 21, true)).toBe(0);
    expect(gameWinner(19, 21, 21, true)).toBe(1);
  });

  it('requires a two-point margin: 21–20 keeps playing', () => {
    expect(gameWinner(21, 20, 21, true)).toBeNull();
  });

  it('resolves deuce beyond the target once the lead reaches two', () => {
    expect(gameWinner(22, 20, 21, true)).toBe(0);
    expect(gameWinner(24, 24, 21, true)).toBeNull();
    expect(gameWinner(25, 23, 21, true)).toBe(0);
    expect(gameWinner(23, 25, 21, true)).toBe(1);
  });

  it('honors alternate targets 15 and 11', () => {
    expect(gameWinner(15, 13, 15, true)).toBe(0);
    expect(gameWinner(15, 14, 15, true)).toBeNull();
    expect(gameWinner(11, 9, 11, true)).toBe(0);
  });

  it('with win-by-2 off, first to the target wins by one', () => {
    expect(gameWinner(21, 20, 21, false)).toBe(0);
    expect(gameWinner(21, 21, 21, false)).toBeNull();
  });
});

describe('gamePointTeam', () => {
  it('flags the side one rally from taking the game', () => {
    expect(gamePointTeam(20, 18, 21, true)).toBe(0);
    expect(gamePointTeam(18, 20, 21, true)).toBe(1);
  });

  it('is null at deuce, where a single point cannot end it', () => {
    expect(gamePointTeam(20, 20, 21, true)).toBeNull();
  });

  it('is null once the game is already won', () => {
    expect(gamePointTeam(21, 19, 21, true)).toBeNull();
  });

  it('re-flags game point after a deuce lead, e.g. 22–21', () => {
    expect(gamePointTeam(22, 21, 21, true)).toBe(0);
  });
});

describe('match completion', () => {
  it('isMatchPoint is true only when the game-point win also clinches the match', () => {
    // Best of 3: leader already has 1 game and is at game point → match point.
    expect(isMatchPoint(0, 1, 0, 3)).toBe(true);
    // First game at game point → not yet match point.
    expect(isMatchPoint(0, 0, 0, 3)).toBe(false);
    // Nobody at game point.
    expect(isMatchPoint(null, 1, 1, 3)).toBe(false);
  });

  it('matchOver reflects a majority of games won', () => {
    expect(matchOver(0, 0, 3)).toBe(false);
    expect(matchOver(1, 0, 3)).toBe(false);
    expect(matchOver(2, 1, 3)).toBe(true);
    expect(matchOver(1, 0, 1)).toBe(true);
    expect(matchOver(2, 2, 5)).toBe(false);
    expect(matchOver(3, 2, 5)).toBe(true);
  });
});

describe('isDeuce', () => {
  it('flags a tie at or past one short of the target (20–20, 21–21)', () => {
    expect(isDeuce(20, 20, 21, true)).toBe(true);
    expect(isDeuce(22, 22, 21, true)).toBe(true);
  });

  it('is false before the deuce zone', () => {
    expect(isDeuce(19, 19, 21, true)).toBe(false);
    expect(isDeuce(20, 18, 21, true)).toBe(false);
  });

  it('is false at an advantage lead (that is game point, not deuce)', () => {
    expect(isDeuce(21, 20, 21, true)).toBe(false);
  });

  it('is false once the game is decided', () => {
    expect(isDeuce(23, 21, 21, true)).toBe(false);
  });

  it('is always false without win-by-2', () => {
    expect(isDeuce(20, 20, 21, false)).toBe(false);
  });
});

describe('clinchesMatch', () => {
  it('is true when banking the game reaches the majority (best of 3)', () => {
    expect(clinchesMatch(0, 1, 0, 3)).toBe(true);
    expect(clinchesMatch(1, 0, 1, 3)).toBe(true);
  });

  it('is false when the winner still needs more games', () => {
    expect(clinchesMatch(0, 0, 0, 3)).toBe(false);
    expect(clinchesMatch(1, 1, 1, 5)).toBe(false);
  });

  it('is false when there is no winner yet', () => {
    expect(clinchesMatch(null, 1, 1, 3)).toBe(false);
  });

  it('clinches a single-game match in one game', () => {
    expect(clinchesMatch(0, 0, 0, 1)).toBe(true);
  });
});

describe('rally log', () => {
  it('sums a log into the two teams’ scores', () => {
    expect(scoreFromRallies([])).toEqual({ a: 0, b: 0 });
    expect(scoreFromRallies([0, 1, 0, 0, 1])).toEqual({ a: 3, b: 2 });
  });

  it('pushRally and popRally are immutable', () => {
    const log: (0 | 1)[] = [0, 1];
    const pushed = pushRally(log, 0);
    expect(pushed).toEqual([0, 1, 0]);
    expect(log).toEqual([0, 1]); // original untouched
    const popped = popRally(pushed);
    expect(popped).toEqual([0, 1]);
    expect(pushed).toEqual([0, 1, 0]);
  });

  it('popRally on an empty log is a no-op', () => {
    expect(popRally([])).toEqual([]);
  });

  it('a round-trip of push/score stays consistent', () => {
    let log: (0 | 1)[] = [];
    for (const t of [0, 0, 1, 0, 1, 1] as const) log = pushRally(log, t);
    expect(scoreFromRallies(log)).toEqual({ a: 3, b: 3 });
    log = popRally(log);
    expect(scoreFromRallies(log)).toEqual({ a: 3, b: 2 });
  });
});

describe('currentRun', () => {
  it('reports no run for an empty log', () => {
    expect(currentRun([])).toEqual({ team: null, length: 0 });
  });

  it('counts the trailing unbroken streak', () => {
    expect(currentRun([1, 0, 0, 0])).toEqual({ team: 0, length: 3 });
    expect(currentRun([0, 0, 1])).toEqual({ team: 1, length: 1 });
  });

  it('resets to length 1 the moment the other team scores', () => {
    expect(currentRun([0, 0, 0, 1])).toEqual({ team: 1, length: 1 });
  });
});

describe('scoreDeltas', () => {
  it('gives every winner +1 game and everyone else 0 (2v2)', () => {
    const input: SpikeballInput = { teams: [['a', 'b'], ['c', 'd']], a: 21, b: 15 };
    expect(scoreDeltas(input, ['a', 'b', 'c', 'd'], cfg())).toEqual({ a: 1, b: 1, c: 0, d: 0 });
  });

  it('awards the trailing team when they win the deuce', () => {
    const input: SpikeballInput = { teams: [['a', 'b'], ['c', 'd']], a: 20, b: 22 };
    expect(scoreDeltas(input, ['a', 'b', 'c', 'd'], cfg())).toEqual({ a: 0, b: 0, c: 1, d: 1 });
  });

  it('awards nothing for an unfinished game', () => {
    const input: SpikeballInput = { teams: [['a'], ['b']], a: 21, b: 20 };
    expect(scoreDeltas(input, ['a', 'b'], cfg({ format: '1v1' }))).toEqual({ a: 0, b: 0 });
  });
});

describe('validate', () => {
  it('accepts a well-formed, finished 2v2 game', () => {
    const input: SpikeballInput = { teams: [['a', 'b'], ['c', 'd']], a: 21, b: 18 };
    expect(validate(input, ['a', 'b', 'c', 'd'], cfg())).toBeNull();
  });

  it('rejects the wrong player count for the format', () => {
    const input: SpikeballInput = { teams: [['a', 'b'], ['c']], a: 21, b: 10 };
    const msg = validate(input, ['a', 'b', 'c'], cfg());
    expect(msg).toContain('4 players');
  });

  it('rejects a game that is not over yet', () => {
    const input: SpikeballInput = { teams: [['a', 'b'], ['c', 'd']], a: 21, b: 20 };
    expect(validate(input, ['a', 'b', 'c', 'd'], cfg())).toContain('isn’t over');
  });

  it('rejects negative scores', () => {
    const input: SpikeballInput = { teams: [['a'], ['b']], a: -1, b: 21 };
    expect(validate(input, ['a', 'b'], cfg({ format: '1v1' }))).toContain('negative');
  });
});

describe('summarize', () => {
  const names: Record<string, string> = { a: 'Ada', b: 'Bo', c: 'Cy', d: 'Dot' };
  const nameOf = (id: string) => names[id] ?? '?';

  it('names the winners and orders the score high–low', () => {
    const input: SpikeballInput = { teams: [['a', 'b'], ['c', 'd']], a: 18, b: 21 };
    expect(summarize(input, nameOf)).toBe('🏐 Cy & Dot def. Ada & Bo 21–18');
  });

  it('reads naturally for 1v1', () => {
    const input: SpikeballInput = { teams: [['a'], ['c']], a: 21, b: 12 };
    expect(summarize(input, nameOf)).toBe('🏐 Ada def. Cy 21–12');
  });
});

// --- Module wiring: the real GameModule exercised end-to-end (no editor UI). -----------
const player = (id: string): Player => ({ id, name: id.toUpperCase(), color: '#7c5cff', createdAt: 0 });

function ctx(ids: string[], config: Record<string, unknown>, totals: Record<string, number> = {}): RoundContext {
  return {
    game: { id: 'g', type: 'spikeball', config, playerIds: ids, status: 'active', createdAt: 0, roundCount: 0 },
    players: ids.map(player),
    config,
    roundIndex: Object.keys(totals).length ? 1 : 0,
    totals,
    rounds: [],
  };
}

describe('spikeball GameModule', () => {
  it('is registered with the expected identity and bounds', () => {
    expect(spikeball.id).toBe('spikeball');
    expect(spikeball.minPlayers).toBe(2);
    expect(spikeball.maxPlayers).toBe(4);
    expect(spikeball.teams).toBe(true);
  });

  it('seeds a round with teams split from the roster and 0–0', () => {
    const input = spikeball.createRoundInput(ctx(['a', 'b', 'c', 'd'], { format: '2v2' })) as SpikeballInput;
    expect(input).toEqual({ teams: [['a', 'b'], ['c', 'd']], a: 0, b: 0, rallies: [] });
  });

  it('scores a finished game into per-player game wins', () => {
    const c = ctx(['a', 'b', 'c', 'd'], { format: '2v2', target: '21' });
    const input: SpikeballInput = { teams: [['a', 'b'], ['c', 'd']], a: 21, b: 17 };
    expect(spikeball.scoreRound(input, c)).toEqual({ a: 1, b: 1, c: 0, d: 0 });
  });

  it('finishes the match when a team reaches the games needed (best of 3 → 2)', () => {
    const info = { config: { bestOf: '3' }, roundCount: 3, playerCount: 4 };
    expect(spikeball.isFinished!({ a: 1, b: 1, c: 1, d: 1 }, info)).toBe(false);
    expect(spikeball.isFinished!({ a: 2, b: 2, c: 1, d: 1 }, info)).toBe(true);
  });

  it('finishes a single-game match after one game', () => {
    const info = { config: { bestOf: '1' }, roundCount: 1, playerCount: 2 };
    expect(spikeball.isFinished!({ a: 1, b: 0 }, info)).toBe(true);
  });

  it('summarizes a recorded round for the history log', () => {
    const round = {
      id: 'r',
      gameId: 'g',
      index: 0,
      input: { teams: [['a', 'b'], ['c', 'd']], a: 21, b: 15 } satisfies SpikeballInput,
      deltas: {},
      createdAt: 0,
    };
    const players = ['a', 'b', 'c', 'd'].map(player);
    expect(spikeball.describeRound!(round, players)).toContain('def.');
  });
});
