import type { ID } from '../../types';

/**
 * Pure Finding Friends (找朋友 Zhǎo Péngyou / Tuō Lā Jī, a Tractor/Sheng Ji "level" variant)
 * scoring — no Svelte, no I/O, so it's independently unit-testable and safe for the stats
 * engine to import.
 *
 * Finding Friends is a *shifting*-partnership game: at the start of a deal the current
 * banker calls a card (or two) to recruit a hidden ally, and everyone else defaults to the
 * challenging side — so who's on which side can change deal to deal (unlike Euchre's fixed
 * partnerships). Score King has no built-in notion of a rotating team, so this module keeps
 * that entirely inside `FindingFriendsInput`: each round records exactly who was banking
 * ("declarers") and who was attacking ("challengers") *that deal*, and the level jump is
 * mirrored onto every player named for the winning side (same trick Euchre uses for its
 * fixed teams — see euchre/logic.ts — just re-applied to a side whose roster can move).
 * Because the winning side usually keeps most of its members from one deal to the next
 * (the bank only passes to the *whole* challenging side when they win it), a player's
 * cumulative total closely tracks "their side's" level over the course of a game.
 */

/** The 13 rungs of the level ladder: 2 through Ace. Index 0 = level "2", index 12 = "A". */
export const LEVELS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
] as const;
export type Level = (typeof LEVELS)[number];

/** Reaching (or passing) this level index — Ace — wins the game. */
export const WINNING_LEVEL_INDEX = LEVELS.length - 1; // 12

export type Side = 'declarers' | 'challengers';

export interface FindingFriendsInput {
  /** This deal's banker/defending side — trying to stop the challengers capturing points. */
  declarers: ID[];
  /** Everyone else this deal — trying to capture point cards off the declarers. */
  challengers: ID[];
  /** Point cards (5s/10s/Ks) the challengers captured this deal. Null until recorded. */
  pointsCaptured: number | null;
}

export interface FindingFriendsOptions {
  /** Decks in play — scales the point-card pool and the level-jump thresholds below. */
  deckCount: number;
}

export const DEFAULT_OPTIONS: FindingFriendsOptions = { deckCount: 2 };

/**
 * Total point-card value in play for `deckCount` decks: each deck holds four 5s (5 each =
 * 20), four 10s (10 each = 40) and four Kings (10 each = 40) = 100 points per deck.
 */
export function totalPoints(deckCount: number): number {
  return Math.max(0, deckCount) * 100;
}

export interface LevelJumpResult {
  /** Side that advances, or null on a "hold" — a wash where neither side moves. */
  winner: Side | null;
  /** Levels the winning side advances (0 on a hold). */
  levels: number;
}

/**
 * The classic Finding Friends / Zhao Pengyou level-jump table, expressed as fractions of
 * the deck's total point-card value so it scales cleanly with `deckCount` (100 pts/deck).
 * For the standard 2-deck game (200 total points) this reproduces the widely-cited bands:
 *   0 pts            → declarers +3 (a shutout)
 *   1–39 (<20%)       → declarers +2
 *   40–79 (20–40%)    → declarers +1
 *   80–119 (40–60%)   → hold, nobody advances
 *   120–159 (60–80%)  → challengers +1
 *   160–199 (80–100%) → challengers +2
 *   200+ (100%+)      → challengers +3
 * House rules vary the exact cutoffs (some shift the hold band, some skip it); this is a
 * faithful, documented default rather than the only correct table.
 */
export function levelJump(pointsCaptured: number, deckCount: number): LevelJumpResult {
  const total = totalPoints(deckCount);
  if (pointsCaptured <= 0) return { winner: 'declarers', levels: 3 };
  if (total <= 0) return { winner: null, levels: 0 };
  const frac = pointsCaptured / total;
  if (frac < 0.2) return { winner: 'declarers', levels: 2 };
  if (frac < 0.4) return { winner: 'declarers', levels: 1 };
  if (frac < 0.6) return { winner: null, levels: 0 };
  if (frac < 0.8) return { winner: 'challengers', levels: 1 };
  if (frac < 1.0) return { winner: 'challengers', levels: 2 };
  return { winner: 'challengers', levels: 3 };
}

/** Per-player point deltas for a deal: every member of the winning side shares the jump. */
export function scoreFindingFriends(
  input: FindingFriendsInput,
  opts: FindingFriendsOptions = DEFAULT_OPTIONS,
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of [...input.declarers, ...input.challengers]) out[id] = 0;
  if (input.pointsCaptured == null) return out;

  const { winner, levels } = levelJump(input.pointsCaptured, opts.deckCount);
  if (!winner || levels === 0) return out;

  const side = winner === 'declarers' ? input.declarers : input.challengers;
  for (const id of side) out[id] = levels;
  return out;
}

/** Null when the deal is valid to record, otherwise a human-readable reason. */
export function validateFindingFriends(input: FindingFriendsInput): string | null {
  if (input.declarers.length === 0) return 'Pick who was on the banking side this deal.';
  if (input.challengers.length === 0) return 'Pick who was on the attacking side this deal.';
  const overlap = input.declarers.filter((id) => input.challengers.includes(id));
  if (overlap.length) return 'A player can only be on one side this deal.';
  if (input.pointsCaptured == null) return 'Enter how many points the attackers captured.';
  if (input.pointsCaptured < 0) return 'Points captured can\u2019t be negative.';
  return null;
}

/** A side's current level index, from the cumulative totals of its named members. */
export function sideLevelIndex(ids: ID[], totals: Record<ID, number>): number {
  if (!ids.length) return 0;
  const raw = Math.max(...ids.map((id) => totals[id] ?? 0));
  return Math.max(0, Math.min(WINNING_LEVEL_INDEX, Math.round(raw)));
}

/** Human label for a level index, clamped into range (e.g. 0 → "2", 12 → "A"). */
export function levelLabel(index: number): Level {
  return LEVELS[Math.max(0, Math.min(WINNING_LEVEL_INDEX, Math.round(index)))];
}

/** A side has reached (or passed) Ace — the game-winning level. */
export function sideHasWon(ids: ID[], totals: Record<ID, number>): boolean {
  return sideLevelIndex(ids, totals) >= WINNING_LEVEL_INDEX;
}

/**
 * Short, glanceable summary of a recorded deal for the history table. Reads the winning
 * side straight off the stored per-player `deltas` (so the text always matches what was
 * actually recorded, even under a house-rule table) rather than re-deriving it from
 * `pointsCaptured` — `describeRound` doesn't have the game's config on hand, and a round's
 * `deltas` already settled the question at score time. Falls back to the default-deck
 * table only when no deltas are supplied (e.g. previewing before a round is scored).
 */
export function describeDeal(
  input: FindingFriendsInput,
  players: { id: ID; name: string }[],
  deltas?: Record<ID, number>,
): string {
  if (input.pointsCaptured == null) return 'Deal not recorded';
  const name = (id: ID): string => players.find((p) => p.id === id)?.name || '?';
  const d = deltas ?? scoreFindingFriends(input);

  const declarerPts = Math.max(0, ...input.declarers.map((id) => d[id] ?? 0));
  const challengerPts = Math.max(0, ...input.challengers.map((id) => d[id] ?? 0));
  if (declarerPts === 0 && challengerPts === 0) {
    return `🤝 Hold — ${input.pointsCaptured} pts captured, no one advances`;
  }
  const winner: Side = declarerPts > 0 ? 'declarers' : 'challengers';
  const pts = winner === 'declarers' ? declarerPts : challengerPts;
  const side = winner === 'declarers' ? input.declarers : input.challengers;
  const label = side.map(name).join(' & ') || (winner === 'declarers' ? 'Declarers' : 'Challengers');
  const verb = winner === 'declarers' ? 'holds the bank' : 'breaks through';
  return `${winner === 'declarers' ? '🛡️' : '⚔️'} ${label} ${verb} — +${pts} level${pts === 1 ? '' : 's'}`;
}

// --- config coercion (config values arrive as `unknown` from stored game config) ---

export function deckCountFromConfig(config: Record<string, unknown>): number {
  const n = Number(config.deckCount);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_OPTIONS.deckCount;
}

export function optionsFromConfig(config: Record<string, unknown>): FindingFriendsOptions {
  return { deckCount: deckCountFromConfig(config) };
}
