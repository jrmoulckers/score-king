import type { ID } from '../../types';

/**
 * Hearts scoring — pure, Svelte-free. Everything the module, its editor, and its
 * tests need to turn a recorded round into per-player point deltas lives here.
 *
 * Each round distributes the 13 hearts (♥ = 1 pt each) plus the Queen of Spades
 * (♠Q = 13 pts) — 26 penalty points in all. Lower is better: you're dodging
 * points, not chasing them. "Shooting the moon" is the reversal — take *all* 26
 * (every heart and the Queen) and, instead of eating 26, you either hand everyone
 * else 26 or subtract 26 from yourself. The optional Omnibus variant adds the
 * Jack of Diamonds (♦J = −10), a good card worth grabbing.
 */

export interface HeartsInput {
  /** Hearts taken this round, by player id. Must sum to 13 for a valid round. */
  hearts: Record<ID, number>;
  /** Who took the Queen of Spades (♠Q, +13). */
  queen: ID | null;
  /** Who took the Jack of Diamonds (♦J, −10) — Omnibus variant only. */
  jack: ID | null;
}

export type MoonRule = 'add26' | 'subtract';

export interface HeartsConfig {
  endScore: number;
  variantJack: boolean;
  moonRule: MoonRule;
}

export const DEFAULT_CONFIG: HeartsConfig = {
  endScore: 100,
  variantJack: false,
  moonRule: 'add26',
};

/** Points in play each round: 13 hearts + the ♠Q. */
export const HEARTS_TOTAL = 13;
export const QUEEN_POINTS = 13;
export const JACK_POINTS = 10;
export const MOON_POINTS = 26;

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function readConfig(config: Record<string, unknown> = {}): HeartsConfig {
  const moon = config.moonRule === 'subtract' ? 'subtract' : 'add26';
  return {
    endScore: numOr(config.endScore, DEFAULT_CONFIG.endScore),
    variantJack: !!config.variantJack,
    moonRule: moon,
  };
}

/** A fresh, empty round with every player on zero hearts and no cards claimed. */
export function emptyInput(playerIds: readonly ID[]): HeartsInput {
  return {
    hearts: Object.fromEntries(playerIds.map((id) => [id, 0])),
    queen: null,
    jack: null,
  };
}

/** Hearts placed so far this round. */
export function heartsTotal(input: HeartsInput): number {
  return Object.values(input.hearts).reduce((a, b) => a + (numOr(b, 0) || 0), 0);
}

/** Hearts still waiting to be assigned (never negative). */
export function heartsRemaining(input: HeartsInput): number {
  return Math.max(0, HEARTS_TOTAL - heartsTotal(input));
}

/**
 * Who shot the moon this round: took every heart (all 13) *and* the Queen.
 * Returns their id, or null when nobody swept the board.
 */
export function shooter(input: HeartsInput): ID | null {
  for (const [id, h] of Object.entries(input.hearts)) {
    if ((numOr(h, 0) || 0) === HEARTS_TOTAL && input.queen === id) return id;
  }
  return null;
}

/**
 * The raw penalty a single player takes this round *before* any moon reversal:
 * their hearts, plus 13 if they hold the Queen, minus 10 if they hold the Jack
 * (Omnibus only). This is the number to preview per row while entering.
 */
export function baseDelta(
  input: HeartsInput,
  id: ID,
  cfg: HeartsConfig,
): number {
  return (
    (numOr(input.hearts[id], 0) || 0) +
    (input.queen === id ? QUEEN_POINTS : 0) -
    (cfg.variantJack && input.jack === id ? JACK_POINTS : 0)
  );
}

/**
 * Per-player point deltas for a round, applying the moon reversal when someone
 * swept the board. Pure — the module's `scoreRound` delegates straight to this.
 */
export function scoreRound(
  input: HeartsInput,
  playerIds: readonly ID[],
  config: Record<string, unknown>,
): Record<ID, number> {
  const cfg = readConfig(config);
  const base: Record<ID, number> = {};
  for (const id of playerIds) base[id] = baseDelta(input, id, cfg);

  const moon = shooter(input);
  if (!moon) return base;

  const out: Record<ID, number> = {};
  for (const id of playerIds) {
    if (cfg.moonRule === 'subtract') {
      out[id] = id === moon ? -MOON_POINTS : base[id];
    } else {
      out[id] = id === moon ? 0 : base[id] + MOON_POINTS;
    }
  }
  return out;
}

/**
 * The delta a single player will take this round *after* the moon reversal — the
 * exact number to preview next to their name as the round is entered.
 */
export function previewDelta(
  input: HeartsInput,
  id: ID,
  playerIds: readonly ID[],
  config: Record<string, unknown>,
): number {
  return scoreRound(input, playerIds, config)[id] ?? 0;
}

/** Validate a round. Null when good, else a friendly, specific message. */
export function validateRound(
  input: HeartsInput,
  players: readonly { id: ID; name: string }[],
  config: Record<string, unknown>,
): string | null {
  const cfg = readConfig(config);
  const total = heartsTotal(input);
  if (total !== HEARTS_TOTAL) {
    const left = HEARTS_TOTAL - total;
    return left > 0
      ? `${left} more heart${left === 1 ? '' : 's'} to place (hearts must total 13).`
      : `That's ${-left} too many hearts (they must total 13).`;
  }
  if (!input.queen) return 'Assign the Queen of Spades (♠Q) to whoever took her.';
  if (cfg.variantJack && !input.jack) {
    return 'Assign the Jack of Diamonds (♦J) to whoever took it.';
  }
  return null;
}

export type OutcomeKind = 'moon' | 'lady' | 'clean' | 'points';

export interface Outcome {
  kind: OutcomeKind;
  emoji: string;
  label: string;
}

/**
 * A one-glance read of how a player fared this round, for the outcome tag beside
 * their preview. Co-signals with the numeric delta (never color alone): a moon,
 * eating the Lady, a spotless dodge, or an ordinary points haul.
 */
export function outcomeFor(
  input: HeartsInput,
  id: ID,
  playerIds: readonly ID[],
  config: Record<string, unknown>,
): Outcome {
  const moon = shooter(input);
  if (moon) {
    return id === moon
      ? { kind: 'moon', emoji: '🌙', label: 'shot the moon' }
      : { kind: 'points', emoji: '☄️', label: 'mooned' };
  }
  const delta = previewDelta(input, id, playerIds, config);
  if (input.queen === id) return { kind: 'lady', emoji: '💔', label: 'took the Lady' };
  if (delta <= 0) return { kind: 'clean', emoji: '😇', label: 'clean' };
  return { kind: 'points', emoji: '♥️', label: `+${delta}` };
}

/** True when any player has reached the end score and the game can wrap. */
export function isFinished(
  totals: Record<ID, number>,
  config: Record<string, unknown>,
): boolean {
  const end = readConfig(config).endScore;
  return Object.values(totals).some((t) => t >= end);
}
