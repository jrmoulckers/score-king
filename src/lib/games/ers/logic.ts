import type { ID } from '../../types';

/**
 * Pure Egyptian Rat Screw (ERS) tracker logic — no Svelte, no I/O — so it can be exercised
 * directly by `ers.test.ts` and imported by both `index.ts` and the editor.
 *
 * ── Modeling a scoreless, winner-take-all card game inside the point-oriented GameModule ──
 * ERS has no running point score: a hand is played until one player has slapped and
 * challenged their way into holding the entire deck. So a *round is a hand*, and the only
 * thing worth recording is who won it. Each recorded hand awards its winner a single point;
 * everyone else gets zero. The "scoreboard" the table actually cares about — games won per
 * player — is exactly that running total, which doubles as a win/match tally. An optional
 * target ends the night once someone collects enough hands (0 = play until you call it).
 */

/** The editable draft for a single hand. */
export interface ErsInput {
  /** Who won this hand (collected the whole deck). Null while undecided. */
  winnerId: ID | null;
  /** Optional flavour: which slap or challenge sealed it ("sandwich!", "4-chance ace"). */
  note?: string;
}

/** Normalized, validated config the scorer actually runs on. */
export interface ErsConfig {
  /** Hands won needed to take the night (0 = no limit — play until you decide to stop). */
  target: number;
}

export const ERS_DEFAULTS: ErsConfig = { target: 3 };

/** Read a raw, possibly-untrusted config bag into a clean {@link ErsConfig}. */
export function readConfig(config: Record<string, unknown> | undefined): ErsConfig {
  const c = config ?? {};
  const target =
    c.target === undefined ? ERS_DEFAULTS.target : Math.max(0, Math.trunc(Number(c.target)) || 0);
  return { target };
}

/** A fresh, empty draft for the next hand. */
export function createErsInput(): ErsInput {
  return { winnerId: null, note: '' };
}

/** Validate a drafted hand. Returns null when valid, else a human-readable message. */
export function validateErs(input: ErsInput, playerIds: ID[]): string | null {
  if (!input.winnerId) return 'Tap the player who collected the whole deck.';
  if (!playerIds.includes(input.winnerId)) {
    return 'The recorded winner is not in this game.';
  }
  return null;
}

/** Per-player deltas: the hand's winner gets `1`, everyone else `0`. */
export function scoreErs(input: ErsInput, playerIds: ID[]): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = id === input.winnerId ? 1 : 0;
  return out;
}

/** The game ends once anyone reaches the target hand-win count (0 = never auto-ends). */
export function isErsFinished(
  totals: Record<ID, number>,
  config: Record<string, unknown> | undefined,
): boolean {
  const { target } = readConfig(config);
  if (target <= 0) return false;
  return Object.values(totals).some((t) => (Number(t) || 0) >= target);
}

/** How many more hands a player needs to reach the target. Null with no target or already there. */
export function handsRemaining(wins: number, target: number): number | null {
  if (!target || target <= 0) return null;
  const remaining = target - (Number(wins) || 0);
  return remaining > 0 ? remaining : null;
}

/** One-line history summary for a recorded hand. */
export function describeErs(
  input: ErsInput | undefined,
  players: { id: ID; name: string }[],
): string {
  if (!input?.winnerId) return 'Hand recorded';
  const name = players.find((p) => p.id === input.winnerId)?.name ?? 'Someone';
  const base = `🐀 ${name} took the deck`;
  return input.note ? `${base} — ${input.note}` : base;
}
