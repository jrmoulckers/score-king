/**
 * Live-connection health vocabulary, kept dependency-free so the copy that reassures guests
 * can be unit-tested without booting the whole session engine (which imports the durable
 * stores). {@link ../live/session} re-exports these; UI can import from either.
 */

/**
 * Health of the live connection, kept *separate* from the game lifecycle. A dropped socket
 * never ends the game — the host stays authoritative and local-first — it just flips this to
 * 'reconnecting' (auto-healing) or 'offline' (still retrying, or, for nearby, dropped for good).
 */
export type LiveConnection = 'online' | 'reconnecting' | 'offline';

/**
 * The banner copy for a non-online connection, or null when online. Pure so it can be unit
 * tested and shared verbatim by the guest board. A reconnectable transport (the relay)
 * promises an auto-heal; a non-reconnectable one (nearby WebRTC, whose handshake is
 * hand-carried and can't be re-signaled) tells the guest how to get back in by hand — never
 * that we're "trying to reconnect", which we can't. Either way the reassurance is the same:
 * the scores so far are safe on the host.
 */
export function connectionNote(conn: LiveConnection, reconnectable: boolean): string | null {
  if (conn === 'online') return null;
  if (conn === 'reconnecting') return 'Reconnecting…';
  return reconnectable
    ? 'Offline — trying to reconnect. The host still has the game.'
    : 'Disconnected — ask the host for a fresh invite to rejoin. Your scores so far are safe.';
}

/**
 * How a guest's session ended, split into an honest heading and body. 'lost' means the link
 * simply dropped (a nearby WebRTC channel can't be re-signalled), so we never claim the host
 * "closed" it — and the body points the guest at a fresh invite. 'ended' (or null) is the
 * deliberate host-end. Pure so both exit screens share verbatim, tested copy.
 */
export function endedTitle(reason: 'ended' | 'lost' | null): string {
  return reason === 'lost' ? 'Lost the connection' : 'The game ended';
}

export function endedBody(reason: 'ended' | 'lost' | null): string {
  return reason === 'lost'
    ? 'The nearby link dropped. Scan a fresh invite from the host to rejoin — your scores so far are safe.'
    : 'The host closed the session.';
}
