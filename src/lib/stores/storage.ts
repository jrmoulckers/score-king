import { writable } from 'svelte/store';

/**
 * A persistent, app-level storage fault. Non-null when the local database
 * (IndexedDB) can't be opened or written — e.g. private-browsing lockout, a
 * corrupt store, or an exhausted quota. Surfaced as a themed banner so a device
 * that can't persist scores says so out loud instead of silently booting to an
 * empty, "where did my data go?" state.
 */
export const storageError = writable<string | null>(null);

/** Record a storage fault (first one wins so the message stays stable). */
export function reportStorageError(
  message = "Storage is unavailable on this device — scores can't be saved right now.",
): void {
  storageError.update((cur) => cur ?? message);
}

/** Clear the storage fault (e.g. after a successful reload/recovery). */
export function clearStorageError(): void {
  storageError.set(null);
}
