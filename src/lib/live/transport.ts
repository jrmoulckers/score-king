/**
 * `SessionTransport` — the live-play transport seam (sibling to the storage
 * `SyncProvider`). The host-authoritative engine in {@link ./session} sits *above* this
 * interface, so swapping the transport (same-origin BroadcastChannel now → a relay, or
 * P2P, later) leaves the game logic untouched. That's the whole point of the seam.
 */
import type { ID } from '../types';
import type { LiveMessage } from './protocol';

/** One framed message. `to` addresses a single participant; omit it to broadcast. */
export interface TransportEnvelope {
  from: ID;
  to?: ID;
  /** Per-sender monotonic counter — lets receivers drop duplicates / order frames. */
  seq: number;
  msg: LiveMessage;
}

export type TransportStatus = 'closed' | 'connecting' | 'open' | 'error';

export interface SessionTransport {
  /** The join code this transport is bound to. */
  readonly code: string;
  /** Begin transporting. Resolves once the channel is ready (or rejects on failure). */
  open(): Promise<void>;
  /** Post an envelope. Broadcast unless `env.to` is set (receivers still filter on `to`). */
  send(env: TransportEnvelope): void;
  /** Subscribe to inbound envelopes. Returns an unsubscribe. */
  onMessage(handler: (env: TransportEnvelope) => void): () => void;
  /** Subscribe to transport status changes. Returns an unsubscribe. */
  onStatus(handler: (status: TransportStatus) => void): () => void;
  /** Tear down the channel and drop all subscribers. */
  close(): void;
}

export type { ID };
