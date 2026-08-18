import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round, RoundContext } from '../../types';
import { secrethitler } from './index';
import {
  FASCIST_TARGET,
  HITLER_CHANCELLOR_MIN,
  KILL_POWER_MIN,
  LIBERAL_TARGET,
  TRACKER_MAX,
  computeState,
  emptyState,
  eventOf,
  powerAt,
  powerColumn,
  previewAfter,
  roleSetup,
  teamSize,
  validate,
  type SHEventKind,
  type SecretHitlerInput,
} from './logic';

// ---- helpers ---------------------------------------------------------------

function player(id: string, name = id): Player {
  return { id, name, color: '#7c5cff', createdAt: 0 };
}

/** Seven seats — enough for the 4-Fascist / 2-Fascist role table and executions. */
const seats = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => player(id));

function ev(event: SHEventKind, extra: Partial<SecretHitlerInput> = {}): SecretHitlerInput {
  return { event, hitlerKilled: false, target: null, winners: [], ...extra };
}

/** `n` repetitions of one event — the quickest way to fill a policy track. */
function times(n: number, event: SHEventKind): SecretHitlerInput[] {
  return Array.from({ length: n }, () => ev(event));
}

function round(index: number, input: SecretHitlerInput): Round {
  return { id: `r${index}`, gameId: 'g', index, input, deltas: {}, createdAt: 0 };
}

function ctx(prior: SecretHitlerInput[], players: Player[] = seats): RoundContext {
  const rounds = prior.map((input, i) => round(i, input));
  return {
    game: {} as Game,
    players,
    config: {},
    roundIndex: rounds.length,
    totals: {} as Record<ID, number>,
    rounds,
  };
}

const allIds = seats.map((p) => p.id);
const validId = (id: ID) => allIds.includes(id);

// ---- eventOf ---------------------------------------------------------------

describe('eventOf', () => {
  it('normalizes a missing or junk input into a well-formed Liberal policy', () => {
    expect(eventOf(undefined)).toEqual({
      event: 'liberal',
      hitlerKilled: false,
      target: null,
      winners: [],
    });
    expect(eventOf({})).toEqual({
      event: 'liberal',
      hitlerKilled: false,
      target: null,
      winners: [],
    });
  });

  it('coerces a non-array winners field to an empty team', () => {
    expect(eventOf({ event: 'fascist', winners: 'nope' }).winners).toEqual([]);
  });

  it('preserves a fully recorded event', () => {
    const input = ev('execution', { hitlerKilled: true, target: 'c', winners: ['a', 'b'] });
    expect(eventOf(input)).toEqual(input);
  });
});

// ---- computeState ----------------------------------------------------------

describe('computeState', () => {
  it('starts empty and undecided', () => {
    expect(computeState([])).toEqual(emptyState());
  });

  it('counts policies onto their own track', () => {
    const s = computeState([ev('liberal'), ev('fascist'), ev('liberal')]);
    expect(s).toMatchObject({ liberal: 2, fascist: 1, winner: null });
  });

  it('advances the election tracker on a failed government', () => {
    expect(computeState(times(2, 'electionFailed')).tracker).toBe(2);
  });

  it('clamps the election tracker at its maximum', () => {
    expect(computeState(times(9, 'electionFailed')).tracker).toBe(TRACKER_MAX);
  });

  it('resets the election tracker whenever a policy is enacted', () => {
    expect(computeState([ev('electionFailed'), ev('electionFailed'), ev('liberal')]).tracker).toBe(
      0,
    );
    expect(computeState([ev('electionFailed'), ev('fascist')]).tracker).toBe(0);
  });

  it('records which event decided the game', () => {
    const s = computeState(times(LIBERAL_TARGET, 'liberal'));
    expect(s.decidedAt).toBe(LIBERAL_TARGET - 1);
  });

  it('ignores everything recorded after the game is decided', () => {
    const s = computeState([...times(LIBERAL_TARGET, 'liberal'), ...times(3, 'fascist')]);
    expect(s).toMatchObject({ liberal: LIBERAL_TARGET, fascist: 0, winner: 'liberal' });
  });
});

// ---- win conditions --------------------------------------------------------

describe('win conditions', () => {
  it('Liberals win on the fifth Liberal policy — not the fourth', () => {
    expect(computeState(times(LIBERAL_TARGET - 1, 'liberal')).winner).toBeNull();
    const s = computeState(times(LIBERAL_TARGET, 'liberal'));
    expect(s.winner).toBe('liberal');
    expect(s.winReason).toBe('Five Liberal policies enacted');
  });

  it('Fascists win on the sixth Fascist policy — not the fifth', () => {
    expect(computeState(times(FASCIST_TARGET - 1, 'fascist')).winner).toBeNull();
    const s = computeState(times(FASCIST_TARGET, 'fascist'));
    expect(s.winner).toBe('fascist');
    expect(s.winReason).toBe('Six Fascist policies enacted');
  });

  it('Liberals win the moment Hitler is assassinated', () => {
    const s = computeState([
      ...times(KILL_POWER_MIN, 'fascist'),
      ev('execution', { hitlerKilled: true, target: 'c' }),
    ]);
    expect(s.winner).toBe('liberal');
    expect(s.winReason).toBe('Hitler was assassinated');
  });

  it('an execution that misses Hitler decides nothing', () => {
    const s = computeState([...times(KILL_POWER_MIN, 'fascist'), ev('execution', { target: 'c' })]);
    expect(s.winner).toBeNull();
    expect(s.fascist).toBe(KILL_POWER_MIN);
  });

  it('Hitler as Chancellor wins only once three Fascist policies are enacted', () => {
    const tooEarly = computeState([
      ...times(HITLER_CHANCELLOR_MIN - 1, 'fascist'),
      ev('hitlerChancellor'),
    ]);
    expect(tooEarly.winner).toBeNull();

    const s = computeState([...times(HITLER_CHANCELLOR_MIN, 'fascist'), ev('hitlerChancellor')]);
    expect(s.winner).toBe('fascist');
    expect(s.winReason).toBe('Hitler was elected Chancellor');
  });
});

// ---- previewAfter ----------------------------------------------------------

describe('previewAfter', () => {
  it('does not mutate the state it previews from', () => {
    const before = computeState(times(2, 'fascist'));
    const after = previewAfter(before, ev('fascist'));
    expect(before.fascist).toBe(2);
    expect(after.fascist).toBe(3);
  });

  it('shows the clinch one policy ahead of time', () => {
    const before = computeState(times(LIBERAL_TARGET - 1, 'liberal'));
    expect(before.winner).toBeNull();
    expect(previewAfter(before, ev('liberal')).winner).toBe('liberal');
  });
});

// ---- setup tables ----------------------------------------------------------

describe('roleSetup', () => {
  it('matches the official role split for every supported player count', () => {
    const expected: Record<number, [number, number]> = {
      5: [3, 1],
      6: [4, 1],
      7: [4, 2],
      8: [5, 2],
      9: [5, 3],
      10: [6, 3],
    };
    for (const [count, [liberals, fascists]] of Object.entries(expected)) {
      const r = roleSetup(Number(count));
      expect([r.liberals, r.fascists], `setup for ${count} players`).toEqual([liberals, fascists]);
      // Liberals + Fascists + Hitler always seats the whole table.
      expect(r.liberalTeam + r.fascistTeam).toBe(Number(count));
    }
  });

  it('only tells Hitler who the Fascists are in 5–6 player games', () => {
    expect(roleSetup(5).hitlerKnowsFascists).toBe(true);
    expect(roleSetup(6).hitlerKnowsFascists).toBe(true);
    expect(roleSetup(7).hitlerKnowsFascists).toBe(false);
  });
});

describe('teamSize', () => {
  it('counts Hitler on the Fascist team', () => {
    expect(teamSize(7, 'liberal')).toBe(4);
    expect(teamSize(7, 'fascist')).toBe(3);
  });
});

describe('powerAt / powerColumn', () => {
  it('places the execution power on the 4th and 5th Fascist policies at every count', () => {
    for (const count of [5, 6, 7, 8, 9, 10]) {
      expect(powerAt(count, 4)?.key, `${count} players`).toBe('execution');
      expect(powerAt(count, 5)?.key, `${count} players`).toBe('execution');
    }
  });

  it('matches the small-table board (5–6 players)', () => {
    expect(powerColumn(5).map((p) => p?.key ?? null)).toEqual([
      null,
      null,
      'peek',
      'execution',
      'execution',
    ]);
  });

  it('matches the mid-table board (7–8 players)', () => {
    expect(powerColumn(8).map((p) => p?.key ?? null)).toEqual([
      null,
      'investigate',
      'special',
      'execution',
      'execution',
    ]);
  });

  it('matches the large-table board (9–10 players)', () => {
    expect(powerColumn(10).map((p) => p?.key ?? null)).toEqual([
      'investigate',
      'investigate',
      'special',
      'execution',
      'execution',
    ]);
  });
});

// ---- validate --------------------------------------------------------------

describe('validate', () => {
  it('accepts an ordinary policy round', () => {
    expect(validate(emptyState(), ev('liberal'), 7, validId)).toBeNull();
  });

  it('refuses to record anything once the game is decided', () => {
    const before = computeState(times(LIBERAL_TARGET, 'liberal'));
    expect(validate(before, ev('liberal'), 7, validId)).toMatch(/already decided/i);
  });

  it('refuses a failed election once the tracker is full', () => {
    const before = computeState(times(TRACKER_MAX, 'electionFailed'));
    expect(validate(before, ev('electionFailed'), 7, validId)).toMatch(/force-enacted/i);
  });

  it('refuses an execution before the power unlocks', () => {
    const before = computeState(times(KILL_POWER_MIN - 1, 'fascist'));
    expect(validate(before, ev('execution'), 7, validId)).toMatch(/4th Fascist policy/i);
  });

  it('allows an execution once the 4th Fascist policy is enacted', () => {
    const before = computeState(times(KILL_POWER_MIN, 'fascist'));
    expect(validate(before, ev('execution', { target: 'c' }), 7, validId)).toBeNull();
  });

  it('refuses a Hitler chancellorship before three Fascist policies', () => {
    const before = computeState(times(HITLER_CHANCELLOR_MIN - 1, 'fascist'));
    expect(validate(before, ev('hitlerChancellor'), 7, validId)).toMatch(/3 Fascist policies/i);
  });

  it('demands the whole winning team on the deciding round', () => {
    const before = computeState(times(LIBERAL_TARGET - 1, 'liberal'));
    expect(validate(before, ev('liberal'), 7, validId)).toMatch(/Tap the 4 Liberal team members/i);
    expect(validate(before, ev('liberal', { winners: ['a', 'b'] }), 7, validId)).toMatch(
      /Tap the 4/i,
    );
    expect(
      validate(before, ev('liberal', { winners: ['a', 'b', 'c', 'd'] }), 7, validId),
    ).toBeNull();
  });

  it('does not count winners who are not seated in this game', () => {
    const before = computeState(times(FASCIST_TARGET - 1, 'fascist'));
    const bogus = ev('fascist', { winners: ['a', 'b', 'zzz'] });
    expect(validate(before, bogus, 7, validId)).toMatch(/Tap the 3 Fascist team members/i);
  });

  it('sizes the demanded team to the table', () => {
    const before = computeState(times(FASCIST_TARGET - 1, 'fascist'));
    expect(validate(before, ev('fascist'), 5, validId)).toMatch(/Tap the 2 Fascist team members/i);
    expect(validate(before, ev('fascist'), 10, validId)).toMatch(/Tap the 4 Fascist team members/i);
  });
});

// ---- module scoring --------------------------------------------------------

describe('secrethitler module', () => {
  it('is a scoreless tracker until a game is clinched', () => {
    const out = secrethitler.scoreRound(ev('liberal'), ctx(times(2, 'liberal')));
    expect(out).toEqual({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0 });
  });

  it('awards one victory point to each recorded winner on the deciding round', () => {
    const prior = times(LIBERAL_TARGET - 1, 'liberal');
    const input = ev('liberal', { winners: ['a', 'b', 'c', 'd'] });
    const out = secrethitler.scoreRound(input, ctx(prior));
    expect(out).toEqual({ a: 1, b: 1, c: 1, d: 1, e: 0, f: 0, g: 0 });
  });

  it('awards nothing for a game that was already decided', () => {
    const prior = times(LIBERAL_TARGET, 'liberal');
    const input = ev('fascist', { winners: ['e', 'f', 'g'] });
    expect(secrethitler.scoreRound(input, ctx(prior))).toEqual({
      a: 0,
      b: 0,
      c: 0,
      d: 0,
      e: 0,
      f: 0,
      g: 0,
    });
  });

  it('ignores recorded winners who are not seated', () => {
    const prior = times(FASCIST_TARGET - 1, 'fascist');
    const input = ev('fascist', { winners: ['a', 'b', 'c', 'zzz'] });
    const out = secrethitler.scoreRound(input, ctx(prior));
    expect(out.a).toBe(1);
    expect(out).not.toHaveProperty('zzz');
  });

  it('scores an assassination as a Liberal victory', () => {
    const prior = times(KILL_POWER_MIN, 'fascist');
    const input = ev('execution', {
      hitlerKilled: true,
      target: 'g',
      winners: ['a', 'b', 'c', 'd'],
    });
    const out = secrethitler.scoreRound(input, ctx(prior));
    expect(Object.values(out).filter(Boolean)).toHaveLength(4);
  });

  it('reports the game finished only once a victory is recorded', () => {
    const info = { config: {}, roundCount: 3, playerCount: 7 };
    expect(secrethitler.isFinished?.({ a: 0, b: 0, c: 0 }, info)).toBe(false);
    expect(secrethitler.isFinished?.({ a: 1, b: 0, c: 0 }, info)).toBe(true);
  });

  it('picks exactly the winning team from the totals', () => {
    expect(secrethitler.pickWinners?.({ a: 0, b: 0, c: 0 }, {})).toEqual([]);
    expect(secrethitler.pickWinners?.({ a: 1, b: 0, c: 1, d: 0 }, {})?.sort()).toEqual(['a', 'c']);
  });

  it('lines scoreRound and pickWinners up end to end', () => {
    const prior = times(HITLER_CHANCELLOR_MIN, 'fascist');
    const input = ev('hitlerChancellor', { winners: ['e', 'f', 'g'] });
    const totals = secrethitler.scoreRound(input, ctx(prior));
    expect(secrethitler.pickWinners?.(totals, {})?.sort()).toEqual(['e', 'f', 'g']);
  });

  it('validates a drafted round through the module', () => {
    expect(secrethitler.validateRound(ev('execution'), ctx([]))).toMatch(/4th Fascist policy/i);
    expect(secrethitler.validateRound(ev('liberal'), ctx([]))).toBeNull();
  });

  it('creates a fresh, empty round input', () => {
    expect(secrethitler.createRoundInput(ctx([]))).toEqual({
      event: 'liberal',
      hitlerKilled: false,
      target: null,
      winners: [],
    });
  });

  it('seats a legal Secret Hitler table', () => {
    expect(secrethitler.minPlayers).toBe(5);
    expect(secrethitler.maxPlayers).toBe(10);
    expect(secrethitler.teams).toBe(true);
  });

  it('exposes a lazily loaded round editor', () => {
    expect(secrethitler.RoundEditor).toBeTruthy();
    expect(typeof secrethitler.editorLoader).toBe('function');
  });
});

// ---- describeRound ---------------------------------------------------------

describe('describeRound', () => {
  const describe1 = (input: SecretHitlerInput) =>
    secrethitler.describeRound?.(round(0, input), seats) ?? '';

  it('summarizes an ordinary policy', () => {
    expect(describe1(ev('liberal'))).toBe('📘 Liberal policy enacted');
    expect(describe1(ev('fascist'))).toBe('📕 Fascist policy enacted');
  });

  it('flags the policy that won the game', () => {
    expect(describe1(ev('liberal', { winners: ['a'] }))).toMatch(/Liberals win/);
    expect(describe1(ev('fascist', { winners: ['a'] }))).toMatch(/Fascists win/);
  });

  it('summarizes a failed election', () => {
    expect(describe1(ev('electionFailed'))).toMatch(/election tracker \+1/);
  });

  it('names the executed player, and calls out a dead Hitler', () => {
    expect(describe1(ev('execution', { target: 'c' }))).toBe('🔫 c executed');
    expect(describe1(ev('execution', { target: 'c', hitlerKilled: true }))).toMatch(
      /it was Hitler! Liberals win/,
    );
  });

  it('falls back gracefully when no target was recorded', () => {
    expect(describe1(ev('execution'))).toBe('🔫 Player executed');
  });

  it('summarizes Hitler taking the Chancellery', () => {
    expect(describe1(ev('hitlerChancellor'))).toMatch(/Fascists win/);
  });
});
