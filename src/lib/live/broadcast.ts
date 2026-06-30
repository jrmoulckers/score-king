/**
 * Same-origin {@link SessionTransport} backed by the browser's `BroadcastChannel`.
 *
 * Carries live-play messages between tabs/windows of the **same browser profile** — no
 * server, no infrastructure. It proves the host-authoritative engine end-to-end and is a
 * drop-in sibling to the relay transport that adds cross-device play later (Phase 3b):
 * the engine above this class doesn't change when the transport swaps.
 *
 * Note: a `BroadcastChannel` never echoes a sender's own posts back to itself, so the
 * leader won't receive the frames it broadcasts — exactly what we want.
 */
import type { SessionTransport, TransportEnvelope, TransportStatus } from './transport';

const CHANNEL_PREFIX = 'score-king-live:';

/** Whether this browser can run the same-origin transport at all. */
export function isBroadcastSupported(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

export class BroadcastChannelTransport implements SessionTransport {
  readonly code: string;
  private channel: BroadcastChannel | null = null;
  private messageHandlers = new Set<(env: TransportEnvelope) => void>();
  private statusHandlers = new Set<(status: TransportStatus) => void>();

  constructor(code: string) {
    this.code = code;
  }

  async open(): Promise<void> {
    if (this.channel) return;
    if (!isBroadcastSupported()) {
      this.emitStatus('error');
      throw new Error('Live play needs a browser that supports BroadcastChannel.');
    }
    this.channel = new BroadcastChannel(CHANNEL_PREFIX + this.code);
    this.channel.onmessage = (e: MessageEvent) => {
      const env = e.data as TransportEnvelope;
      for (const handler of this.messageHandlers) handler(env);
    };
    this.emitStatus('open');
  }

  send(env: TransportEnvelope): void {
    this.channel?.postMessage(env);
  }

  onMessage(handler: (env: TransportEnvelope) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: (status: TransportStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  close(): void {
    this.emitStatus('closed');
    this.channel?.close();
    this.channel = null;
    this.messageHandlers.clear();
    this.statusHandlers.clear();
  }

  private emitStatus(status: TransportStatus): void {
    for (const handler of this.statusHandlers) handler(status);
  }
}
