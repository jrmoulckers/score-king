import type { ID, Player } from '../../types';

/**
 * Catan (Settlers of Catan) scoring — pure, Svelte-free. `index.ts`, `CatanEditor.svelte` and
 * `stats.ts` all import from here so the exact math the game plays is the exact math the tests
 * exercise.
 *
 * Real Catan victory points: a settlement is 1 VP, a city is 2 VP, each revealed Victory Point
 * development card is 1 VP, and the Longest Road and Largest Army cards are each worth 2 VP to
 * whoever currently holds them (at most one player per award, and an award can change hands
 * mid-game). First to the target — 10 VP in the base game, commonly 13 with the 5–6 player
 * expansion — wins immediately, even mid-turn.
 *
 * MODELING CHOICE: Catan isn't played in discrete "rounds" the way a card game is — a player's
 * board (settlements, cities, revealed dev-card VP, and who holds each award) can change on
 * anyone's turn, and VP dev cards are often kept secret until revealing one wins the game. The
 * cleanest fit for Score King's round contract (every {@link ../../types Round} stores a
 * per-player point DELTA) is a **live checkpoint**: each saved round is a snapshot of every
 * player's CURRENT board — an absolute count, not a change since last time — and
 * {@link scoreRound} reports `newTotal - before` as the delta the contract expects. That lets
 * the editor and history show natural, board-accurate numbers (e.g. "2 cities, 1 settlement")
 * while the stored deltas stay faithful to how every other module works.
 */

export interface CatanInput {
  /** Each player's current number of built settlements (1 VP each). Physical cap: 5. */
  settlements: Record<ID, number>;
  /** Each player's current number of built cities (2 VP each). Physical cap: 4. */
  cities: Record<ID, number>;
  /**
   * Victory Point development cards a player has revealed so far. Real VP cards are usually
   * kept secret until showing one wins the game — this only needs updating at that moment (or
   * whenever a player chooses to reveal one).
   */
  devVP: Record<ID, number>;
  /** Who currently holds the Longest Road card (2 VP) — at most one player, or none yet. */
  longestRoad: ID | null;
  /** Who currently holds the Largest Army card (2 VP) — at most one player, or none yet. */
  largestArmy: ID | null;
}

export interface CatanConfig {
  /** First to reach this many VP wins immediately. 10 is standard; 13 for 5–6 players. */
  targetVP: number;
}

export const DEFAULT_TARGET_VP = 10;
export const EXPANSION_TARGET_VP = 13;

/** Real physical piece/card limits, used to keep entries honest to the actual game. */
export const MAX_SETTLEMENTS = 5;
export const MAX_CITIES = 4;
/** The base deck carries exactly 5 Victory Point cards, so no one can reveal more than that. */
export const MAX_DEV_VP = 5;

export const SETTLEMENT_POINTS = 1;
export const CITY_POINTS = 2;
export const DEV_VP_POINTS = 1;
export const AWARD_POINTS = 2;

function numOr(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function readConfig(config: Record<string, unknown> = {}): CatanConfig {
  const targetVP = Math.trunc(numOr(config.targetVP, DEFAULT_TARGET_VP));
  return { targetVP: Math.max(3, targetVP) };
}

/** A fresh checkpoint: nobody has built anything yet and neither award is claimed. */
export function emptyInput(playerIds: readonly ID[]): CatanInput {
  return {
    settlements: Object.fromEntries(playerIds.map((id) => [id, 0])),
    cities: Object.fromEntries(playerIds.map((id) => [id, 0])),
    devVP: Object.fromEntries(playerIds.map((id) => [id, 0])),
    longestRoad: null,
    largestArmy: null,
  };
}

/**
 * A checkpoint that carries the previous one's board state forward, so editing the next update
 * starts from where the game actually is rather than a blank slate. Falls back to
 * {@link emptyInput} for the very first checkpoint.
 */
export function carryForward(
  playerIds: readonly ID[],
  previous: CatanInput | undefined,
): CatanInput {
  if (!previous) return emptyInput(playerIds);
  return {
    settlements: Object.fromEntries(playerIds.map((id) => [id, numOr(previous.settlements?.[id])])),
    cities: Object.fromEntries(playerIds.map((id) => [id, numOr(previous.cities?.[id])])),
    devVP: Object.fromEntries(playerIds.map((id) => [id, numOr(previous.devVP?.[id])])),
    longestRoad: playerIds.includes(previous.longestRoad ?? '') ? previous.longestRoad! : null,
    largestArmy: playerIds.includes(previous.largestArmy ?? '') ? previous.largestArmy! : null,
  };
}

/** One player's absolute victory-point total from a checkpoint's board state. */
export function vpFor(input: CatanInput, id: ID): number {
  const settlements = numOr(input.settlements?.[id]);
  const cities = numOr(input.cities?.[id]);
  const devVP = numOr(input.devVP?.[id]);
  const road = input.longestRoad === id ? AWARD_POINTS : 0;
  const army = input.largestArmy === id ? AWARD_POINTS : 0;
  return settlements * SETTLEMENT_POINTS + cities * CITY_POINTS + devVP * DEV_VP_POINTS + road + army;
}

/** Every player's absolute VP total for this checkpoint, keyed by player id. */
export function totalsFor(input: CatanInput, playerIds: readonly ID[]): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = vpFor(input, id);
  return out;
}

/**
 * Per-player point deltas for the round: each player's new absolute VP total minus their total
 * going into this checkpoint (`before`, i.e. `ctx.totals`). See the file-level comment for why a
 * checkpoint model reports deltas this way.
 */
export function scoreRound(
  input: CatanInput,
  playerIds: readonly ID[],
  before: Record<ID, number>,
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = vpFor(input, id) - numOr(before[id]);
  return out;
}

/** Validate a checkpoint. Null when good, else a friendly, specific message. */
export function validateRound(
  input: CatanInput,
  players: readonly Pick<Player, 'id' | 'name'>[],
): string | null {
  for (const p of players) {
    const settlements = numOr(input.settlements?.[p.id]);
    if (!Number.isInteger(settlements) || settlements < 0) {
      return `${p.name}: settlements can't be negative.`;
    }
    if (settlements > MAX_SETTLEMENTS) {
      return `${p.name}: only ${MAX_SETTLEMENTS} settlement pieces exist — build a city instead?`;
    }
    const cities = numOr(input.cities?.[p.id]);
    if (!Number.isInteger(cities) || cities < 0) {
      return `${p.name}: cities can't be negative.`;
    }
    if (cities > MAX_CITIES) {
      return `${p.name}: only ${MAX_CITIES} city pieces exist.`;
    }
    const devVP = numOr(input.devVP?.[p.id]);
    if (!Number.isInteger(devVP) || devVP < 0) {
      return `${p.name}: Victory Point cards can't be negative.`;
    }
    if (devVP > MAX_DEV_VP) {
      return `${p.name}: only ${MAX_DEV_VP} Victory Point cards exist in the deck.`;
    }
  }
  if (input.longestRoad && !players.some((p) => p.id === input.longestRoad)) {
    return 'Longest Road is assigned to someone who isn’t in this game.';
  }
  if (input.largestArmy && !players.some((p) => p.id === input.largestArmy)) {
    return 'Largest Army is assigned to someone who isn’t in this game.';
  }
  return null;
}

/** True once any player's total has reached the target — Catan ends the instant it does. */
export function isFinished(totals: Record<ID, number>, config: Record<string, unknown>): boolean {
  const { targetVP } = readConfig(config);
  return Object.values(totals).some((t) => t >= targetVP);
}

/** A compact one-liner for the round history: the leader and their VP total. */
export function describeRound(
  input: CatanInput | undefined,
  players: readonly Pick<Player, 'id' | 'name'>[],
): string {
  if (!input) return 'no update';
  const ids = players.map((p) => p.id);
  const totals = totalsFor(input, ids);
  const ranked = [...players].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0));
  const leader = ranked[0];
  if (!leader || (totals[leader.id] ?? 0) === 0) return 'no update';
  const total = totals[leader.id] ?? 0;
  const badges: string[] = [];
  if (input.longestRoad === leader.id) badges.push('🛣️ Longest Road');
  if (input.largestArmy === leader.id) badges.push('⚔️ Largest Army');
  const badge = badges.length ? ` (${badges.join(', ')})` : '';
  return `${leader.name} ${total} VP${badge}`;
}
