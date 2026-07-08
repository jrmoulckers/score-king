import { describe, expect, it } from 'vitest';
import type { ID, Player, Round, RoundContext } from '../../types';
import { computeTotals } from '../../scoring';
import { fluff } from './index';
import {
  DEFAULT_START_DICE,
  describeRound,
  diceInPlay,
  diceLost,
  diceRemaining,
  isAlive,
  isFinished,
  pickWinners,
  scoreRound,
  startDice,
  survivors,
  validateRound,
  type FluffInput,
  type FluffResult,
} from './logic';

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave'];

function mkPlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: NAMES[i] ?? `P${i + 1}`,
    color: '#7c5cff',
    createdAt: 0,
  }));
}

function ctx(
  players: Player[],
  totals: Record<ID, number>,
  config: Record<string, unknown> = {},
): RoundContext {
  return {
    game: {} as never,
    players,
    config,
    roundIndex: 0,
    totals,
    rounds: [],
  };
}

function input(playerId: ID | null, result: FluffResult = 'lose'): FluffInput {
  return { playerId, result };
}

/** Simulate a sequence of challenges, returning the running rounds + totals (dice lost). */
function play(
  players: Player[],
  steps: FluffInput[],
  config: Record<string, unknown> = {},
): { rounds: Round[]; totals: Record<ID, number> } {
  const ids = players.map((p) => p.id);
  const rounds: Round[] = [];
  let totals = computeTotals(rounds, ids);
  for (const step of steps) {
    const deltas = scoreRound(step, ctx(players, totals, config));
    rounds.push({ input: step, deltas } as Round);
    totals = computeTotals(rounds, ids);
  }
  return { rounds, totals };
}

describe('fluff / config helpers', () => {
  it('defaults to 5 starting dice and clamps to 1–6', () => {
    expect(startDice({})).toBe(DEFAULT_START_DICE);
    expect(startDice({ startDice: 3 })).toBe(3);
    expect(startDice({ startDice: 0 })).toBe(5);
    expect(startDice({ startDice: 99 })).toBe(6);
    expect(startDice({ startDice: 'nope' })).toBe(5);
  });
});

describe('fluff / dice bookkeeping', () => {
  it('derives remaining and lost from cumulative totals', () => {
    const totals = { p1: 0, p2: 2, p3: 5 };
    expect(diceRemaining(totals, 'p1', 5)).toBe(5);
    expect(diceRemaining(totals, 'p2', 5)).toBe(3);
    expect(diceRemaining(totals, 'p3', 5)).toBe(0);
    expect(diceLost(totals, 'p2')).toBe(2);
    expect(isAlive(totals, 'p3', 5)).toBe(false);
    expect(isAlive(totals, 'p2', 5)).toBe(true);
  });

  it('clamps out-of-range totals defensively', () => {
    expect(diceRemaining({ p1: -3 }, 'p1', 5)).toBe(5);
    expect(diceRemaining({ p1: 8 }, 'p1', 5)).toBe(0);
    expect(diceLost({ p1: -3 }, 'p1')).toBe(0);
  });

  it('counts survivors and dice in play', () => {
    const totals = { p1: 4, p2: 0, p3: 5 }; // p1 has 1 die, p2 has 5, p3 is out
    expect(survivors(totals, ['p1', 'p2', 'p3'], 5)).toEqual(['p1', 'p2']);
    expect(diceInPlay(totals, ['p1', 'p2', 'p3'], 5)).toBe(6);
  });
});

describe('fluff / scoreRound', () => {
  it('docks one die from the challenge loser and no one else', () => {
    const players = mkPlayers(3);
    const deltas = scoreRound(input('p2', 'lose'), ctx(players, { p1: 0, p2: 0, p3: 0 }));
    expect(deltas).toEqual({ p1: 0, p2: 1, p3: 0 });
  });

  it('returns a die on a spot-on gain', () => {
    const players = mkPlayers(3);
    const deltas = scoreRound(input('p3', 'gain'), ctx(players, { p1: 0, p2: 0, p3: 2 }));
    expect(deltas).toEqual({ p1: 0, p2: 0, p3: -1 });
  });

  it('is a no-op when no player is selected', () => {
    const players = mkPlayers(2);
    expect(scoreRound(input(null), ctx(players, { p1: 0, p2: 0 }))).toEqual({ p1: 0, p2: 0 });
  });

  it('ignores an unknown player id', () => {
    const players = mkPlayers(2);
    expect(scoreRound(input('ghost'), ctx(players, { p1: 0, p2: 0 }))).toEqual({ p1: 0, p2: 0 });
  });
});

describe('fluff / validateRound', () => {
  const players = mkPlayers(3);

  it('requires a selected player', () => {
    expect(validateRound(input(null), ctx(players, { p1: 0, p2: 0, p3: 0 }))).toMatch(/Tap the player/);
  });

  it('rejects an unknown player', () => {
    expect(validateRound(input('ghost'), ctx(players, { p1: 0, p2: 0, p3: 0 }))).toMatch(/still in the game/);
  });

  it('rejects taking a die from an eliminated player', () => {
    const t = { p1: 0, p2: 0, p3: 5 };
    expect(validateRound(input('p3', 'lose'), ctx(players, t))).toMatch(/already out/);
  });

  it('accepts a normal loss', () => {
    expect(validateRound(input('p1', 'lose'), ctx(players, { p1: 1, p2: 0, p3: 0 }))).toBeNull();
  });

  it('refuses to eliminate the last player standing', () => {
    // p2 and p3 are out; p1 is the only one left.
    const t = { p1: 4, p2: 5, p3: 5 };
    expect(validateRound(input('p1', 'lose'), ctx(players, t))).toMatch(/Only one player left/);
  });

  it('blocks spot-on gains unless enabled', () => {
    const t = { p1: 2, p2: 0, p3: 0 };
    expect(validateRound(input('p1', 'gain'), ctx(players, t))).toMatch(/turned off/);
    expect(validateRound(input('p1', 'gain'), ctx(players, t, { spotOn: true }))).toBeNull();
  });

  it('will not let a player exceed their starting dice', () => {
    const t = { p1: 0, p2: 0, p3: 0 };
    expect(validateRound(input('p1', 'gain'), ctx(players, t, { spotOn: true }))).toMatch(/all 5 dice/);
  });

  it('cannot gain a die once eliminated', () => {
    const t = { p1: 5, p2: 0, p3: 0 };
    expect(validateRound(input('p1', 'gain'), ctx(players, t, { spotOn: true }))).toMatch(/already out/);
  });

  it('honours a custom starting-dice count', () => {
    const t = { p1: 2, p2: 0, p3: 0 };
    // With 3 starting dice, p1 has lost 2 → 1 left → gaining is fine.
    expect(validateRound(input('p1', 'gain'), ctx(players, t, { spotOn: true, startDice: 3 }))).toBeNull();
    // A third loss would take p1 to 0 (out), but that's a *lose*, still allowed here (others alive).
    expect(validateRound(input('p1', 'lose'), ctx(players, t, { startDice: 3 }))).toBeNull();
  });
});

describe('fluff / isFinished', () => {
  it('is not finished at kickoff (everyone full)', () => {
    expect(isFinished({ p1: 0, p2: 0, p3: 0 }, { config: {} })).toBe(false);
  });

  it('is not finished while two players hold dice', () => {
    expect(isFinished({ p1: 5, p2: 3, p3: 2 }, { config: {} })).toBe(false);
  });

  it('is finished when only one player has dice left', () => {
    expect(isFinished({ p1: 5, p2: 5, p3: 1 }, { config: {} })).toBe(true);
  });

  it('respects a custom starting-dice count', () => {
    // start=3: p1 lost 3 (out), p2 lost 3 (out), p3 alive → finished.
    expect(isFinished({ p1: 3, p2: 3, p3: 1 }, { config: { startDice: 3 } })).toBe(true);
    expect(isFinished({ p1: 3, p2: 2, p3: 1 }, { config: { startDice: 3 } })).toBe(false);
  });
});

describe('fluff / pickWinners', () => {
  it('crowns the last cup standing', () => {
    expect(pickWinners({ p1: 5, p2: 2, p3: 5 }, {})).toEqual(['p2']);
  });

  it('breaks a forced early finish toward the fewest dice lost', () => {
    // Two still alive; p3 has lost fewer → sole leader wins.
    expect(pickWinners({ p1: 5, p2: 3, p3: 1 }, {})).toEqual(['p3']);
  });

  it('can return a tie among equally-placed survivors', () => {
    expect(pickWinners({ p1: 2, p2: 2, p3: 5 }, {}).sort()).toEqual(['p1', 'p2']);
  });

  it('falls back to fewest lost if somehow everyone is out', () => {
    expect(pickWinners({ p1: 5, p2: 5, p3: 6 }, {})).toEqual(['p1', 'p2']);
  });
});

describe('fluff / describeRound', () => {
  const players = mkPlayers(2);
  it('summarises a loss and a gain', () => {
    expect(describeRound({ input: input('p1', 'lose') } as Round, players)).toBe('💀 Alice lost a die');
    expect(describeRound({ input: input('p2', 'gain') } as Round, players)).toBe('🎲 Bob won a die back');
  });
  it('handles an empty round', () => {
    expect(describeRound({ input: input(null) } as Round, players)).toBe('no change');
  });
});

describe('fluff / full game simulation', () => {
  it('tracks dice down to a single winner', () => {
    const players = mkPlayers(3); // p1 Alice, p2 Bob, p3 Carol — 5 dice each
    // Knock Carol all the way out (5 losses), then whittle Bob to zero (5 losses).
    const steps: FluffInput[] = [
      ...Array(5).fill(input('p3', 'lose')),
      ...Array(5).fill(input('p2', 'lose')),
    ];
    const { totals } = play(players, steps);
    expect(diceRemaining(totals, 'p1', 5)).toBe(5);
    expect(diceRemaining(totals, 'p2', 5)).toBe(0);
    expect(diceRemaining(totals, 'p3', 5)).toBe(0);
    expect(isFinished(totals, { config: {} })).toBe(true);
    expect(pickWinners(totals, {})).toEqual(['p1']);
  });

  it('lets a spot-on call claw a die back mid-game', () => {
    const players = mkPlayers(2);
    const cfg = { spotOn: true };
    const { totals } = play(
      players,
      [input('p1', 'lose'), input('p1', 'lose'), input('p1', 'gain')],
      cfg,
    );
    // Alice: 5 → 4 → 3 → 4
    expect(diceRemaining(totals, 'p1', 5)).toBe(4);
    expect(diceRemaining(totals, 'p2', 5)).toBe(5);
    expect(isFinished(totals, { config: cfg })).toBe(false);
  });

  it('stays correct when an earlier round is deleted and the rest re-indexed', () => {
    const players = mkPlayers(2);
    const { rounds } = play(players, [
      input('p1', 'lose'),
      input('p2', 'lose'),
      input('p1', 'lose'),
    ]);
    // Drop the first round (a p1 loss) and recompute — the ±1 deltas are position-free.
    const trimmed = rounds.slice(1);
    const totals = computeTotals(trimmed, ['p1', 'p2']);
    expect(diceLost(totals, 'p1')).toBe(1); // was 2, minus the deleted loss
    expect(diceLost(totals, 'p2')).toBe(1);
    expect(diceRemaining(totals, 'p1', 5)).toBe(4);
  });
});

describe('fluff / module wiring', () => {
  it('exposes the expected identity and bounds', () => {
    expect(fluff.id).toBe('fluff');
    expect(fluff.lowerIsBetter).toBe(true);
    expect(fluff.minPlayers).toBe(2);
    expect(fluff.maxPlayers).toBeGreaterThanOrEqual(fluff.minPlayers);
    expect(typeof fluff.help).toBe('string');
  });

  it('creates a blank round input', () => {
    const players = mkPlayers(2);
    expect(fluff.createRoundInput(ctx(players, { p1: 0, p2: 0 }))).toEqual({
      playerId: null,
      result: 'lose',
    });
  });

  it('wires isFinished / pickWinners through the module', () => {
    const totals = { p1: 5, p2: 1 };
    expect(fluff.isFinished!(totals, { config: {}, roundCount: 9, playerCount: 2 })).toBe(true);
    expect(fluff.pickWinners!(totals, {})).toEqual(['p2']);
  });
});
