import type { ID } from '../../types';

/**
 * Hearts scoring — pure, Svelte-free. Everything the module and its tests need to
 * turn a round's recorded hearts / ♠Q / ♦J into per-player point deltas lives here,
 * so a `*.test.ts` can exercise the real scoring without pulling in the round editor.
 *
 * Lower is better. A hand deals 26 penalty points: 13 hearts (1 each) + the Queen of
 * Spades (13). The optional **Omnibus** variant adds the Jack of Diamonds as a −10
 * *bonus* card. **Shooting the moon** — one player takes all 13 hearts *and* the ♠Q —
 * flips the round: either everyone else takes +26, or the shooter takes −26.
 */

export type MoonRule = 'add26' | 'subtract';

export interface HeartsInput {
  hearts: Record<ID, number>;
  queen: ID | null;
  jack: ID | null;
}

export interface HeartsConfig {
  endScore: number;
  variantJack: boolean;
  moonRule: MoonRule;
}

/** Total hearts that must be accounted for each hand. */
export const HEARTS_TOTAL = 13;
/** The Queen of Spades penalty. */
export const QUEEN_POINTS = 13;
/** The Jack of Diamonds bonus (Omnibus variant). */
export const JACK_POINTS = 10;
/** Penalty points redistributed when the moon is shot. */
export const MOON_POINTS = 26;

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function readConfig(config: Record<string, unknown> = {}): HeartsConfig {
  return {
    endScore: Math.max(1, numOr(config.endScore, 100)),
    variantJack: !!config.variantJack,
    moonRule: config.moonRule === 'subtract' ? 'subtract' : 'add26',
  };
}

export function emptyInput(players: readonly { id: ID }[]): HeartsInput {
  return {
    hearts: Object.fromEntries(players.map((p) => [p.id, 0])),
    queen: null,
    jack: null,
  };
}

/** Total hearts assigned across the table this hand. */
export function totalHearts(input: HeartsInput): number {
  return Object.values(input?.hearts ?? {}).reduce((a, b) => a + numOr(b, 0), 0);
}

/**
 * Who shot the moon this hand — the single player holding all 13 hearts *and* the ♠Q —
 * or null when no one did.
 */
export function shooter(input: HeartsInput): ID | null {
  for (const [id, h] of Object.entries(input?.hearts ?? {})) {
    if (numOr(h, 0) === HEARTS_TOTAL && input.queen === id) return id;
  }
  return null;
}

/** A player's raw penalty before any moon redistribution (hearts + ♠Q − ♦J). */
function baseScore(input: HeartsInput, id: ID, variantJack: boolean): number {
  return (
    numOr(input.hearts[id], 0) +
    (input.queen === id ? QUEEN_POINTS : 0) -
    (variantJack && input.jack === id ? JACK_POINTS : 0)
  );
}

/** Per-player deltas for one hand. */
export function scoreRound(
  input: HeartsInput,
  players: readonly { id: ID }[],
  config: Record<string, unknown>,
): Record<ID, number> {
  const cfg = readConfig(config);
  const moon = shooter(input);

  const out: Record<ID, number> = {};
  for (const p of players) {
    const base = baseScore(input, p.id, cfg.variantJack);
    if (!moon) {
      out[p.id] = base;
    } else if (p.id === moon) {
      // The moon replaces the shooter's hearts+♠Q with 0 (or −26). The ♦J is a
      // separate bonus card, so it still applies if the shooter also took it.
      const jackHeld = cfg.variantJack && input.jack === moon ? JACK_POINTS : 0;
      out[p.id] = (cfg.moonRule === 'subtract' ? -MOON_POINTS : 0) - jackHeld;
    } else {
      // Non-shooters keep their own ♦J bonus (already folded into base) and, under
      // the classic rule, take +26.
      out[p.id] = cfg.moonRule === 'subtract' ? base : base + MOON_POINTS;
    }
  }
  return out;
}

/** Validate one hand. Returns null when good, else a friendly message. */
export function validateRound(
  input: HeartsInput,
  players: readonly { id: ID; name: string }[],
  config: Record<string, unknown>,
): string | null {
  const cfg = readConfig(config);
  for (const p of players) {
    const h = numOr(input?.hearts?.[p.id], 0);
    if (h < 0 || h > HEARTS_TOTAL) return `${p.name}: hearts must be between 0 and ${HEARTS_TOTAL}.`;
    if (!Number.isInteger(h)) return `${p.name}: hearts must be a whole number.`;
  }
  const total = totalHearts(input);
  if (total !== HEARTS_TOTAL) return `Hearts must total ${HEARTS_TOTAL} (currently ${total}).`;
  if (!input.queen) return 'Assign the Queen of Spades (♠Q) to whoever took it.';
  if (cfg.variantJack && !input.jack) {
    return 'Assign the Jack of Diamonds (♦J) to whoever took it.';
  }
  return null;
}

/** Whether any player has reached the end score. */
export function isFinished(totals: Record<ID, number>, config: Record<string, unknown>): boolean {
  const end = readConfig(config).endScore;
  return Object.values(totals).some((t) => t >= end);
}
