import type { ID, Round } from '../../types';

/**
 * Phase 10 scoring — pure and Svelte-free so it can be unit-tested directly and
 * reused by the editor for live previews.
 *
 * Each hand, every player either completes their current phase (and advances to
 * the next one) or doesn't (and repeats it next hand). The hand ends the instant
 * someone plays their last card ("goes out") — which requires having already
 * completed their phase that hand. Everyone else scores penalty points for the
 * cards left in their hand, whether or not they completed their own phase.
 *
 * A player's *phase* is not part of the per-round point delta the shell sums
 * into `totals` — it's a running state derived by replaying every hand's
 * `completed` flags in order (see {@link phasesAfter}), the same "replay the
 * whole history" shape Spades uses for bags and Stardew uses for evaluation
 * categories. That keeps `totals` a clean, honest points column (lower is
 * better, exactly like Hearts) while the phase ladder — the *real* win
 * condition — lives alongside it rather than being folded into the same number.
 */

/** The ten phases, in order, exactly as printed on the official card. */
export interface PhaseDef {
  number: number;
  label: string;
}

export const PHASES: readonly PhaseDef[] = [
  { number: 1, label: '2 sets of 3' },
  { number: 2, label: '1 set of 3 + 1 run of 4' },
  { number: 3, label: '1 set of 4 + 1 run of 4' },
  { number: 4, label: '1 run of 7' },
  { number: 5, label: '1 run of 8' },
  { number: 6, label: '1 run of 9' },
  { number: 7, label: '2 sets of 4' },
  { number: 8, label: '7 cards of one color' },
  { number: 9, label: '1 set of 5 + 1 set of 2' },
  { number: 10, label: '1 set of 5 + 1 set of 3' },
] as const;

export const PHASE_COUNT = PHASES.length;

/** Penalty points for one card left in hand, by kind (official card values). */
export const CARD_VALUE = {
  low: 5, // number cards 1–9
  high: 10, // number cards 10–12
  skip: 15, // Skip cards
  wild: 25, // Wild cards
} as const;

/**
 * A leftover hand tallied by card kind, so the editor can add cards the way you
 * actually read a fanned-out hand (by *kind*) instead of pre-summing points in
 * your head. Purely an entry convenience — {@link Phase10Input.penalty} is
 * always the authoritative scored value, kept in sync via {@link handValue}.
 */
export interface Phase10Hand {
  /** Count of number cards 1–9 left in hand. */
  low: number;
  /** Count of number cards 10–12 left in hand. */
  high: number;
  /** Count of Skip cards left in hand. */
  skip: number;
  /** Count of Wild cards left in hand. */
  wild: number;
}

export interface Phase10Input {
  /** Did this player complete their current phase this hand (and advance)? */
  completed: Record<ID, boolean>;
  /** Penalty points scored this hand for cards left in hand (0 for who went out). */
  penalty: Record<ID, number>;
  /** Optional per-kind breakdown behind each player's {@link penalty}. Editing aid only. */
  hands?: Record<ID, Phase10Hand>;
}

/** A fresh, empty per-kind hand (no cards counted yet). */
export function emptyHand(): Phase10Hand {
  return { low: 0, high: 0, skip: 0, wild: 0 };
}

/** Points a per-kind hand is worth given the official card values. Clamps to ≥ 0. */
export function handValue(hand: Phase10Hand | undefined): number {
  if (!hand) return 0;
  const low = Math.max(0, Number(hand.low) || 0);
  const high = Math.max(0, Number(hand.high) || 0);
  const skip = Math.max(0, Number(hand.skip) || 0);
  const wild = Math.max(0, Number(hand.wild) || 0);
  return low * CARD_VALUE.low + high * CARD_VALUE.high + skip * CARD_VALUE.skip + wild * CARD_VALUE.wild;
}

/** A fresh, zeroed round input for the current roster: nobody completed, no cards tallied. */
export function createPhase10Input(playerIds: ID[]): Phase10Input {
  return {
    completed: Object.fromEntries(playerIds.map((id) => [id, false])),
    penalty: Object.fromEntries(playerIds.map((id) => [id, 0])),
    hands: Object.fromEntries(playerIds.map((id) => [id, emptyHand()])),
  };
}

/** A player's scored penalty for this hand, clamped to a non-negative number. */
export function penaltyOf(input: Phase10Input, id: ID): number {
  return Math.max(0, Number(input.penalty[id]) || 0);
}

export function validatePhase10(
  input: Phase10Input,
  players: { id: ID; name: string }[],
): string | null {
  for (const p of players) {
    const raw = input.penalty[p.id];
    if (raw == null) continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) {
      return `${p.name}'s penalty points must be 0 or more.`;
    }
  }
  return null;
}

/** Compute per-player point deltas for a hand — just the tallied penalty points. */
export function scorePhase10(input: Phase10Input, playerIds: ID[]): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const id of playerIds) out[id] = penaltyOf(input, id);
  return out;
}

/**
 * Replay every recorded hand's `completed` flags to find each player's CURRENT
 * phase (1–10 while still playing; {@link PHASE_COUNT} + 1 once they've cleared
 * Phase 10 and won). Mirrors Spades' `bagCountsAfter` / Stardew's
 * `priorCategoryTotals` — the running, non-additive state a game needs beyond
 * the plain point sum the shell already tracks in `totals`.
 */
export function phasesAfter(rounds: readonly Round[], playerIds: readonly ID[]): Record<ID, number> {
  const phase: Record<ID, number> = {};
  for (const id of playerIds) phase[id] = 1;
  const sorted = [...rounds].sort((a, b) => a.index - b.index);
  for (const r of sorted) {
    const input = r.input as Phase10Input | undefined;
    if (!input?.completed) continue;
    for (const id of playerIds) {
      if (input.completed[id] && phase[id] <= PHASE_COUNT) phase[id] += 1;
    }
  }
  return phase;
}

/** Each player's phase strictly BEFORE the hand at `roundIndex` (0-based). */
export function phasesBefore(
  rounds: readonly Round[],
  roundIndex: number,
  playerIds: readonly ID[],
): Record<ID, number> {
  return phasesAfter(
    rounds.filter((r) => r.index < roundIndex),
    playerIds,
  );
}

/** True once a player has cleared Phase 10 (their phase count has run past it). */
export function hasWon(phase: number): boolean {
  return phase > PHASE_COUNT;
}

/** The label to show for a player's phase — "Phase N" while playing, or a win badge. */
export function phaseLabel(phase: number): string {
  if (hasWon(phase)) return '🏆 Phase 10 complete!';
  const def = PHASES[Math.min(Math.max(phase, 1), PHASE_COUNT) - 1];
  return `Phase ${phase} · ${def.label}`;
}

/** Game ends the instant any player's phase (after all recorded hands) clears Phase 10. */
export function isPhase10Finished(rounds: readonly Round[] | undefined, playerIds: readonly ID[]): boolean {
  const phases = phasesAfter(rounds ?? [], playerIds);
  return playerIds.some((id) => hasWon(phases[id]));
}

/**
 * Winner(s): whoever completed Phase 10 first. Normally exactly one player, but
 * the official rule allows a tie when more than one player clears Phase 10 in
 * the very same hand — broken by the lowest total points. Returns no winner
 * when the game was finished early, before anyone actually completed Phase 10.
 */
export function pickPhase10Winners(
  totals: Record<ID, number>,
  rounds: readonly Round[] | undefined,
): ID[] {
  const ids = Object.keys(totals);
  const phases = phasesAfter(rounds ?? [], ids);
  const finished = ids.filter((id) => hasWon(phases[id]));
  if (finished.length <= 1) return finished;
  const best = Math.min(...finished.map((id) => Number(totals[id]) || 0));
  return finished.filter((id) => (Number(totals[id]) || 0) === best);
}

export const PHASE10_HELP = [
  'Race through ten phases, in order. Complete your current phase this hand and',
  'you advance to the next one; miss it and you repeat the same phase next hand.',
  '',
  '1. Two sets of 3',
  '2. One set of 3 + one run of 4',
  '3. One set of 4 + one run of 4',
  '4. One run of 7',
  '5. One run of 8',
  '6. One run of 9',
  '7. Two sets of 4',
  '8. Seven cards of one color',
  '9. One set of 5 + one set of 2',
  '10. One set of 5 + one set of 3',
  '',
  'The hand ends the moment someone plays their last card ("goes out") — which',
  'requires having already completed their phase that hand. Everyone else scores',
  'penalty points for the cards left in hand:',
  '• Number cards 1–9 — 5 each',
  '• Number cards 10–12 — 10 each',
  '• Skip cards — 15 each',
  '• Wild cards — 25 each',
  '',
  'First to complete Phase 10 wins. Lowest total points breaks a tie between',
  'players who clear Phase 10 in the very same hand.',
].join('\n');
