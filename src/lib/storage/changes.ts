import { writable } from 'svelte/store';

/**
 * Monotonic counter bumped whenever local game data is mutated through the db
 * write helpers (players, games, rounds — created, edited or deleted).
 *
 * A bulk `replaceAll` from a sync *restore* deliberately does NOT bump it, so
 * pulling a backup can never echo back into an automatic push.
 */
export const dataVersion = writable(0);

/** Signal that local data changed and should be backed up. */
export function markDataChanged(): void {
  dataVersion.update((n) => n + 1);
}
