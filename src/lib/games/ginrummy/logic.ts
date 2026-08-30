import type { ID, Round } from '../../types';

/**
 * Pure Gin Rummy scoring — no Svelte, no I/O, so it's independently unit-testable
 * and safe for the stats engine to import.
 *
 * Gin Rummy is strictly two-handed. Each hand, a player races to meld their ten
 * cards into sets and runs; whoever holds 10 or fewer unmelded points ("deadwood")
 * may KNOCK to end the hand, or go GIN with zero deadwood. The editor only ever
 * asks for three things: who knocked, whether it was gin, and each side's deadwood
 * count — everything else (the margin, the bonuses, who wins the whole game) is
 * derived from that.
 *
 * Two totals matter, and they're deliberately kept apart:
 * - The *hand* score — the knock/gin/undercut margin — is what races toward the
 *   target and is all {@link scoreHand} ever returns.
 * - The *settlement* bonuses (game bonus, per-hand "line" bonus, the shutout
 *   double) only exist once the game actually ends, so {@link scoreRound} folds
 *   them into the delta of the one hand that crosses the target — exactly like a
 *   real score pad, where the bonuses get totted up in a single pass at the end.
 */

export type Outcome = 'gin' | 'knock' | 'undercut';

export interface GinRummyInput {
  /** Who ended the hand — by knocking or going gin. Null while undecided. */
  knockerId: ID | null;
  /** The knocker melded all ten cards — no lay-offs, no deadwood of their own. */
  gin: boolean;
  /** Each player's deadwood count, keyed by id. The knocker's reads as 0 on gin. */
  deadwood: Record<ID, number>;
}

export function emptyInput(players: readonly { id: ID }[]): GinRummyInput {
  const deadwood: Record<ID, number> = {};
  for (const p of players) deadwood[p.id] = 0;
  return { knockerId: null, gin: false, deadwood };
}

export interface GinRummyConfig {
  /** Points to reach before the game ends and settlement bonuses apply. */
  target: number;
  /** Bonus for going gin, added on top of the opponent's deadwood. */
  ginBonus: number;
  /** Bonus for undercutting a knock (matching or beating the knocker's deadwood). */
  undercutBonus: number;
  /** Deadwood must be at or below this to knock without going gin. */
  maxKnockDeadwood: number;
  /** Bonus to whoever wins the whole game, applied the hand it's won. */
  gameBonus: number;
  /** Bonus per hand won across the game ("boxes"), settled at game end. */
  lineBonus: number;
  /** Double the game bonus when the loser's hand-score total is still zero. */
  shutoutDoubling: boolean;
}

export const DEFAULT_CONFIG: GinRummyConfig = {
  target: 100,
  ginBonus: 25,
  undercutBonus: 20,
  maxKnockDeadwood: 10,
  gameBonus: 100,
  lineBonus: 25,
  shutoutDoubling: true,
};

function positiveInt(v: unknown, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function readConfig(config: Record<string, unknown> = {}): GinRummyConfig {
  return {
    target: positiveInt(config.target, DEFAULT_CONFIG.target) || DEFAULT_CONFIG.target,
    ginBonus: positiveInt(config.ginBonus, DEFAULT_CONFIG.ginBonus),
    undercutBonus: positiveInt(config.undercutBonus, DEFAULT_CONFIG.undercutBonus),
    maxKnockDeadwood: positiveInt(config.maxKnockDeadwood, DEFAULT_CONFIG.maxKnockDeadwood),
    gameBonus: positiveInt(config.gameBonus, DEFAULT_CONFIG.gameBonus),
    lineBonus: positiveInt(config.lineBonus, DEFAULT_CONFIG.lineBonus),
    shutoutDoubling: config.shutoutDoubling !== false,
  };
}

function whole(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The other seat at a two-handed table, or null if `id` isn't one of the two. */
export function opponentOf(players: readonly { id: ID }[], id: ID | null): ID | null {
  if (!id || !players.some((p) => p.id === id)) return null;
  const other = players.find((p) => p.id !== id);
  return other?.id ?? null;
}

export interface HandResult {
  outcome: Outcome;
  knockerId: ID;
  opponentId: ID;
  knockerDeadwood: number;
  opponentDeadwood: number;
  /** The knock/gin/undercut margin, before any settlement bonus. */
  margin: number;
  /** Per-player hand deltas — the raw race score, no settlement bonuses. */
  deltas: Record<ID, number>;
}

/**
 * Score one hand from who-knocked + deadwood alone. Returns null while the hand
 * isn't fully decided yet (no knocker chosen).
 */
export function scoreHand(
  input: GinRummyInput | null | undefined,
  players: readonly { id: ID }[],
  config: Record<string, unknown> = {},
): HandResult | null {
  if (!input?.knockerId) return null;
  const knockerId = input.knockerId;
  const opponentId = opponentOf(players, knockerId);
  if (!opponentId) return null;

  const cfg = readConfig(config);
  const opponentDeadwood = whole(input.deadwood?.[opponentId]);
  const knockerDeadwood = input.gin ? 0 : whole(input.deadwood?.[knockerId]);

  const deltas: Record<ID, number> = { [knockerId]: 0, [opponentId]: 0 };

  if (input.gin) {
    const margin = opponentDeadwood + cfg.ginBonus;
    deltas[knockerId] = margin;
    return {
      outcome: 'gin',
      knockerId,
      opponentId,
      knockerDeadwood,
      opponentDeadwood,
      margin,
      deltas,
    };
  }

  if (opponentDeadwood > knockerDeadwood) {
    const margin = opponentDeadwood - knockerDeadwood;
    deltas[knockerId] = margin;
    return {
      outcome: 'knock',
      knockerId,
      opponentId,
      knockerDeadwood,
      opponentDeadwood,
      margin,
      deltas,
    };
  }

  // The opponent matched or beat the knocker's own deadwood: an undercut. The
  // knocker gets nothing — the whole margin (plus the bonus) flips to the
  // opponent, who never even knocked.
  const margin = knockerDeadwood - opponentDeadwood + cfg.undercutBonus;
  deltas[opponentId] = margin;
  return {
    outcome: 'undercut',
    knockerId,
    opponentId,
    knockerDeadwood,
    opponentDeadwood,
    margin,
    deltas,
  };
}

/** Null when a hand is valid to record, otherwise a human-readable reason. */
export function validateRound(
  input: GinRummyInput,
  players: readonly { id: ID; name: string }[],
  config: Record<string, unknown> = {},
): string | null {
  if (players.length !== 2) return 'Gin Rummy is strictly two-handed.';
  if (!input?.knockerId) return 'Tap whoever knocked (or went gin) to end the hand.';
  const opponentId = opponentOf(players, input.knockerId);
  if (!opponentId) return "That player isn't in this game.";

  const cfg = readConfig(config);
  for (const p of players) {
    const v = Number(input.deadwood?.[p.id] ?? 0);
    if (!Number.isFinite(v) || v < 0) return `${p.name}: deadwood can't be negative.`;
  }

  if (!input.gin) {
    const knockerDeadwood = whole(input.deadwood?.[input.knockerId]);
    if (knockerDeadwood > cfg.maxKnockDeadwood) {
      const who = players.find((p) => p.id === input.knockerId)?.name ?? 'The knocker';
      return `${who} has ${knockerDeadwood} deadwood — too much to knock (max ${cfg.maxKnockDeadwood}). Mark Gin, or lower the count.`;
    }
  }
  return null;
}

/**
 * A hand's winner, replayed from its own recorded `input` (not the stored
 * deltas) so a settlement-bonus-laden final hand never gets misattributed —
 * the raw knock/gin/undercut margin alone decides who actually won the hand.
 */
function boxWinner(
  round: Round,
  players: readonly { id: ID }[],
  config: Record<string, unknown>,
): ID | null {
  const hand = scoreHand(round.input as GinRummyInput | undefined, players, config);
  if (!hand) return null;
  return hand.deltas[hand.knockerId] > 0 ? hand.knockerId : hand.opponentId;
}

/** Hands ("boxes") each player has won across a game's recorded rounds so far. */
export function boxCounts(
  rounds: readonly Round[],
  players: readonly { id: ID }[],
  config: Record<string, unknown> = {},
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const r of rounds) {
    const winner = boxWinner(r, players, config);
    if (winner) out[winner] = (out[winner] ?? 0) + 1;
  }
  return out;
}

/**
 * Per-player point deltas for a hand, including settlement bonuses the moment
 * the hand pushes a player's *hand-score* total to the target. `priorRounds` are
 * this game's rounds already recorded (strictly before the one being scored),
 * used only to tally each side's box count for the line bonus.
 */
export function scoreRound(
  input: GinRummyInput,
  players: readonly { id: ID }[],
  config: Record<string, unknown> = {},
  totalsBefore: Record<ID, number> = {},
  priorRounds: readonly Round[] = [],
): Record<ID, number> {
  const hand = scoreHand(input, players, config);
  if (!hand) return Object.fromEntries(players.map((p) => [p.id, 0]));

  const cfg = readConfig(config);
  const deltas: Record<ID, number> = { ...hand.deltas };
  const rawTotals: Record<ID, number> = {};
  for (const p of players) rawTotals[p.id] = (totalsBefore[p.id] ?? 0) + (deltas[p.id] ?? 0);

  const ids = players.map((p) => p.id);
  const reached = ids.filter((id) => rawTotals[id] >= cfg.target);
  if (reached.length === 0) return deltas;

  // The game ends this hand: settle boxes for both sides, plus the game bonus
  // (doubled on a shutout) for whoever has the higher hand-score total.
  const winnerId = ids.reduce((a, b) => (rawTotals[b] > rawTotals[a] ? b : a));
  const loserId = ids.find((id) => id !== winnerId) ?? winnerId;

  const boxes = boxCounts(priorRounds, players, config);
  for (const id of ids) {
    // This hand's own winner (if any) picks up their box too.
    const wonThisHand = hand.deltas[id] > 0;
    const boxCount = (boxes[id] ?? 0) + (wonThisHand ? 1 : 0);
    deltas[id] = (deltas[id] ?? 0) + boxCount * cfg.lineBonus;
  }

  const shutout = cfg.shutoutDoubling && rawTotals[loserId] === 0;
  const gameBonus = cfg.gameBonus * (shutout ? 2 : 1);
  deltas[winnerId] = (deltas[winnerId] ?? 0) + gameBonus;

  return deltas;
}

export function isFinished(totals: Record<ID, number>, config: Record<string, unknown>): boolean {
  const { target } = readConfig(config);
  return Object.values(totals).some((t) => t >= target);
}

/** Short, glanceable summary of a recorded hand for the history table. */
export function describeHand(
  input: GinRummyInput | undefined,
  players: readonly { id: ID; name: string }[],
  deltas: Record<ID, number> = {},
): string {
  if (!input?.knockerId) return 'Hand not recorded';
  const name = (id: ID | null): string =>
    (id != null && players.find((p) => p.id === id)?.name) || '?';
  const knocker = name(input.knockerId);
  const opponentId = opponentOf(players, input.knockerId);

  if (input.gin) {
    return `💅 ${knocker} went gin! +${deltas[input.knockerId] ?? 0}`;
  }
  const opponentDeadwood = whole(input.deadwood?.[opponentId ?? '']);
  const knockerDeadwood = whole(input.deadwood?.[input.knockerId]);
  if (opponentDeadwood > knockerDeadwood) {
    return `🚪 ${knocker} knocked — +${deltas[input.knockerId] ?? 0}`;
  }
  return `🔁 ${knocker} knocked and got undercut by ${name(opponentId)} — +${deltas[opponentId ?? ''] ?? 0}`;
}
