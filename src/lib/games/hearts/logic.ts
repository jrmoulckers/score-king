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
  /**
   * The shooter's pick for how a moon scores *this* round, overriding the game's
   * default `moonRule`. Only meaningful when someone shot the moon; absent on
   * ordinary rounds and on games saved before per-round choice existed.
   */
  moonRule?: MoonRule;
}

export type MoonRule = 'add26' | 'subtract';

export interface HeartsConfig {
  endScore: number;
  variantJack: boolean;
  moonRule: MoonRule;
  /** Show the rotating pass direction each hand (left → right → across → hold). */
  passing: boolean;
}

export const DEFAULT_CONFIG: HeartsConfig = {
  endScore: 100,
  variantJack: false,
  moonRule: 'add26',
  passing: true,
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
    // Default on (standard Hearts passes); only an explicit `false` turns it off,
    // so games saved before this option existed still show the ritual.
    passing: config.passing !== false,
  };
}

// ── Passing ritual ───────────────────────────────────────────────────────────
// Hearts' signature rhythm: before each deal you pass 3 cards, and the direction
// rotates hand to hand. Purely informational (it never touches scoring) — the app
// just reminds the table which way the cards go this deal, because everyone forgets.

export type PassDirection = 'left' | 'right' | 'across' | 'hold';

export interface PassInfo {
  direction: PassDirection;
  /** A co-signal glyph (never color alone) — an arrow, or a raised hand for a hold. */
  glyph: string;
  /** Short label, e.g. "Pass left" / "Hold — no pass". */
  label: string;
  /** One-line reminder of who receives your three cards this deal. */
  hint: string;
}

const PASS_META: Record<PassDirection, Omit<PassInfo, 'direction'>> = {
  left: { glyph: '←', label: 'Pass left', hint: 'Pass 3 cards to the player on your left' },
  right: { glyph: '→', label: 'Pass right', hint: 'Pass 3 cards to the player on your right' },
  across: { glyph: '↔', label: 'Pass across', hint: 'Pass 3 cards to the player across from you' },
  hold: { glyph: '✋', label: 'Hold — no pass', hint: 'Keep your hand — no passing this deal' },
};

/**
 * The passing cycle for a table of `playerCount`. Four-handed Hearts is the
 * canonical left → right → across → hold; with any other count "across" has no
 * clean seat, so we honestly drop it to left → right → hold.
 */
export function passCycle(playerCount: number): PassDirection[] {
  return playerCount === 4
    ? ['left', 'right', 'across', 'hold']
    : ['left', 'right', 'hold'];
}

/** Which way cards pass on a given (0-based) hand, for a given table size. */
export function passingFor(handIndex: number, playerCount: number): PassInfo {
  const cycle = passCycle(playerCount);
  const i = (((handIndex % cycle.length) + cycle.length) % cycle.length) || 0;
  const direction = cycle[i];
  return { direction, ...PASS_META[direction] };
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

  // The shooter may flip how the moon scores this round; fall back to the game
  // default when the round carries no explicit choice.
  const rule: MoonRule =
    input.moonRule === 'subtract' || input.moonRule === 'add26' ? input.moonRule : cfg.moonRule;

  const out: Record<ID, number> = {};
  for (const id of playerIds) {
    if (rule === 'subtract') {
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
      ? `${left} more heart${left === 1 ? '' : 's'} to assign. Must total 26.`
      : `That's ${-left} too many heart${-left === 1 ? '' : 's'}. Must total 26.`;
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
 * eating the Queen, a spotless dodge, or an ordinary points haul.
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
  if (input.queen === id) return { kind: 'lady', emoji: '💔', label: 'took the Queen' };
  if (delta <= 0) return { kind: 'clean', emoji: '😇', label: 'clean' };
  return { kind: 'points', emoji: '♥️', label: `+${delta}` };
}

// ── Round storytelling ───────────────────────────────────────────────────────
// The history table remembers each hand as a single, evocative line. Lead with
// the drama — a moon, or the gut-punch "crashed moon" (went for all 26 and missed
// by one heart, eating 25) — otherwise name who took the Queen and how heavy their
// hand landed, with the ♦J noted when the Omnibus variant is in play.

/**
 * A compact one-liner summarizing a saved round, for the round history. Pure; the
 * module's `describeRound` just resolves ids to names through this.
 */
export function describeRound(
  input: HeartsInput,
  players: readonly { id: ID; name: string }[],
): string {
  const name = (id: ID | null) => players.find((p) => p.id === id)?.name ?? '?';
  if (!input?.hearts) return 'no cards';

  const moon = shooter(input);
  if (moon) return `🌙 ${name(moon)} shot the moon`;

  const heartsOf = (id: ID) => numOr(input.hearts[id], 0) || 0;
  const jackOn = input.jack != null;
  const pointsFor = (id: ID) =>
    heartsOf(id) +
    (input.queen === id ? QUEEN_POINTS : 0) -
    (jackOn && input.jack === id ? JACK_POINTS : 0);
  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  // Crashed a moon: took the Queen and all but one heart (25 points) — the whole
  // load bar a single card. The most-retold story at any Hearts table.
  if (input.queen && heartsOf(input.queen) >= HEARTS_TOTAL - 1) {
    return `☄️ ${name(input.queen)} crashed a moon — ${pointsFor(input.queen)}`;
  }

  const parts: string[] = [];
  if (input.queen) {
    parts.push(`💔 ${name(input.queen)} ${signed(pointsFor(input.queen))}`);
  } else {
    // No Queen on record (legacy/partial round): fall back to the heaviest pile.
    const top = [...players].sort((a, b) => heartsOf(b.id) - heartsOf(a.id))[0];
    if (top && heartsOf(top.id) > 0) return `♥️ ${name(top.id)} +${heartsOf(top.id)}`;
    return 'no points';
  }
  if (jackOn) parts.push(`♦J ${name(input.jack)}`);
  return parts.join(' · ');
}

/** True when any player has reached the end score and the game can wrap. */
export function isFinished(
  totals: Record<ID, number>,
  config: Record<string, unknown>,
): boolean {
  const end = readConfig(config).endScore;
  return Object.values(totals).some((t) => t >= end);
}

// ── Endgame tension ──────────────────────────────────────────────────────────
// Hearts ends the moment anyone reaches the end score — and because lower wins,
// the player with the *highest* total is the one racing to end everyone's game
// (while losing it). Surfacing how close that is turns the shoot-the-moon call
// into a real gamble: is a +26 swing worth it when someone's one hand from home?

export interface EndgameInfo {
  /** The score that ends the game (endScore from config). */
  end: number;
  /** The seat with the highest total — the one who'll trip the finish. Null if empty. */
  atRiskId: ID | null;
  /** That seat's current total (0 when there's no one / no points yet). */
  atRiskTotal: number;
  /** Points from the finish for that seat (end − highest), never negative. */
  toEnd: number;
  /** True once a single hand — a moon is worth 26 — could reach the end. */
  imminent: boolean;
  /** True when a seat has already hit the end: this game finishes on the next save. */
  reached: boolean;
}

/**
 * How close the game is to ending, computed from the standings *going into* a hand.
 * Pure; the editor maps `atRiskId` to a name for its endgame strip.
 */
export function endgameInfo(
  totals: Record<ID, number>,
  playerIds: readonly ID[],
  config: Record<string, unknown>,
): EndgameInfo {
  const end = readConfig(config).endScore;
  let atRiskId: ID | null = null;
  let atRiskTotal = 0;
  let seen = false;
  for (const id of playerIds) {
    const t = numOr(totals[id], 0) || 0;
    if (!seen || t > atRiskTotal) {
      atRiskTotal = t;
      atRiskId = id;
      seen = true;
    }
  }
  const toEnd = Math.max(0, end - atRiskTotal);
  return {
    end,
    atRiskId,
    atRiskTotal,
    toEnd,
    imminent: toEnd > 0 && toEnd <= MOON_POINTS,
    reached: seen && atRiskTotal >= end,
  };
}
