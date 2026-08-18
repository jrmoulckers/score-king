import type { ID } from '../../types';

/**
 * Pure Cribbage scoring — no Svelte, no I/O, so it's independently unit-testable
 * and safe for the stats engine to import.
 *
 * Cribbage is a race up a pegging board (121 holes, or 61 for a short "once
 * around" game). Every deal, each side counts its hand; the *dealer* also counts
 * the crib, and takes two for "his heels" when the cut turns a jack. Points also
 * come from the play itself ("pegging"), which the editor records as one number
 * because nobody wants to log fifteen-two by fifteen-two.
 *
 * Two shapes of scoring live here and they are deliberately separate:
 *
 * 1. {@link scoreCards} — the authoritative rules engine. Give it four cards and
 *    a starter and it returns the exact breakdown (fifteens, pairs, runs, flush,
 *    nob). This is what settles arguments at the table and what the tests hammer.
 * 2. {@link breakdownTotal} — the fast path. Players count their own hands the way
 *    they always have and tap in the components; we just add them up.
 *
 * Both produce the same {@link Breakdown} shape, so the editor, the history text
 * and the stats hook never care which route a hand arrived by.
 */

// ── cards ────────────────────────────────────────────────────────────────────

export type Suit = 'S' | 'H' | 'D' | 'C';

/** Ace = 1 … Jack = 11, Queen = 12, King = 13. */
export type Rank = number;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const RANK_LABELS: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const SUIT_GLYPHS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAMES: Record<Suit, string> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};
const RANK_NAMES: Record<number, string> = { 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' };

export function rankLabel(rank: Rank): string {
  return RANK_LABELS[rank] ?? String(rank);
}

export function suitGlyph(suit: Suit): string {
  return SUIT_GLYPHS[suit];
}

export function cardLabel(card: Card): string {
  return `${rankLabel(card.rank)}${suitGlyph(card.suit)}`;
}

/** Spoken name, for assistive tech ("Jack of spades"). */
export function cardName(card: Card): string {
  return `${RANK_NAMES[card.rank] ?? card.rank} of ${SUIT_NAMES[card.suit]}`;
}

export function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/** Counting value: face cards are all worth ten, the ace is worth one. */
export function cardValue(card: Card): number {
  return Math.min(10, card.rank);
}

// ── the breakdown every hand reduces to ──────────────────────────────────────

/**
 * One counted hand. `fifteens` and `pairs` are *counts* (each worth two) because
 * that's how they're called at the table — "fifteen-two, fifteen-four, and a pair
 * is six". `runs`, `flush` and `nob` are already points, since a run is called by
 * its length and a flush is simply four or five.
 */
export interface Breakdown {
  fifteens: number;
  pairs: number;
  runs: number;
  flush: number;
  nob: number;
}

export function emptyBreakdown(): Breakdown {
  return { fifteens: 0, pairs: 0, runs: 0, flush: 0, nob: 0 };
}

function whole(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Points a counted hand is worth. Negative/garbage components read as zero. */
export function breakdownTotal(b: Breakdown | undefined): number {
  if (!b) return 0;
  return whole(b.fifteens) * 2 + whole(b.pairs) * 2 + whole(b.runs) + whole(b.flush) + whole(b.nob);
}

/** True when nothing has been counted into this breakdown yet. */
export function breakdownEmpty(b: Breakdown | undefined): boolean {
  return breakdownTotal(b) === 0;
}

/** The famous impossible score: no five cards can ever count nineteen. */
export const IMPOSSIBLE_HAND = 19;

/** Highest hand in cribbage: J + three fives, with the matching five cut. */
export const PERFECT_HAND = 29;

// ── the rules engine ─────────────────────────────────────────────────────────

function subsets<T>(items: readonly T[]): T[][] {
  let out: T[][] = [[]];
  for (const item of items) out = [...out, ...out.map((existing) => [...existing, item])];
  return out;
}

/** Every combination summing to fifteen scores two. */
export function countFifteens(cards: readonly Card[]): number {
  let n = 0;
  for (const combo of subsets(cards)) {
    if (combo.length < 2) continue;
    if (combo.reduce((a, c) => a + cardValue(c), 0) === 15) n += 1;
  }
  return n;
}

/** Every distinct pair of equal rank scores two (so a triple is three pairs). */
export function countPairs(cards: readonly Card[]): number {
  let n = 0;
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      if (cards[i].rank === cards[j].rank) n += 1;
    }
  }
  return n;
}

/**
 * Run points. Only the *longest* run counts, and it counts once for every way it
 * can be made — so a double run of three is six, a triple run is nine, and a
 * double-double run is twelve. Ranks run A-2-3…J-Q-K; there is no wrap-around.
 */
export function runPoints(cards: readonly Card[]): number {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const ranks = [...counts.keys()].sort((a, b) => a - b);

  let best = 0;
  let bestMultiplier = 0;
  let i = 0;
  while (i < ranks.length) {
    let j = i;
    while (j + 1 < ranks.length && ranks[j + 1] === ranks[j] + 1) j += 1;
    const length = j - i + 1;
    if (length >= 3 && length > best) {
      let multiplier = 1;
      for (let k = i; k <= j; k += 1) multiplier *= counts.get(ranks[k]) ?? 1;
      best = length;
      bestMultiplier = multiplier;
    }
    i = j + 1;
  }
  return best * bestMultiplier;
}

/**
 * Flush points. Four hand cards of one suit are worth four, plus one more when
 * the starter matches. The crib is stricter: it only flushes when all five cards
 * share a suit, and then it's worth five.
 */
export function flushPoints(hand: readonly Card[], starter: Card | null, isCrib: boolean): number {
  if (hand.length < 4) return 0;
  const suit = hand[0].suit;
  if (!hand.every((c) => c.suit === suit)) return 0;
  const withStarter = starter != null && starter.suit === suit;
  if (isCrib) return withStarter ? 5 : 0;
  return withStarter ? 5 : 4;
}

/** One for his nob: a jack in hand matching the starter's suit. */
export function nobPoints(hand: readonly Card[], starter: Card | null): number {
  if (!starter) return 0;
  return hand.some((c) => c.rank === 11 && c.suit === starter.suit) ? 1 : 0;
}

/**
 * Score a hand (or crib) of four cards against the cut starter, returning the
 * same {@link Breakdown} shape a hand counted by tapping produces.
 *
 * This is the *hand* count only. Two for his heels belongs to the dealer at the
 * cut, not to any hand, so it's tracked separately on the round input.
 */
export function scoreCards(
  hand: readonly Card[],
  starter: Card | null = null,
  isCrib = false,
): Breakdown {
  const all = starter ? [...hand, starter] : [...hand];
  return {
    fifteens: countFifteens(all),
    pairs: countPairs(all),
    runs: runPoints(all),
    flush: flushPoints(hand, starter, isCrib),
    nob: nobPoints(hand, starter),
  };
}

/** True when the cut turns a jack — two for his heels, straight to the dealer. */
export function isHeels(starter: Card | null): boolean {
  return starter?.rank === 11;
}

export const HEELS_POINTS = 2;

// ── scoring units (solo seats, or two partnerships) ──────────────────────────

export type PlayStyle = 'solo' | 'partners';

export interface Unit {
  key: string;
  /** 0-based order — a seat, or Team 1 / Team 2. */
  index: number;
  memberIds: ID[];
}

/**
 * Effective play style. Partnerships need exactly four seats; any other count
 * falls back to solo so a game is never wedged into an impossible shape. Mirrors
 * the approach Spades and Euchre take, for the same reason: the shell has no
 * partnership model, so a game keeps team play inside its own module.
 */
export function resolveMode(config: Record<string, unknown>, playerCount: number): PlayStyle {
  return readConfig(config).mode === 'partners' && playerCount === 4 ? 'partners' : 'solo';
}

/** Group seats into scoring units. Partners pair by pick order: 1 & 2 vs 3 & 4. */
export function unitsFor(players: readonly { id: ID }[], mode: PlayStyle): Unit[] {
  if (mode === 'partners' && players.length === 4) {
    return [
      { key: 'team-1', index: 0, memberIds: [players[0].id, players[1].id] },
      { key: 'team-2', index: 1, memberIds: [players[2].id, players[3].id] },
    ];
  }
  return players.map((p, i) => ({ key: p.id, index: i, memberIds: [p.id] }));
}

/** The unit a player belongs to, or null when they aren't seated. */
export function unitFor(units: readonly Unit[], playerId: ID | null): Unit | null {
  if (!playerId) return null;
  return units.find((u) => u.memberIds.includes(playerId)) ?? null;
}

// ── config ───────────────────────────────────────────────────────────────────

export interface CribbageConfig {
  /** Holes to peg out: 121 the classic long game, 61 the short one. */
  target: number;
  mode: PlayStyle;
  /** Celebrate skunks at the finish. */
  skunks: boolean;
}

export const DEFAULT_CONFIG: CribbageConfig = { target: 121, mode: 'solo', skunks: true };

export function readConfig(config: Record<string, unknown> = {}): CribbageConfig {
  const t = Math.round(Number(config.target));
  return {
    target: Number.isFinite(t) && t > 0 ? t : DEFAULT_CONFIG.target,
    mode: config.mode === 'partners' ? 'partners' : 'solo',
    skunks: config.skunks !== false,
  };
}

// ── the round ────────────────────────────────────────────────────────────────

export interface UnitEntry {
  /** Points taken during the play — fifteens, pairs, runs, go, and last card. */
  pegging: number;
  hand: Breakdown;
  /** Only counted for the dealer's unit; kept per-unit so a mis-set dealer is recoverable. */
  crib: Breakdown;
}

export interface CribbageInput {
  /** Whose deal it is — the crib and his heels belong to this player's unit. */
  dealerId: ID | null;
  /** The cut turned a jack: two for his heels, to the dealer. */
  heels: boolean;
  /** Counted results, keyed by scoring-unit key. */
  entries: Record<string, UnitEntry>;
}

export function emptyEntry(): UnitEntry {
  return { pegging: 0, hand: emptyBreakdown(), crib: emptyBreakdown() };
}

/**
 * Whose deal it is by default. The deal rotates one seat every hand, so hand 1
 * is dealt by the first seat, hand 2 by the second, and so on around the table.
 * In partnerships it still rotates seat by seat, which alternates the crib
 * between the two teams exactly as it should.
 */
export function defaultDealer(players: readonly { id: ID }[], roundIndex: number): ID | null {
  if (!players.length) return null;
  const i = ((Math.trunc(roundIndex) % players.length) + players.length) % players.length;
  return players[i].id;
}

export function emptyInput(
  players: readonly { id: ID }[],
  roundIndex: number,
  config: Record<string, unknown> = {},
): CribbageInput {
  const units = unitsFor(players, resolveMode(config, players.length));
  const entries: Record<string, UnitEntry> = {};
  for (const u of units) entries[u.key] = emptyEntry();
  return { dealerId: defaultDealer(players, roundIndex), heels: false, entries };
}

/** Everything one unit takes this deal, split so the editor can show the parts. */
export interface UnitResult {
  pegging: number;
  hand: number;
  /** Crib points — zero unless this unit holds the deal. */
  crib: number;
  /** Two for his heels — zero unless this unit holds the deal. */
  heels: number;
  isDealer: boolean;
  total: number;
}

export function scoreUnit(
  entry: UnitEntry | undefined,
  input: CribbageInput,
  isDealer: boolean,
): UnitResult {
  const e = entry ?? emptyEntry();
  const pegging = whole(e.pegging);
  const hand = breakdownTotal(e.hand);
  const crib = isDealer ? breakdownTotal(e.crib) : 0;
  const heels = isDealer && input?.heels ? HEELS_POINTS : 0;
  return { pegging, hand, crib, heels, isDealer, total: pegging + hand + crib + heels };
}

/** Per-unit results for a deal, keyed by unit key. */
export function scoreDeal(
  input: CribbageInput,
  players: readonly { id: ID }[],
  config: Record<string, unknown> = {},
): Record<string, UnitResult> {
  const units = unitsFor(players, resolveMode(config, players.length));
  const dealerUnit = unitFor(units, input?.dealerId ?? null);
  const out: Record<string, UnitResult> = {};
  for (const u of units) {
    out[u.key] = scoreUnit(input?.entries?.[u.key], input, dealerUnit?.key === u.key);
  }
  return out;
}

/** Per-player point deltas for a deal — partners each carry the team's score. */
export function scoreRound(
  input: CribbageInput,
  players: readonly { id: ID }[],
  config: Record<string, unknown> = {},
): Record<ID, number> {
  const units = unitsFor(players, resolveMode(config, players.length));
  const results = scoreDeal(input, players, config);
  const out: Record<ID, number> = {};
  for (const u of units) {
    for (const id of u.memberIds) out[id] = results[u.key]?.total ?? 0;
  }
  return out;
}

/** Null when the deal is good to record, otherwise a friendly reason. */
export function validateRound(
  input: CribbageInput,
  players: readonly { id: ID; name: string }[],
  config: Record<string, unknown> = {},
): string | null {
  const units = unitsFor(players, resolveMode(config, players.length));
  if (!input?.dealerId) return 'Tap whose deal it is — the crib goes to the dealer.';
  if (!unitFor(units, input.dealerId)) return "That dealer isn't in this game.";

  for (const u of units) {
    const e = input.entries?.[u.key] ?? emptyEntry();
    const who =
      u.memberIds
        .map((id) => players.find((p) => p.id === id)?.name)
        .filter(Boolean)
        .join(' & ') || `Team ${u.index + 1}`;
    if (!Number.isFinite(Number(e.pegging)) || Number(e.pegging) < 0) {
      return `${who}: pegging points can't be negative.`;
    }
    for (const [label, b] of [
      ['hand', e.hand],
      ['crib', e.crib],
    ] as const) {
      for (const v of Object.values(b ?? {})) {
        if (!Number.isFinite(Number(v)) || Number(v) < 0) {
          return `${who}: ${label} counts can't be negative.`;
        }
      }
    }
  }
  return null;
}

// ── the board: pegging toward the finish, skunk lines and all ────────────────

/**
 * The skunk line, three-quarters of the way up the board — 91 on a standard 121
 * board, exactly where tradition puts it. A loser short of this is skunked, and
 * the proportion keeps the line sensible on a short 61-hole game too (46).
 */
export function skunkLine(target: number): number {
  return Math.ceil(target * 0.75);
}

/** The double-skunk line, half the board — 61 on a 121 board. */
export function doubleSkunkLine(target: number): number {
  return Math.ceil(target * 0.5);
}

export type SkunkKind = 'none' | 'skunk' | 'double';

/** How badly the trailing side was beaten, once someone has pegged out. */
export function skunkFor(loserScore: number, target: number): SkunkKind {
  if (loserScore < doubleSkunkLine(target)) return 'double';
  if (loserScore < skunkLine(target)) return 'skunk';
  return 'none';
}

export interface SkunkLabel {
  kind: SkunkKind;
  emoji: string;
  headline: string;
  cheer: string;
}

/** Copy for the end-of-game moment, so the editor and stats never re-invent it. */
export function skunkLabel(kind: SkunkKind): SkunkLabel {
  if (kind === 'double') {
    return {
      kind,
      emoji: '🦨🦨',
      headline: 'Double skunk!',
      cheer: 'Not even halfway up the board. This one goes in the family history.',
    };
  }
  if (kind === 'skunk') {
    return {
      kind,
      emoji: '🦨',
      headline: 'Skunk!',
      cheer: 'Short of the skunk line — a proper drubbing.',
    };
  }
  return { kind, emoji: '🏁', headline: 'Pegged out', cheer: 'A clean, honest finish.' };
}

/** A unit's position on the board, before and after this deal. */
export interface PegView {
  before: number;
  projected: number;
  target: number;
  /** True when this deal takes the unit past the finish. */
  pegsOut: boolean;
  /** Holes still to peg after this deal (0 once out). */
  remaining: number;
  /** True when the projected score is still short of the skunk line. */
  inSkunkRange: boolean;
}

export function pegView(before: number, delta: number, target: number): PegView {
  const projected = Math.max(0, before + delta);
  const pegsOut = target > 0 && projected >= target;
  return {
    before,
    projected,
    target,
    pegsOut,
    remaining: target > 0 ? Math.max(0, target - projected) : 0,
    inSkunkRange: target > 0 && projected < skunkLine(target),
  };
}

/** Unit totals going into this deal (both partners mirror the team score). */
export function unitTotals(
  units: readonly Unit[],
  totals: Record<ID, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of units) {
    out[u.key] = u.memberIds.length ? Math.max(...u.memberIds.map((id) => totals[id] ?? 0)) : 0;
  }
  return out;
}

/** Unit keys currently in front. Empty on an all-square table (nobody leads yet). */
export function leaders(unitScores: Record<string, number>): Set<string> {
  const keys = Object.keys(unitScores);
  if (keys.length < 2) return new Set();
  const values = keys.map((k) => unitScores[k]);
  const max = Math.max(...values);
  if (max === Math.min(...values)) return new Set();
  return new Set(keys.filter((k) => unitScores[k] === max));
}

export function isFinished(totals: Record<ID, number>, config: Record<string, unknown>): boolean {
  const { target } = readConfig(config);
  return Object.values(totals).some((t) => t >= target);
}

/**
 * The finish, once someone has pegged out: the winning score, the best of the
 * rest, and how badly they were beaten. Returns null while the game is live.
 */
export interface FinishView {
  winnerScore: number;
  loserScore: number;
  kind: SkunkKind;
}

export function finishView(unitScores: Record<string, number>, target: number): FinishView | null {
  const values = Object.values(unitScores);
  if (values.length < 2) return null;
  const winnerScore = Math.max(...values);
  if (target <= 0 || winnerScore < target) return null;
  const loserScore = Math.min(...values);
  return { winnerScore, loserScore, kind: skunkFor(loserScore, target) };
}

// ── history text ─────────────────────────────────────────────────────────────

/** Short, glanceable summary of a recorded deal for the history table. */
export function describeDeal(
  input: CribbageInput | undefined,
  players: readonly { id: ID; name: string }[],
  deltas: Record<ID, number> = {},
): string {
  if (!input?.dealerId) return 'Deal not recorded';
  const dealer = players.find((p) => p.id === input.dealerId)?.name ?? '?';
  const parts = players.map((p) => `${p.name} +${deltas[p.id] ?? 0}`);
  const heels = input.heels ? ' · 🂻 heels +2' : '';
  return `🂠 ${dealer}'s crib${heels} — ${parts.join(' · ')}`;
}
