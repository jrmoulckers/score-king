import { writable } from 'svelte/store';

/**
 * Crew nicknames — a device-local nicety, not part of the synced World.
 *
 * A "crew" is derived from who was at the table: every game sharing the same set of
 * players belongs to the same crew, keyed by a stable {@link crewSignature}. The optional
 * nickname a player gives that crew ("The Regulars") is cosmetic, so for v1 it lives in
 * localStorage rather than the synced World — keeping this change fully additive (no DB
 * migration, no touch to the shared sync surface). Upgrade path: promote to a synced entity
 * with `updatedAt` + tombstone once the model settles.
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
