import type { ID } from '../../types';

/**
 * Spades scoring — pure, Svelte-free. Everything the module and its tests need to
 * turn recorded bids + tricks into per-player point deltas lives here.
 *
 * A "unit" is whoever shares a score: a 2-player partnership, or a lone player in
 * cutthroat. A unit's contract is the sum of its members' numeric bids (a nil bids
 * for zero, so it adds nothing to the contract). Make the contract and you score
 * 10 × contract plus 1 per overtrick ("bag"); miss it and you lose 10 × contract.
 * Bags pile up across hands — every `bagThreshold` of them costs a flat 100 points.
 * Nil is scored on its own: ±100, or ±200 blind.
 */

/** How a player declared this hand: an ordinary numbered bid, Nil, or Blind Nil. */
export type NilKind = 'none' | 'nil' | 'blind';

export interface SpadesRow {
  /** Numbered bid. Ignored for the contract when {@link nil} isn't 'none'. */
  bid: number;
  /** Tricks actually taken this hand. */
  tricks: number;
  nil: NilKind;
}

export interface SpadesInput {
  rows: Record<ID, SpadesRow>;
}

export type PlayStyle = 'partners' | 'solo';

export interface SpadesConfig {
  mode: PlayStyle;
  target: number;
  nil: boolean;
  blindNil: boolean;
  sandbagging: boolean;
  bagThreshold: number;
}

export const DEFAULT_CONFIG: SpadesConfig = {
  mode: 'partners',
  target: 500,
  nil: true,
  blindNil: true,
  sandbagging: true,
  bagThreshold: 10,
};

/** Points gained/lost on a nil (index 0) and blind nil (index 1). */
export const NIL_POINTS = 100;
export const BLIND_NIL_POINTS = 200;
/** Flat penalty each time a unit's bags cross the threshold. */
export const BAG_PENALTY = 100;

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function readConfig(config: Record<string, unknown> = {}): SpadesConfig {
  return {
    mode: config.mode === 'solo' ? 'solo' : 'partners',
    target: numOr(config.target, DEFAULT_CONFIG.target),
    nil: config.nil !== false,
    blindNil: config.blindNil !== false,
    sandbagging: config.sandbagging !== false,
    bagThreshold: Math.max(1, Math.round(numOr(config.bagThreshold, DEFAULT_CONFIG.bagThreshold))),
  };
}

/** A fresh, unbid row. */
export function emptyRow(): SpadesRow {
  return { bid: 0, tricks: 0, nil: 'none' };
}

/**
 * Tricks in a hand. Four (or the cutthroat default) players play the full 52-card
 * deck for 13 tricks; the common three-hand deal removes the 2♣, dealing 17 each.
 */
export function tricksAvailable(playerCount: number): number {
  return playerCount === 3 ? 17 : 13;
}

/**
 * Effective play style. Partnerships need exactly four seats; with any other count
 * we fall back to solo so a game is never wedged into an impossible shape.
 */
export function resolveMode(config: Record<string, unknown>, playerCount: number): PlayStyle {
  return readConfig(config).mode === 'partners' && playerCount === 4 ? 'partners' : 'solo';
}

export interface Unit {
  key: string;
  /** 0-based order — Team 1 / Team 2, or a solo player's seat. */
  index: number;
  memberIds: ID[];
}

/**
 * Group seats into scoring units. Partnerships pair the seats you picked
 * adjacently: 1st + 2nd vs 3rd + 4th. Solo is one unit per seat.
 */
export function unitsFor(players: readonly { id: ID }[], mode: PlayStyle): Unit[] {
  if (mode === 'partners' && players.length === 4) {
    return [
      { key: 'team-1', index: 0, memberIds: [players[0].id, players[1].id] },
      { key: 'team-2', index: 1, memberIds: [players[2].id, players[3].id] },
    ];
  }
  return players.map((p, i) => ({ key: p.id, index: i, memberIds: [p.id] }));
}

function nilResult(row: SpadesRow, cfg: SpadesConfig): number {
  const took = numOr(row.tricks, 0);
  if (row.nil === 'blind' && cfg.blindNil) return took === 0 ? BLIND_NIL_POINTS : -BLIND_NIL_POINTS;
  if (row.nil === 'nil' || (row.nil === 'blind' && !cfg.blindNil)) {
    return took === 0 ? NIL_POINTS : -NIL_POINTS;
  }
  return 0;
}

export interface UnitHandResult {
  contract: number;
  tricks: number;
  made: boolean;
  /** ±10 × contract. */
  base: number;
  /** Overtricks earned this hand (0 when set). */
  bags: number;
  /** Sum of members' nil / blind-nil results. */
  nilPoints: number;
  bagsBefore: number;
  bagsAfter: number;
  /** How many times the bag threshold was crossed this hand. */
  penalties: number;
  /** ≤ 0 — the sandbag penalty applied this hand. */
  penaltyPoints: number;
  /** Total hand delta for the unit (mirrored onto every member). */
  score: number;
}

/**
 * Score one unit's hand given its members' rows and the bags it carried in.
 * Overtricks are worth +1 each *and* feed the running bag count; crossing the
 * threshold spends 100 points and rolls the remainder forward.
 */
export function scoreUnitHand(
  rows: readonly SpadesRow[],
  config: SpadesConfig,
  bagsBefore: number,
): UnitHandResult {
  let contract = 0;
  let tricks = 0;
  let nilPoints = 0;
  for (const row of rows) {
    tricks += numOr(row.tricks, 0);
    if (row.nil === 'none') contract += Math.max(0, numOr(row.bid, 0));
    nilPoints += nilResult(row, config);
  }

  const made = tricks >= contract;
  const base = made ? 10 * contract : -10 * contract;
  const bags = made ? tricks - contract : 0;

  const running = bagsBefore + bags;
  let penalties = 0;
  let bagsAfter = running;
  if (config.sandbagging && config.bagThreshold > 0) {
    penalties = Math.floor(running / config.bagThreshold);
    bagsAfter = running - penalties * config.bagThreshold;
  }
  const penaltyPoints = -BAG_PENALTY * penalties;
  const score = base + bags + nilPoints + penaltyPoints;

  return { contract, tricks, made, base, bags, nilPoints, bagsBefore, bagsAfter, penalties, penaltyPoints, score };
}

export interface RoundOutcome {
  perUnit: Record<string, UnitHandResult>;
  /** Per-player deltas — both partners receive the shared team score. */
  deltas: Record<ID, number>;
}

/**
 * Replay a whole game hand-by-hand, threading each unit's bag count through the
 * sequence. Scoring the current hand means replaying every earlier hand first,
 * because the sandbag penalty is a function of accumulated bags.
 */
export function scoreGame(
  inputs: readonly SpadesInput[],
  players: readonly { id: ID }[],
  config: Record<string, unknown>,
): RoundOutcome[] {
  const cfg = readConfig(config);
  const units = unitsFor(players, resolveMode(config, players.length));
  const counters = new Map<string, number>(units.map((u) => [u.key, 0]));
  const outcomes: RoundOutcome[] = [];

  for (const input of inputs) {
    const perUnit: Record<string, UnitHandResult> = {};
    const deltas: Record<ID, number> = {};
    for (const u of units) {
      const rows = u.memberIds.map((id) => input?.rows?.[id] ?? emptyRow());
      const res = scoreUnitHand(rows, cfg, counters.get(u.key) ?? 0);
      counters.set(u.key, res.bagsAfter);
      perUnit[u.key] = res;
      for (const id of u.memberIds) deltas[id] = res.score;
    }
    outcomes.push({ perUnit, deltas });
  }
  return outcomes;
}

/** Per-player deltas for the last hand of `inputs` (the one being entered/edited). */
export function scoreLatest(
  priorInputs: readonly SpadesInput[],
  current: SpadesInput,
  players: readonly { id: ID }[],
  config: Record<string, unknown>,
): Record<ID, number> {
  const outcomes = scoreGame([...priorInputs, current], players, config);
  return outcomes[outcomes.length - 1]?.deltas ?? {};
}

/** Bags each unit carries *into* the next hand after playing `inputs`. */
export function bagCountsAfter(
  inputs: readonly SpadesInput[],
  players: readonly { id: ID }[],
  config: Record<string, unknown>,
): Record<string, number> {
  const cfg = readConfig(config);
  const units = unitsFor(players, resolveMode(config, players.length));
  const counters: Record<string, number> = {};
  for (const u of units) counters[u.key] = 0;
  for (const input of inputs) {
    for (const u of units) {
      const rows = u.memberIds.map((id) => input?.rows?.[id] ?? emptyRow());
      counters[u.key] = scoreUnitHand(rows, cfg, counters[u.key]).bagsAfter;
    }
  }
  return counters;
}

/** Validate one hand. Returns null when good, else a friendly message. */
export function validateHand(
  input: SpadesInput,
  players: readonly { id: ID; name: string }[],
  config: Record<string, unknown>,
): string | null {
  const cfg = readConfig(config);
  const table = tricksAvailable(players.length);
  let totalTricks = 0;

  for (const p of players) {
    const row = input?.rows?.[p.id] ?? emptyRow();
    if (row.nil !== 'none' && !cfg.nil) return `Nil bids are turned off — clear ${p.name}'s nil.`;
    if (row.nil === 'blind' && !cfg.blindNil) return `Blind nil is turned off — clear ${p.name}'s blind nil.`;
    const bid = row.nil === 'none' ? numOr(row.bid, 0) : 0;
    if (bid < 0 || bid > table) return `${p.name}: bid must be between 0 and ${table}.`;
    const tricks = numOr(row.tricks, 0);
    if (tricks < 0 || tricks > table) return `${p.name}: tricks must be between 0 and ${table}.`;
    if (!Number.isInteger(tricks)) return `${p.name}: tricks must be a whole number.`;
    totalTricks += tricks;
  }

  if (totalTricks !== table) {
    return `Tricks must total ${table} (currently ${totalTricks}).`;
  }
  return null;
}

// ── UI-facing view helpers ───────────────────────────────────────────────────
// Small, pure derivations the Spades editor renders from. They add no scoring
// behaviour — they only shape numbers the components already have into the cues
// (danger levels, made/set status, target proximity) the costume needs, so those
// decisions stay unit-testable and out of the Svelte layer.

/** How hot a unit's bag pile is running toward the next −100 sandbag hit. */
export type BagDanger = 'calm' | 'heavy' | 'critical';

/**
 * Bags a unit must still collect before the next flat −100 penalty. `bagsAfter`
 * is the post-hand remainder (always 0..threshold-1 while sandbagging is on), so
 * this is simply the pips left in the current row. Returns Infinity when there is
 * no threshold to cross.
 */
export function bagsToPenalty(bagsAfter: number, threshold: number): number {
  if (threshold <= 0) return Infinity;
  const filled = ((bagsAfter % threshold) + threshold) % threshold;
  return threshold - filled;
}

/**
 * A three-step danger cue for the bag meter, co-signalled in the UI by words and
 * colour (never colour alone). `critical` the moment a penalty just fired or the
 * pile sits one bag from the hit; `heavy` from ~70% of the way there; else `calm`.
 */
export function bagDanger(bagsAfter: number, threshold: number, penaltiesThisHand = 0): BagDanger {
  if (penaltiesThisHand > 0) return 'critical';
  if (threshold <= 0) return 'calm';
  const filled = ((bagsAfter % threshold) + threshold) % threshold;
  if (threshold - filled <= 1) return 'critical';
  if (filled / threshold >= 0.7) return 'heavy';
  return 'calm';
}

/** Whether a unit made its contract this hand, and by how much. */
export interface ContractView {
  status: 'made' | 'set';
  /** Tricks still needed to make the contract (0 once made). */
  short: number;
  /** Overtricks beyond the contract this hand (0 when set). */
  over: number;
}

/** Live made/set view for a unit from its combined contract and tricks taken. */
export function contractView(contract: number, tricks: number): ContractView {
  const made = tricks >= contract;
  return {
    status: made ? 'made' : 'set',
    short: made ? 0 : contract - tricks,
    over: made ? tricks - contract : 0,
  };
}

/** A unit's standing relative to the winning target after this hand's projected delta. */
export interface TargetView {
  before: number;
  projected: number;
  target: number;
  /** True when the projected total reaches a positive target (this hand could win). */
  reaches: boolean;
  /** Points still needed after this hand to reach the target (0 once reached). */
  remaining: number;
}

/** Project a unit's total by `delta` and measure it against the winning `target`. */
export function targetView(before: number, delta: number, target: number): TargetView {
  const projected = before + delta;
  const reaches = target > 0 && projected >= target;
  return {
    before,
    projected,
    target,
    reaches,
    remaining: target > 0 ? Math.max(0, target - projected) : 0,
  };
}
