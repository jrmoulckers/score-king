import type { ID, Player, Round } from '../../types';

/**
 * Dominion — the deck-building end-game scorer.
 * ----------------------------------------------
 * Dominion (Rio Grande Games / Donald X. Vaccarino, 2008) ends the moment the Province
 * pile empties (or any three Supply piles do). Every player then totals the Victory
 * Points across every card in their entire deck — draw pile, discard, hand, everywhere —
 * and the highest total wins. This module is the pure, Svelte-free scoring core, mirroring
 * Finspan's end-game-category shape: one final scoresheet per played game, summed to a
 * total. `dominion.test.ts` exercises the real math without importing the editor.
 *
 * Official Victory Point values (base game):
 *   Estate   =  1 VP each
 *   Duchy    =  3 VP each
 *   Province =  6 VP each
 *   Curse    = -1 VP each
 *   Gardens  =  1 VP per 10 cards in your deck, rounded down (e.g. 34 cards = 3 VP each)
 * Everything else — Colonies, Duke, Fairgrounds, and every other kingdom/variable
 * victory card across the many expansions — is free-form "Other VP", entered directly.
 *
 * Official tie-break: the tied player who has taken the fewest turns wins; if that's
 * still tied, they share the victory. Score King records turns taken per player so the
 * table can apply that tie-break themselves, but (like every game here) ties in the
 * recorded VP total are shared rather than auto-resolved from a field outside the score.
 */

/** Base-game Victory Point values, per card. */
export const VP = {
  estate: 1,
  duchy: 3,
  province: 6,
  curse: -1,
} as const;

/** Per-player row: raw counts entered on the scoresheet. */
export interface DominionRow {
  /** Estate cards owned — 1 VP each. */
  estates: number;
  /** Duchy cards owned — 3 VP each. */
  duchies: number;
  /** Province cards owned — 6 VP each. */
  provinces: number;
  /** Curse cards owned — -1 VP each. */
  curses: number;
  /** Gardens cards owned — 1 VP per 10 cards in the deck, each. */
  gardens: number;
  /** Total cards in the whole deck (draw pile + discard + hand + play area). Only used for Gardens. */
  deckSize: number;
  /** Free-form VP from every other victory/kingdom card (Colonies, Duke, Fairgrounds, etc). */
  otherVP: number;
  /** Optional: turns taken, recorded for the official fewest-turns tie-break. Not scored. */
  turns: number;
}

export interface DominionInput {
  /** player id -> their scoresheet row. */
  values: Record<ID, DominionRow>;
}

/** A fresh, all-zero row. */
export function emptyRow(): DominionRow {
  return {
    estates: 0,
    duchies: 0,
    provinces: 0,
    curses: 0,
    gardens: 0,
    deckSize: 0,
    otherVP: 0,
    turns: 0,
  };
}

/** A fresh scoresheet for the given players. */
export function emptyInput(players: Player[]): DominionInput {
  return { values: Object.fromEntries(players.map((p) => [p.id, emptyRow()])) };
}

/** Coerce any stored value to a finite number (0 when blank / NaN). */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** VP each Gardens card is worth for a given deck size: 1 per 10 cards, rounded down. */
export function gardensValue(deckSize: unknown): number {
  return Math.floor(Math.max(0, num(deckSize)) / 10);
}

/** Total points a single row's Gardens cards contribute. */
export function gardensPoints(row: DominionRow | undefined): number {
  if (!row) return 0;
  return num(row.gardens) * gardensValue(row.deckSize);
}

/** Total VP for one player's row. */
export function scoreRow(row: DominionRow | undefined): number {
  if (!row) return 0;
  return (
    num(row.estates) * VP.estate +
    num(row.duchies) * VP.duchy +
    num(row.provinces) * VP.province +
    num(row.curses) * VP.curse +
    gardensPoints(row) +
    num(row.otherVP)
  );
}

/** Per-player VP totals for the whole scoresheet. */
export function scoreDominion(
  input: DominionInput | undefined,
  players: Player[],
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const p of players) out[p.id] = scoreRow(input?.values?.[p.id]);
  return out;
}

/** Fields that must be whole, non-negative numbers (card/turn counts). */
const COUNT_FIELDS: { key: keyof DominionRow; label: string }[] = [
  { key: 'estates', label: 'Estates' },
  { key: 'duchies', label: 'Duchies' },
  { key: 'provinces', label: 'Provinces' },
  { key: 'curses', label: 'Curses' },
  { key: 'gardens', label: 'Gardens' },
  { key: 'deckSize', label: 'Deck size' },
  { key: 'turns', label: 'Turns taken' },
];

/**
 * Validate the sheet. Card/turn counts must be whole and non-negative; "Other VP" may be
 * any whole number (some kingdom cards, like embargo tokens, subtract VP). Null when valid.
 */
export function validateDominion(
  input: DominionInput | undefined,
  players: Player[],
): string | null {
  if (!input?.values) return null;
  for (const p of players) {
    const row = input.values[p.id];
    if (!row) continue;
    for (const f of COUNT_FIELDS) {
      const n = Number(row[f.key]);
      if (!Number.isFinite(n)) continue; // blank -> treated as 0, like scoreRow
      if (n < 0) return `${p.name}: ${f.label} can't be negative.`;
      if (!Number.isInteger(n)) return `${p.name}: ${f.label} must be a whole number.`;
    }
    const other = Number(row.otherVP);
    if (Number.isFinite(other) && !Number.isInteger(other)) {
      return `${p.name}: Other VP must be a whole number.`;
    }
  }
  return null;
}

/** A concise per-player summary of the recorded scoresheet for the history table. */
export function describeDominion(round: Round, players: Player[]): string {
  const input = round.input as DominionInput | undefined;
  if (!input?.values) return '';
  const parts: string[] = [];
  for (const p of players) {
    if (input.values[p.id]) parts.push(`${p.name} ${scoreRow(input.values[p.id])}`);
  }
  return parts.length ? parts.join(' · ') : 'no score';
}

/** Reference text for the in-game help popover — official VP values, fully spelled out. */
export const DOMINION_HELP = [
  'Total your deck when the game ends — most Victory Points wins. 🏰',
  '',
  'Estate 🟩: 1 VP each.',
  'Duchy 🏠: 3 VP each.',
  'Province ⭐: 6 VP each.',
  'Curse 💀: -1 VP each.',
  'Gardens 🌿: 1 VP per 10 cards in your whole deck, rounded down, per Gardens you own',
  '  (e.g. a 34-card deck makes each Gardens worth 3 VP).',
  'Other VP: every other victory or kingdom card — Colonies, Duke, Fairgrounds, and',
  '  anything else your expansions bring. Enter its total directly (can be negative,',
  '  e.g. embargo tokens).',
  '',
  'Count every card in your deck for this: draw pile, discard, hand, everywhere.',
  '',
  "Tie? The official rule is fewest turns taken wins — that's why there's a Turns",
  'field. Score King still shares the win when VP ties; use the recorded turns to',
  'settle it at the table.',
].join('\n');
