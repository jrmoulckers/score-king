import type { ID, RoundContext } from '../../types';

/**
 * Pure, Svelte-free Skull King scoring. Kept isolated from the editor so the
 * whole bid/trick/bounty model is independently unit-testable and safe for the
 * engine (and stats) to import. No I/O, no DOM.
 */

/** The five capture bounties, straight from the game's own reference (2021 edition). */
export const BONUS_VALUES = {
  /** Each standard 14 (yellow / green / purple) you capture. */
  fourteen: 10,
  /** The black 14 — the Jolly Roger. */
  jollyRoger: 20,
  /** Each Pirate the Skull King captures. */
  pirate: 30,
  /** A Mermaid capturing the Skull King. */
  mermaidCatchesSK: 40,
  /** The Skull King capturing a Mermaid. */
  skOverMermaid: 50,
} as const;

/** How many of each capture there can plausibly be in one trick/round. */
export const BOUNTY_LIMITS = {
  /** Three coloured 14s (yellow, green, purple). */
  fourteens: 3,
  /** Five Pirates in a standard deck (Tigress can play as a sixth). */
  pirates: 6,
} as const;

/** A structured breakdown of a player's captured bounty for one round. */
export interface SKBounty {
  /** Count of standard (coloured) 14s captured. */
  fourteens: number;
  /** Captured the black 14 (Jolly Roger). */
  jollyRoger: boolean;
  /** Count of Pirates the player's Skull King captured. */
  pirates: number;
  /** A Mermaid captured this player's Skull King. */
  mermaidCatchesSK: boolean;
  /** This player's Skull King captured a Mermaid. */
  skOverMermaid: boolean;
  /** Edition-variance / house-rule extra, entered by hand. */
  manual: number;
}

export interface SKRow {
  bid: number;
  actual: number;
  /**
   * Effective bonus total for the round — the single value scoring uses. Kept as
   * a plain number so rounds saved before the structured builder existed still
   * score and render unchanged.
   */
  bonus: number;
  /**
   * Structured breakdown behind {@link bonus}. Optional: legacy rounds omit it and
   * fall back to their numeric {@link bonus} (surfaced as a manual entry in the UI).
   */
  bounty?: SKBounty;
}

export interface SKInput {
  rows: Record<ID, SKRow>;
}

export interface SKConfig {
  rounds: number;
  bonusesRequireBid: boolean;
}

/** A fresh, empty structured bounty. */
export function emptyBounty(): SKBounty {
  return {
    fourteens: 0,
    jollyRoger: false,
    pirates: 0,
    mermaidCatchesSK: false,
    skOverMermaid: false,
    manual: 0,
  };
}

/** Sum a structured bounty into points. */
export function bountyTotal(b: SKBounty | undefined): number {
  if (!b) return 0;
  const fourteens = Math.max(0, Math.trunc(Number(b.fourteens) || 0));
  const pirates = Math.max(0, Math.trunc(Number(b.pirates) || 0));
  const manual = Math.trunc(Number(b.manual) || 0);
  return (
    fourteens * BONUS_VALUES.fourteen +
    (b.jollyRoger ? BONUS_VALUES.jollyRoger : 0) +
    pirates * BONUS_VALUES.pirate +
    (b.mermaidCatchesSK ? BONUS_VALUES.mermaidCatchesSK : 0) +
    (b.skOverMermaid ? BONUS_VALUES.skOverMermaid : 0) +
    manual
  );
}

/**
 * The bonus points a row contributes — the structured bounty when present,
 * otherwise the row's stored numeric {@link SKRow.bonus} (legacy rounds).
 */
export function effectiveBonus(row: SKRow): number {
  return row.bounty ? bountyTotal(row.bounty) : Number(row.bonus) || 0;
}

/** Read + coerce the game config. */
export function readConfig(config: Record<string, unknown>): SKConfig {
  const rounds = Math.max(1, Math.min(10, Math.trunc(Number(config.rounds) || 10)));
  return { rounds, bonusesRequireBid: config.bonusesRequireBid !== false };
}

/** Whether a row's bid was met exactly. */
export function madeBid(row: SKRow): boolean {
  return (Number(row.actual) || 0) === (Number(row.bid) || 0);
}

/** Score a single player's row. Round n has n tricks. */
export function scoreRow(row: SKRow, n: number, bonusesRequireBid: boolean): number {
  const bid = Number(row.bid) || 0;
  const actual = Number(row.actual) || 0;
  const made = actual === bid;
  let pts: number;
  if (bid === 0) {
    pts = made ? 10 * n : -10 * n;
  } else {
    pts = made ? 20 * bid : -10 * Math.abs(actual - bid);
  }
  const bonus = effectiveBonus(row);
  if (bonus && (!bonusesRequireBid || made)) pts += bonus;
  return pts;
}

/** Null when valid, otherwise a human-readable error. */
export function validateSkullKing(input: SKInput, ctx: RoundContext): string | null {
  const n = ctx.roundIndex + 1;
  let won = 0;
  for (const p of ctx.players) {
    const row = input.rows[p.id];
    if (!row) continue;
    if (row.bid < 0 || row.bid > n) return `${p.name}: bid must be between 0 and ${n}.`;
    if (row.actual < 0 || row.actual > n)
      return `${p.name}: tricks won must be between 0 and ${n}.`;
    won += Number(row.actual) || 0;
  }
  if (won > n) return `Total tricks won (${won}) can't exceed the ${n} available this round.`;
  return null;
}

/** A short thematic read on how a row's bid is landing, for at-a-glance delight. */
export interface SKOutcome {
  /** 'hit' met the bid, 'zero' survived a 0-bid, 'miss' blew it, 'idle' bid 0 with nothing yet. */
  kind: 'hit' | 'zero' | 'miss' | 'idle';
  label: string;
  emoji: string;
}

export function outcomeLabel(row: SKRow, n: number): SKOutcome {
  const bid = Number(row.bid) || 0;
  const actual = Number(row.actual) || 0;
  const made = actual === bid;
  if (bid === 0 && actual === 0) {
    // A pledged-and-standing zero bid: still clean, worth 10 × round if it holds.
    return { kind: 'idle', label: `Sworn to take none · +${10 * n} if it holds`, emoji: '🫙' };
  }
  if (made && bid === 0) return { kind: 'zero', label: 'Slipped away clean!', emoji: '🕊️' };
  if (made) return { kind: 'hit', label: 'Nailed the bid!', emoji: '🎯' };
  const off = Math.abs(actual - bid);
  if (bid === 0) return { kind: 'miss', label: 'Oath broken — overboard', emoji: '🌊' };
  return {
    kind: 'miss',
    label: `Off by ${off} — walk the plank`,
    emoji: '🪝',
  };
}

/** A thematic name for each leg of the 10-round voyage. */
export function legName(n: number, total: number): string {
  if (n === total) return "The Skull King's Gauntlet";
  const names = [
    'Setting Sail',
    'Open Water',
    'Rough Seas',
    'Hidden Cove',
    'Cannon Fire',
    'The Kraken Stirs',
    'Ghost Ship',
    'Treasure Isle',
    'The Reckoning',
    'Final Plunder',
  ];
  return names[n - 1] ?? `Leg ${n}`;
}
