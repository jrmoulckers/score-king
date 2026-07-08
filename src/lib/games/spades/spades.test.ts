import { describe, it, expect } from 'vitest';
import type { Player, Round, RoundContext } from '../../types';
import { spades } from './index';
import {
  bagCountsAfter,
  readConfig,
  resolveMode,
  scoreGame,
  scoreLatest,
  scoreUnitHand,
  tricksAvailable,
  unitsFor,
  validateHand,
  type NilKind,
  type SpadesConfig,
  type SpadesInput,
} from './logic';

// ── helpers ────────────────────────────────────────────────────────────────
function row(bid: number, tricks: number, nil: NilKind = 'none') {
  return { bid, tricks, nil };
}
function hand(rows: Record<string, ReturnType<typeof row>>): SpadesInput {
  return { rows };
}
function cfg(over: Partial<SpadesConfig> = {}): SpadesConfig {
  return { ...readConfig({}), ...over };
}
function player(id: string): Player {
  return { id, name: id.toUpperCase(), color: '#7c5cff', createdAt: 0 };
}
const P3 = ['a', 'b', 'c'].map(player);
const P4 = ['a', 'b', 'c', 'd'].map(player);

function totalsOf(outcomes: ReturnType<typeof scoreGame>): Record<string, number> {
  const t: Record<string, number> = {};
  for (const o of outcomes) for (const [id, d] of Object.entries(o.deltas)) t[id] = (t[id] ?? 0) + d;
  return t;
}

// ── config ───────────────────────────────────────────────────────────────
describe('readConfig', () => {
  it('applies defaults', () => {
    expect(readConfig({})).toEqual({
      mode: 'partners',
      target: 500,
      nil: true,
      blindNil: true,
      sandbagging: true,
      bagThreshold: 10,
    });
  });
  it('coerces and clamps', () => {
    expect(readConfig({ mode: 'solo', target: '250', nil: false, bagThreshold: 0 })).toMatchObject({
      mode: 'solo',
      target: 250,
      nil: false,
      bagThreshold: 1,
    });
  });
  it('treats unknown mode as partners', () => {
    expect(readConfig({ mode: 'nonsense' }).mode).toBe('partners');
  });
});

describe('tricksAvailable', () => {
  it('is 17 for three players, 13 otherwise', () => {
    expect(tricksAvailable(3)).toBe(17);
    expect(tricksAvailable(4)).toBe(13);
    expect(tricksAvailable(5)).toBe(13);
  });
});

describe('resolveMode', () => {
  it('needs exactly four seats for partnerships', () => {
    expect(resolveMode({ mode: 'partners' }, 4)).toBe('partners');
    expect(resolveMode({ mode: 'partners' }, 3)).toBe('solo');
    expect(resolveMode({ mode: 'solo' }, 4)).toBe('solo');
  });
});

describe('unitsFor', () => {
  it('pairs adjacent seats into two teams', () => {
    const u = unitsFor(P4, 'partners');
    expect(u).toEqual([
      { key: 'team-1', index: 0, memberIds: ['a', 'b'] },
      { key: 'team-2', index: 1, memberIds: ['c', 'd'] },
    ]);
  });
  it('makes one unit per player when solo', () => {
    const u = unitsFor(P3, 'solo');
    expect(u.map((x) => x.memberIds)).toEqual([['a'], ['b'], ['c']]);
  });
});

// ── single-hand scoring ─────────────────────────────────────────────────────
describe('scoreUnitHand', () => {
  it('scores an exact make: 10 x contract, no bags', () => {
    const r = scoreUnitHand([row(7, 7)], cfg(), 0);
    expect(r).toMatchObject({ contract: 7, tricks: 7, made: true, base: 70, bags: 0, score: 70 });
  });
  it('adds +1 per overtrick (bag)', () => {
    const r = scoreUnitHand([row(7, 9)], cfg(), 0);
    expect(r).toMatchObject({ base: 70, bags: 2, score: 72, bagsAfter: 2 });
  });
  it('scores a set: −10 x contract, no bags', () => {
    const r = scoreUnitHand([row(7, 6)], cfg(), 0);
    expect(r).toMatchObject({ made: false, base: -70, bags: 0, score: -70, bagsAfter: 0 });
  });
  it('scores a successful nil at +100 with a zero contract', () => {
    const r = scoreUnitHand([row(0, 0, 'nil')], cfg(), 0);
    expect(r).toMatchObject({ contract: 0, base: 0, nilPoints: 100, score: 100 });
  });
  it('scores a broken nil at −100 and turns its tricks into bags', () => {
    const r = scoreUnitHand([row(0, 2, 'nil')], cfg(), 0);
    expect(r).toMatchObject({ contract: 0, tricks: 2, made: true, bags: 2, nilPoints: -100, score: -98 });
  });
  it('scores blind nil at ±200', () => {
    expect(scoreUnitHand([row(0, 0, 'blind')], cfg(), 0).score).toBe(200);
    expect(scoreUnitHand([row(0, 3, 'blind')], cfg(), 0).nilPoints).toBe(-200);
  });
  it('downgrades blind to a normal nil when blind is disabled', () => {
    const r = scoreUnitHand([row(0, 0, 'blind')], cfg({ blindNil: false }), 0);
    expect(r.nilPoints).toBe(100);
  });
  it('combines a partner nil with the other partner’s contract', () => {
    const made = scoreUnitHand([row(0, 0, 'nil'), row(4, 5)], cfg(), 0);
    expect(made).toMatchObject({ contract: 4, tricks: 5, made: true, base: 40, bags: 1, nilPoints: 100, score: 141 });
  });
  it('lets a broken nil’s tricks still count toward the team contract', () => {
    const r = scoreUnitHand([row(0, 2, 'nil'), row(4, 4)], cfg(), 0);
    // contract 4, team tricks 6 -> made, 2 bags, nil broken -100 => 40 + 2 - 100
    expect(r).toMatchObject({ contract: 4, tricks: 6, made: true, bags: 2, score: -58 });
  });
});

// ── bag accumulation across hands ───────────────────────────────────────────
describe('bag penalty accumulation', () => {
  const seat = [player('a')];
  const four = [hand({ a: row(3, 6) }), hand({ a: row(3, 6) }), hand({ a: row(3, 6) }), hand({ a: row(3, 6) })];

  it('charges −100 when bags cross the threshold and rolls the remainder over', () => {
    const out = scoreGame(four, seat, { mode: 'solo' });
    expect(out.map((o) => o.deltas.a)).toEqual([33, 33, 33, -67]);
    expect(out[3].perUnit.a.bagsAfter).toBe(2); // 12 bags -> penalty, 2 remain
    expect(totalsOf(out).a).toBe(32);
  });

  it('never penalises when sandbagging is off, but keeps piling bags', () => {
    const out = scoreGame(four, seat, { mode: 'solo', sandbagging: false });
    expect(out.map((o) => o.deltas.a)).toEqual([33, 33, 33, 33]);
    expect(out[3].perUnit.a.bagsAfter).toBe(12);
  });

  it('honours a custom bag threshold', () => {
    const out = scoreGame(four, seat, { mode: 'solo', bagThreshold: 5 });
    // h1: 3 bags (after 3); h2: 6 -> penalty, 1 left, score 30+3-100; h3: 4; h4: 7 -> penalty, 2 left
    expect(out.map((o) => o.deltas.a)).toEqual([33, -67, 33, -67]);
  });

  it('can charge multiple penalties in one brutal hand', () => {
    const out = scoreGame([hand({ a: row(1, 13) })], seat, { mode: 'solo', bagThreshold: 5 });
    // 12 bags -> floor(12/5) = 2 penalties
    expect(out[0].perUnit.a).toMatchObject({ bags: 12, penalties: 2, penaltyPoints: -200, bagsAfter: 2 });
    expect(out[0].deltas.a).toBe(10 + 12 - 200);
  });
});

// ── full games: solo + partners ─────────────────────────────────────────────
describe('scoreGame', () => {
  it('scores a cutthroat hand per the classic example', () => {
    const out = scoreGame(
      [hand({ a: row(4, 5), b: row(0, 0, 'nil'), c: row(6, 6), d: row(3, 2) })],
      P4,
      { mode: 'solo' },
    );
    expect(out[0].deltas).toEqual({ a: 41, b: 100, c: 60, d: -30 });
  });

  it('mirrors a team’s hand score onto both partners', () => {
    const out = scoreGame(
      [hand({ a: row(4, 5), b: row(3, 3), c: row(2, 2), d: row(3, 3) })],
      P4,
      { mode: 'partners' },
    );
    // team1: contract 7, tricks 8 -> 71 ; team2: contract 5, tricks 5 -> 50
    expect(out[0].deltas).toEqual({ a: 71, b: 71, c: 50, d: 50 });
  });

  it('keeps partners’ running totals identical', () => {
    const h = hand({ a: row(4, 5), b: row(3, 3), c: row(2, 2), d: row(3, 3) });
    const totals = totalsOf(scoreGame([h, h], P4, { mode: 'partners' }));
    // team1 (a,b) 71/hand, team2 (c,d) 50/hand — partners share, opponents differ.
    expect(totals).toEqual({ a: 142, b: 142, c: 100, d: 100 });
  });

  it('threads bags per team, independently', () => {
    const h = hand({ a: row(1, 4), b: row(1, 1), c: row(6, 6), d: row(2, 2) });
    // team1 contract 2, tricks 5 -> 3 bags/hand ; team2 contract 8 tricks 8 -> 0 bags
    const out = scoreGame([h, h, h, h], P4, { mode: 'partners' });
    expect(out[3].perUnit['team-1'].bagsAfter).toBe(2); // 12 -> penalty, 2 left
    expect(out[3].perUnit['team-2'].bagsAfter).toBe(0);
    expect(out[3].deltas.a).toBe(20 + 3 - 100);
    expect(out[3].deltas.c).toBe(80);
  });
});

describe('scoreLatest', () => {
  it('returns the deltas for the hand being entered', () => {
    const prior = [hand({ a: row(3, 6) }), hand({ a: row(3, 6) }), hand({ a: row(3, 6) })];
    const deltas = scoreLatest(prior, hand({ a: row(3, 6) }), [player('a')], { mode: 'solo' });
    expect(deltas.a).toBe(-67); // 4th hand crosses 10 bags
  });
});

describe('bagCountsAfter', () => {
  it('reports the bags each unit carries forward', () => {
    const prior = [hand({ a: row(3, 6) }), hand({ a: row(3, 6) })];
    expect(bagCountsAfter(prior, [player('a')], { mode: 'solo' })).toEqual({ a: 6 });
  });
});

// ── validation ──────────────────────────────────────────────────────────────
describe('validateHand', () => {
  it('accepts a hand whose tricks total the table size', () => {
    const h = hand({ a: row(4, 5), b: row(3, 3), c: row(2, 2), d: row(3, 3) });
    expect(validateHand(h, P4, {})).toBeNull();
  });
  it('rejects tricks that do not add up', () => {
    const h = hand({ a: row(4, 5), b: row(3, 3), c: row(2, 2), d: row(3, 2) });
    expect(validateHand(h, P4, {})).toMatch(/Tricks must total 13/);
  });
  it('uses 17 tricks for three players', () => {
    const good = hand({ a: row(6, 6), b: row(5, 6), c: row(5, 5) });
    expect(validateHand(good, P3, {})).toBeNull();
    const bad = hand({ a: row(6, 6), b: row(5, 5), c: row(5, 5) });
    expect(validateHand(bad, P3, {})).toMatch(/17/);
  });
  it('rejects bids beyond the table size', () => {
    const h = hand({ a: row(14, 5), b: row(3, 3), c: row(2, 2), d: row(3, 3) });
    expect(validateHand(h, P4, {})).toMatch(/bid must be between 0 and 13/);
  });
  it('blocks nil when nil is disabled', () => {
    const h = hand({ a: row(0, 0, 'nil'), b: row(3, 3), c: row(2, 2), d: row(5, 5) });
    expect(validateHand(h, P4, { nil: false })).toMatch(/Nil bids are turned off/);
  });
  it('blocks blind nil when blind is disabled', () => {
    const h = hand({ a: row(0, 0, 'blind'), b: row(3, 3), c: row(2, 2), d: row(5, 5) });
    expect(validateHand(h, P4, { blindNil: false })).toMatch(/Blind nil is turned off/);
  });
});

// ── module wiring ───────────────────────────────────────────────────────────
function ctxFor(players: Player[], config: Record<string, unknown>, roundIndex: number, rounds: Round[]): RoundContext {
  return { game: { id: 'g' } as never, players, config, roundIndex, totals: {}, rounds };
}
function asRound(index: number, input: SpadesInput): Round {
  return { id: `r${index}`, gameId: 'g', index, input, deltas: {}, createdAt: 0 };
}

describe('spades module', () => {
  it('has the expected identity and player bounds', () => {
    expect(spades.id).toBe('spades');
    expect(spades.teams).toBe(true);
    expect(spades.minPlayers).toBe(3);
    expect(spades.maxPlayers).toBe(4);
    expect(spades.configFields?.map((f) => f.key)).toEqual([
      'mode',
      'target',
      'nil',
      'blindNil',
      'sandbagging',
      'bagThreshold',
    ]);
  });

  it('creates a blank row for every player', () => {
    const input = spades.createRoundInput(ctxFor(P4, {}, 0, [])) as SpadesInput;
    expect(Object.keys(input.rows)).toEqual(['a', 'b', 'c', 'd']);
    expect(input.rows.a).toEqual({ bid: 0, tricks: 0, nil: 'none' });
  });

  it('scoreRound accumulates bags from prior rounds only', () => {
    const prior = [asRound(0, hand({ a: row(3, 6) })), asRound(1, hand({ a: row(3, 6) })), asRound(2, hand({ a: row(3, 6) }))];
    const deltas = spades.scoreRound(hand({ a: row(3, 6) }), ctxFor([player('a')], { mode: 'solo' }, 3, prior));
    expect(deltas.a).toBe(-67);
  });

  it('scoreRound ignores rounds at/after the edited index', () => {
    // Editing round 1: ctx.rounds contains later rounds, which must not leak into the replay.
    const rounds = [asRound(0, hand({ a: row(3, 6) })), asRound(1, hand({ a: row(3, 6) })), asRound(2, hand({ a: row(3, 6) }))];
    const deltas = spades.scoreRound(hand({ a: row(3, 6) }), ctxFor([player('a')], { mode: 'solo' }, 1, rounds));
    expect(deltas.a).toBe(33); // only round 0 (3 bags) precedes it — no penalty yet
  });

  it('isFinished when a total reaches the target', () => {
    expect(spades.isFinished!({ a: 480, b: 480 }, { config: {}, roundCount: 9, playerCount: 4 })).toBe(false);
    expect(spades.isFinished!({ a: 510, b: 510 }, { config: {}, roundCount: 10, playerCount: 4 })).toBe(true);
  });

  it('describeRound summarises bids, tricks and nils', () => {
    const r = asRound(0, hand({ a: row(4, 5), b: row(0, 0, 'nil'), c: row(3, 3), d: row(0, 2, 'blind') }));
    expect(spades.describeRound!(r, P4)).toBe('A 4/5 · B 🚫✓ · C 3/3 · D 🙈✗');
  });

  it('never fixes a round count (open-ended)', () => {
    expect(spades.maxRounds).toBeUndefined();
  });
});
