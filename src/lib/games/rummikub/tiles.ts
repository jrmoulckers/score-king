/**
 * Presentational-only tile palette for Rummikub's per-game costume. These are the classic
 * four Rummikub numeral colours printed on an ivory tile face — decorative accents contained
 * entirely to the rack / keypad / burst, never used to signal score, standing, or state (the
 * number on every tile always co-signals, so colour is never alone). Deliberately distinct
 * from the app's Royal Violet (Save) and Crown Gold (leader/winner), and kept off the exact
 * semantic good/bad tokens so a cream tile never reads as a win or a loss.
 */

/** The four numeral inks, in Rummikub's canonical order (black · red · blue · orange). */
export const TILE_INKS = ['#2c2e4d', '#c8384e', '#1f6feb', '#e07a1f'] as const;

/** The ivory tile face — a physical tile, readable in both themes. */
export const TILE_FACE = '#f4efe1';

/**
 * A stable ink for a numbered tile. Rummikub has a copy of every number in each colour, so
 * for display we simply cycle the four inks by value — enough variety to read as a colourful
 * rack while staying deterministic (same number, same colour, every render).
 */
export function tileInk(n: number): string {
  const i = ((Math.round(n) - 1) % TILE_INKS.length + TILE_INKS.length) % TILE_INKS.length;
  return TILE_INKS[i];
}
