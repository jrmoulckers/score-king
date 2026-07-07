import { writable } from 'svelte/store';

/**
 * Crew nicknames — a device-local nicety, not part of the synced World.
 *
 * A "crew" is derived from who was at the table: every game sharing the same set of
 * players belongs to the same crew, keyed by a stable {@link crewSignature}. Because the
 * signature comes from the game's (synced) `playerIds`, the *grouping itself* reappears on
 * any device and after any restore — only the optional nickname a player gives that crew
 * ("The Regulars") is cosmetic.
 *
 * Deliberate v1 decision (device-local, explicitly not accidental): that nickname lives in
 * this device's localStorage, NOT in the synced World or the portable backup. Consequence,
 * stated plainly: a renamed crew's label does NOT come back after a backup/restore and does
 * NOT appear on a group's other devices — it degrades gracefully to the players' names.
 * The grouping still works everywhere; only the custom label is per-device. Chosen for v1
 * because it is fully additive (no DB migration, no touch to the shared sync surface) and it
 * avoids committing to cross-device merge semantics for a cosmetic field mid-overhaul.
 *
 * Two upgrade paths when we want the label to travel (a product call, deferred to the PO):
 *   1. Light — fold `crewNames` into portable settings (`BackupSettings`) so it rides the
 *      existing backup envelope. Caveat: settings restore is whole-map last-writer-wins, so
 *      concurrent renames on two devices would clobber rather than merge.
 *   2. Full — promote a Crew to a first-class synced World entity with `updatedAt` +
 *      tombstone, giving true per-entity LWW merge (needs a new object store / DB version).
 */

const KEY = 'sk_crews';

/**
 * Stable, order-independent id for a line-up: the player ids sorted and joined. Two games
 * with the same players collapse to the same signature regardless of seating order.
 */
export function crewSignature(playerIds: string[]): string {
  return [...playerIds].sort().join(',');
}

function load(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Map of crew signature → nickname. Absent/empty means "no nickname" (show the names). */
export const crewNames = writable<Record<string, string>>(load());

crewNames.subscribe((v) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // Best-effort: a full/blocked storage quota shouldn't break the library view.
  }
});

/** Name (or rename) a crew. An empty/blank name clears any existing nickname. */
export function setCrewName(signature: string, name: string): void {
  const trimmed = name.trim();
  crewNames.update((m) => {
    const next = { ...m };
    if (trimmed) next[signature] = trimmed;
    else delete next[signature];
    return next;
  });
}

/** Forget a crew's nickname (revert its header to the player names). */
export function clearCrewName(signature: string): void {
  crewNames.update((m) => {
    if (!(signature in m)) return m;
    const next = { ...m };
    delete next[signature];
    return next;
  });
}
