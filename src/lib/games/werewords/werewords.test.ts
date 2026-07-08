import { describe, expect, it } from 'vitest';
import {
  describeWerewords,
  resolveOutcome,
  scoreWerewords,
  teamOf,
  validateWerewords,
  type WerewordsInput,
} from './logic';

/** A valid baseline round: word set, one wolf (C) among four players, guessed, no twist. */
function base(overrides: Partial<WerewordsInput> = {}): WerewordsInput {
  return {
    word: 'PYRAMID',
    mayor: 'A',
    seer: 'B',
    werewolves: ['C'],
    guessed: true,
    werewolfFoundSeer: false,
    mayorFoundWerewolf: false,
    ...overrides,
  };
}

const FOUR = ['A', 'B', 'C', 'D'];

describe('resolveOutcome — the four ways a round lands', () => {
  it('guessed in time → Villagers win (no twist)', () => {
    const o = resolveOutcome(base({ guessed: true }));
    expect(o.team).toBe('village');
    expect(o.twist).toBe(false);
  });

  it('guessed, but a werewolf names the Seer → Werewolves steal it (twist)', () => {
    const o = resolveOutcome(base({ guessed: true, werewolfFoundSeer: true }));
    expect(o.team).toBe('werewolf');
    expect(o.twist).toBe(true);
  });

  it('never guessed → Werewolves win (no twist)', () => {
    const o = resolveOutcome(base({ guessed: false }));
    expect(o.team).toBe('werewolf');
    expect(o.twist).toBe(false);
  });

  it('never guessed, but the Mayor names a werewolf → Villagers steal it back (twist)', () => {
    const o = resolveOutcome(base({ guessed: false, mayorFoundWerewolf: true }));
    expect(o.team).toBe('village');
    expect(o.twist).toBe(true);
  });

  it('ignores the mayor twist while the word was guessed', () => {
    // mayorFoundWerewolf only matters when the word was NOT guessed.
    const o = resolveOutcome(base({ guessed: true, mayorFoundWerewolf: true }));
    expect(o.team).toBe('village');
    expect(o.twist).toBe(false);
  });

  it('ignores the seer twist while the word was missed', () => {
    // werewolfFoundSeer only matters when the word WAS guessed.
    const o = resolveOutcome(base({ guessed: false, werewolfFoundSeer: true }));
    expect(o.team).toBe('werewolf');
    expect(o.twist).toBe(false);
  });
});

describe('teamOf — everyone not tapped as a wolf is Village', () => {
  it('classifies wolves and villagers', () => {
    const input = base({ werewolves: ['C', 'D'] });
    expect(teamOf(input, 'C')).toBe('werewolf');
    expect(teamOf(input, 'D')).toBe('werewolf');
    expect(teamOf(input, 'A')).toBe('village');
    expect(teamOf(input, 'B')).toBe('village');
  });
});

describe('scoreWerewords — winning side each banks a point', () => {
  it('Villager win: everyone except the wolf scores 1', () => {
    const deltas = scoreWerewords(base({ guessed: true }), FOUR);
    expect(deltas).toEqual({ A: 1, B: 1, C: 0, D: 1 });
  });

  it('Werewolf win: only the wolves score 1', () => {
    const deltas = scoreWerewords(base({ guessed: false }), FOUR);
    expect(deltas).toEqual({ A: 0, B: 0, C: 1, D: 0 });
  });

  it('two wolves both score on a werewolf win', () => {
    const input = base({ guessed: false, werewolves: ['C', 'D'] });
    expect(scoreWerewords(input, FOUR)).toEqual({ A: 0, B: 0, C: 1, D: 1 });
  });

  it('the seer twist flips who banks the point', () => {
    const input = base({ guessed: true, werewolfFoundSeer: true });
    expect(scoreWerewords(input, FOUR)).toEqual({ A: 0, B: 0, C: 1, D: 0 });
  });

  it('the mayor twist flips a missed word into a Village sweep', () => {
    const input = base({ guessed: false, mayorFoundWerewolf: true });
    expect(scoreWerewords(input, FOUR)).toEqual({ A: 1, B: 1, C: 0, D: 1 });
  });

  it('every player is scored exactly once per round (0 or 1)', () => {
    const deltas = scoreWerewords(base(), FOUR);
    const values = Object.values(deltas);
    expect(values).toHaveLength(FOUR.length);
    expect(values.every((v) => v === 0 || v === 1)).toBe(true);
  });
});

describe('validateWerewords', () => {
  it('accepts a well-formed round', () => {
    expect(validateWerewords(base(), FOUR)).toBeNull();
  });

  it('requires a word', () => {
    expect(validateWerewords(base({ word: '   ' }), FOUR)).toMatch(/word/i);
  });

  it('requires at least one werewolf', () => {
    expect(validateWerewords(base({ werewolves: [] }), FOUR)).toMatch(/werewolf/i);
  });

  it('leaves at least one villager standing', () => {
    const allWolves = base({ werewolves: ['A', 'B', 'C', 'D'], mayor: null, seer: null });
    expect(validateWerewords(allWolves, FOUR)).toMatch(/villager/i);
  });

  it('rejects a Mayor who is also a werewolf', () => {
    expect(validateWerewords(base({ mayor: 'C' }), FOUR)).toMatch(/Mayor/i);
  });

  it('rejects a Seer who is also a werewolf', () => {
    expect(validateWerewords(base({ seer: 'C' }), FOUR)).toMatch(/Seer/i);
  });

  it('rejects the same player as both Mayor and Seer', () => {
    expect(validateWerewords(base({ mayor: 'A', seer: 'A' }), FOUR)).toMatch(/different/i);
  });

  it('ignores stale wolf ids that are not in the roster', () => {
    // A wolf id for a player who left the table shouldn't count toward the roster limits.
    const input = base({ werewolves: ['C', 'ghost'] });
    expect(validateWerewords(input, FOUR)).toBeNull();
  });
});

describe('describeWerewords — narrates the word + outcome', () => {
  it('mentions the winning side and the upper-cased word', () => {
    const s = describeWerewords(base({ word: 'pyramid', guessed: true }));
    expect(s).toContain('Villagers');
    expect(s).toContain('PYRAMID');
  });

  it('calls out a werewolf victory when the clock runs out', () => {
    const s = describeWerewords(base({ guessed: false }));
    expect(s).toContain('Werewolves');
  });

  it('handles a blank word gracefully', () => {
    const s = describeWerewords(base({ word: '' }));
    expect(s).toContain('the word');
  });
});
