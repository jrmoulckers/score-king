import { writable } from 'svelte/store';

/**
 * A single app-wide polite live region. Components call {@link announce} to have
 * a short message read by screen readers without stealing focus or showing any
 * visible UI — used for score changes, saved rounds, and route changes that a
 * sighted player perceives at a glance but an assistive-tech user otherwise
 * wouldn't. The value carries a monotonic `seq` so re-announcing the *same*
 * text (e.g. two identical saves) still updates the DOM and re-triggers the SR.
 */
export interface Announcement {
  message: string;
  seq: number;
}

export const announcement = writable<Announcement>({ message: '', seq: 0 });

let seq = 0;

/** Queue a message for the shared polite live region. Empty strings are ignored. */
export function announce(message: string): void {
  const trimmed = message.trim();
  if (!trimmed) return;
  seq += 1;
  announcement.set({ message: trimmed, seq });
}
