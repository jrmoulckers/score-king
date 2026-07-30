import { describe, it, expect } from 'vitest';
import type { Player } from '../../types';
import { hearts } from './index';
import {
  HEARTS_TOTAL,
  baseDelta,
  emptyInput,
  endgameInfo,
  heartsRemaining,
  heartsTotal,
  isFinished,
  outcomeFor,
  passCycle,
  passingFor,
  previewDelta,
  readConfig,
  scoreRound,
  shooter,
  validateRound,
  type HeartsInput,
} from './logic';

// ── helpers ────────────────────────────────────────────────────────────────
function player(id: string): Player {
  return { id, name: id.toUpperCase(), color: '#7c5cff', createdAt: 0 };
}
const P4 = ['a', 'b', 'c', 'd'].map(player);
const IDS = P4.map((p) => p.id);

function input(
  hearts: Record<string, number>,
  queen: string | null = null,
  jack: string | null = null,
): HeartsInput {
  return { hearts, queen, jack };
}

// ── config ───────────────────────────────────────────────────────────────
describe('readConfig', () => {
  it('applies defaults', () => {
    expect(readConfig({})).toEqual({
      endScore: 100,
      variantJack: false,
      moonRule: 'add26',
      passing: true,
    });
  });
  it('reads overrides and clamps moonRule to a known value', () => {
    expect(readConfig({ endScore: 50, variantJack: true, moonRule: 'subtract' })).toEqual({
      endScore: 50,
      variantJack: true,
      moonRule: 'subtract',
      passing: true,
    });
    expect(readConfig({ moonRule: 'nonsense' }).moonRule).toBe('add26');
  });
  it('treats passing as on unless explicitly disabled', () => {
    expect(readConfig({}).passing).toBe(true);
    expect(readConfig({ passing: true }).passing).toBe(true);
    expect(readConfig({ passing: false }).passing).toBe(false);
  });
});

// ── passing ritual ─────────────────────────────────────────────────────────
describe('passing', () => {
  it('rotates left → right → across → hold for a four-handed table', () => {
    expect(passCycle(4)).toEqual(['left', 'right', 'across', 'hold']);
    expect(passingFor(0, 4).direction).toBe('left');
    expect(passingFor(1, 4).direction).toBe('right');
    expect(passingFor(2, 4).direction).toBe('across');
    expect(passingFor(3, 4).direction).toBe('hold');
    expect(passingFor(4, 4).direction).toBe('left'); // wraps every 4 hands
  });
  it('drops "across" when the table is not four-handed', () => {
    expect(passCycle(3)).toEqual(['left', 'right', 'hold']);
    expect(passCycle(5)).toEqual(['left', 'right', 'hold']);
    expect(passingFor(2, 3).direction).toBe('hold');
    expect(passingFor(3, 3).direction).toBe('left'); // wraps every 3 hands
    expect(passingFor(0, 6).direction).toBe('left');
  });
  it('carries a glyph, label and a 3-card hint that co-signal the direction', () => {
    const left = passingFor(0, 4);
    expect(left.glyph).toBeTruthy();
    expect(left.label).toMatch(/left/i);
    expect(left.hint).toMatch(/3 cards/i);
    expect(passingFor(3, 4).label).toMatch(/hold/i);
  });
});

// ── heart bookkeeping ──────────────────────────────────────────────────────
describe('heart tallies', () => {
  it('emptyInput seeds every player at zero hearts', () => {
    expect(emptyInput(IDS)).toEqual({
      hearts: { a: 0, b: 0, c: 0, d: 0 },
      queen: null,
      jack: null,
    });
  });
  it('totals and remaining hearts', () => {
    const i = input({ a: 5, b: 3, c: 0, d: 1 });
    expect(heartsTotal(i)).toBe(9);
    expect(heartsRemaining(i)).toBe(4);
  });
  it('remaining never goes negative', () => {
    expect(heartsRemaining(input({ a: 20 }))).toBe(0);
  });
});

// ── validation ─────────────────────────────────────────────────────────────
describe('validateRound', () => {
  it('nudges toward 13 when hearts are short', () => {
    const msg = validateRound(input({ a: 5, b: 3, c: 0, d: 0 }, 'a'), P4, {});
    expect(msg).toMatch(/5 more hearts/);
  });
  it('flags too many hearts', () => {
    const msg = validateRound(input({ a: 10, b: 5, c: 0, d: 0 }, 'a'), P4, {});
    expect(msg).toMatch(/2 too many/);
  });
  it('frames the shortfall against the 26-point hand', () => {
    const msg = validateRound(input({ a: 5, b: 3, c: 0, d: 0 }, 'a'), P4, {});
    expect(msg).toMatch(/Must total 26/);
  });
  it('requires the Queen to be assigned', () => {
    const msg = validateRound(input({ a: 13, b: 0, c: 0, d: 0 }, null), P4, {});
    expect(msg).toMatch(/Queen of Spades/);
  });
  it('requires the Jack under the Omnibus variant', () => {
    const i = input({ a: 13, b: 0, c: 0, d: 0 }, 'a', null);
    expect(validateRound(i, P4, { variantJack: true })).toMatch(/Jack of Diamonds/);
    expect(validateRound(i, P4, { variantJack: false })).toBeNull();
  });
  it('passes a well-formed round', () => {
    expect(validateRound(input({ a: 4, b: 4, c: 4, d: 1 }, 'd'), P4, {})).toBeNull();
  });
});

// ── scoring ──────────────────────────────────────────────────────────────
describe('scoreRound', () => {
  it('adds hearts and the Queen (+13)', () => {
    const out = scoreRound(input({ a: 4, b: 4, c: 4, d: 1 }, 'd'), IDS, {});
    expect(out).toEqual({ a: 4, b: 4, c: 4, d: 14 });
    // 26 points distributed in all.
    expect(Object.values(out).reduce((x, y) => x + y, 0)).toBe(26);
  });

  it('applies the Omnibus Jack (−10) only when enabled', () => {
    const i = input({ a: 4, b: 4, c: 4, d: 1 }, 'd', 'a');
    expect(scoreRound(i, IDS, { variantJack: true })).toEqual({ a: -6, b: 4, c: 4, d: 14 });
    // Ignored when the variant is off.
    expect(scoreRound(i, IDS, { variantJack: false })).toEqual({ a: 4, b: 4, c: 4, d: 14 });
  });

  it('12 hearts + the Queen is NOT a moon', () => {
    const i = input({ a: 12, b: 1, c: 0, d: 0 }, 'a');
    expect(shooter(i)).toBeNull();
    expect(scoreRound(i, IDS, {})).toEqual({ a: 25, b: 1, c: 0, d: 0 });
  });

  it('shoots the moon: everyone else +26 (add26)', () => {
    const i = input({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    expect(shooter(i)).toBe('a');
    expect(scoreRound(i, IDS, { moonRule: 'add26' })).toEqual({ a: 0, b: 26, c: 26, d: 26 });
  });

  it('shoots the moon: shooter −26 (subtract)', () => {
    const i = input({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    expect(scoreRound(i, IDS, { moonRule: 'subtract' })).toEqual({ a: -26, b: 0, c: 0, d: 0 });
  });

  it('a moon ignores the Jack for the shooter under add26', () => {
    const i = input({ a: 13, b: 0, c: 0, d: 0 }, 'a', 'a');
    expect(scoreRound(i, IDS, { moonRule: 'add26', variantJack: true })).toEqual({
      a: 0,
      b: 26,
      c: 26,
      d: 26,
    });
  });

  it("a per-round moon pick overrides the game's default rule", () => {
    const base = input({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    // Round says "shooter −26" even though the game default is add26.
    expect(scoreRound({ ...base, moonRule: 'subtract' }, IDS, { moonRule: 'add26' })).toEqual({
      a: -26,
      b: 0,
      c: 0,
      d: 0,
    });
    // …and the reverse: round says add26 over a subtract default.
    expect(scoreRound({ ...base, moonRule: 'add26' }, IDS, { moonRule: 'subtract' })).toEqual({
      a: 0,
      b: 26,
      c: 26,
      d: 26,
    });
  });
});

// ── previews & outcomes ────────────────────────────────────────────────────
describe('previews', () => {
  it('baseDelta ignores the moon reversal; previewDelta honors it', () => {
    const i = input({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    expect(baseDelta(i, 'a', readConfig({}))).toBe(26);
    expect(previewDelta(i, 'a', IDS, {})).toBe(0);
    expect(previewDelta(i, 'b', IDS, {})).toBe(26);
  });

  it('outcomeFor classifies clean, lady, moon and mooned', () => {
    const clean = input({ a: 0, b: 5, c: 7, d: 1 }, 'd');
    expect(outcomeFor(clean, 'a', IDS, {}).kind).toBe('clean');
    expect(outcomeFor(clean, 'd', IDS, {}).kind).toBe('lady');

    const moon = input({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    expect(outcomeFor(moon, 'a', IDS, {}).kind).toBe('moon');
    expect(outcomeFor(moon, 'b', IDS, {}).kind).toBe('points');
  });
});

// ── end condition ──────────────────────────────────────────────────────────
describe('isFinished', () => {
  it('ends when a player reaches the end score', () => {
    expect(isFinished({ a: 100, b: 40 }, {})).toBe(true);
    expect(isFinished({ a: 99, b: 40 }, {})).toBe(false);
    expect(isFinished({ a: 55, b: 40 }, { endScore: 50 })).toBe(true);
  });
});

// ── endgame tension ──────────────────────────────────────────────────────────
describe('endgameInfo', () => {
  it('is quiet at the start (nobody near the finish)', () => {
    const e = endgameInfo({ a: 0, b: 0, c: 0, d: 0 }, IDS, {});
    expect(e).toMatchObject({ end: 100, atRiskTotal: 0, toEnd: 100, imminent: false, reached: false });
  });
  it('flags the highest total as the seat racing to end it', () => {
    const e = endgameInfo({ a: 40, b: 62, c: 10, d: 0 }, IDS, {});
    expect(e.atRiskId).toBe('b');
    expect(e.atRiskTotal).toBe(62);
    expect(e.toEnd).toBe(38);
    expect(e.imminent).toBe(false); // 38 is more than one hand away
  });
  it('turns imminent once a single hand (≤26) could finish it', () => {
    expect(endgameInfo({ a: 80, b: 20 }, ['a', 'b'], {}).imminent).toBe(true);
    expect(endgameInfo({ a: 74, b: 20 }, ['a', 'b'], {}).imminent).toBe(true); // exactly 26 to go
    expect(endgameInfo({ a: 73, b: 20 }, ['a', 'b'], {}).imminent).toBe(false); // 27 to go
  });
  it('reports reached (not imminent) when a seat is already at the end', () => {
    const e = endgameInfo({ a: 100, b: 20 }, ['a', 'b'], {});
    expect(e).toMatchObject({ toEnd: 0, reached: true, imminent: false });
  });
  it('honors a custom end score and ignores negative totals for the risk seat', () => {
    expect(endgameInfo({ a: 45, b: 10 }, ['a', 'b'], { endScore: 50 }).toEnd).toBe(5);
    const e = endgameInfo({ a: -26, b: 5 }, ['a', 'b'], {});
    expect(e.atRiskId).toBe('b');
    expect(e.atRiskTotal).toBe(5);
  });
});

// ── module wiring ──────────────────────────────────────────────────────────
describe('hearts module', () => {
  it('delegates validate/score/finish to the shared logic', () => {
    const ctx = {
      game: {} as never,
      players: P4,
      config: {},
      roundIndex: 0,
      totals: {},
      rounds: [],
    };
    const i = input({ a: 13, b: 0, c: 0, d: 0 }, 'a');
    expect(hearts.validateRound(i, ctx)).toBeNull();
    expect(hearts.scoreRound(i, ctx)).toEqual({ a: 0, b: 26, c: 26, d: 26 });
    expect(hearts.isFinished!({ a: 100 }, { config: {}, roundCount: 3, playerCount: 4 })).toBe(true);
  });

  it('createRoundInput seeds every seat', () => {
    const ctx = {
      game: {} as never,
      players: P4,
      config: {},
      roundIndex: 0,
      totals: {},
      rounds: [],
    };
    expect(hearts.createRoundInput(ctx)).toEqual(emptyInput(IDS));
    expect(HEARTS_TOTAL).toBe(13);
  });

  it('describeRound summarizes a moon, a crashed moon, and an ordinary round', () => {
    const moon = { input: input({ a: 13, b: 0, c: 0, d: 0 }, 'a') } as never;
    expect(hearts.describeRound!(moon, P4)).toMatch(/shot the moon/);
    // Took the Queen and 12 of 13 hearts = 25 points: a moon missed by one card.
    const crashed = { input: input({ a: 12, b: 1, c: 0, d: 0 }, 'a') } as never;
    expect(hearts.describeRound!(crashed, P4)).toMatch(/☄️ A crashed a moon — 25/);
    const ordinary = { input: input({ a: 4, b: 4, c: 4, d: 1 }, 'd', 'a') } as never;
    expect(hearts.describeRound!(ordinary, P4)).toMatch(/💔 D \+14 · ♦J A/);
  });

  it('roundCellTone marks the Queen-taker, but not a moon shooter', () => {
    const ordinary = { input: input({ a: 4, b: 4, c: 4, d: 1 }, 'a') } as never;
    expect(hearts.roundCellTone!(ordinary, 'a')).toMatchObject({ tone: 'bad' });
    expect(hearts.roundCellTone!(ordinary, 'b')).toBeNull();
    // A moon flips scoring, so the Queen-taker (the shooter) isn't flagged.
    const moon = { input: input({ a: 13, b: 0, c: 0, d: 0 }, 'a') } as never;
    expect(hearts.roundCellTone!(moon, 'a')).toBeNull();
  });
});
