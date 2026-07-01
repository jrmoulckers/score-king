/**
 * Cross-device {@link SessionTransport} backed by the dumb relay (see `relay/`).
 *
 * A single WebSocket to a stateless bus that resolves a join code to a session and forwards
 * every frame to the *other* devices in it — and stores no game data. It is a drop-in
 * sibling to {@link ./broadcast}: the host-authoritative engine above the seam is unchanged,
 * so this is the only new piece needed to turn same-browser live play into real cross-device
 * play.
 *
 * The relay never echoes a sender's own frames back (it forwards to the other sockets only),
 * matching the BroadcastChannel semantics the engine relies on: the leader never receives
 * the state it just broadcast.
 */
import { get } from 'svelte/store';
import type { SessionTransport, TransportEnvelope, TransportStatus } from './transport';
import { RELAY_URL } from '../config';
import { settings } from '../stores/settings';

const OPEN_TIMEOUT_MS = 8000;

/** Whether this browser has WebSocket at all (needed for the relay transport). */
export function isWebSocketSupported(): boolean {
  return typeof WebSocket !== 'undefined';
}

/** The relay URL in effect: the per-device Settings override, else the built-in default. */
export function effectiveRelayUrl(): string {
  const override = get(settings).relayUrl?.trim();
  return (override || RELAY_URL).trim();
}

/** Whether cross-device live play is available: a relay URL is configured and WS is present. */
export function isRelayConfigured(): boolean {
  return isWebSocketSupported() && effectiveRelayUrl() !== '';
}

/** Build the per-session WebSocket URL: `<base>/live/<code>` (any base path prefix is kept). */
function sessionUrl(base: string, code: string): string {
  const u = new URL(base);
  u.pathname = u.pathname.replace(/\/+$/, '') + '/live/' + encodeURIComponent(code);
  return u.toString();
}

export class RelayTransport implements SessionTransport {
  readonly code: string;
  private baseUrl: string;
  private ws: WebSocket | null = null;
  private messageHandlers = new Set<(env: TransportEnvelope) => void>();
  private statusHandlers = new Set<(status: TransportStatus) => void>();

  constructor(baseUrl: string, code: string) {
    this.code = code;
    this.baseUrl = baseUrl;
  }

  open(): Promise<void> {
    if (this.ws) return Promise.resolve();
    if (!isWebSocketSupported()) {
      this.emitStatus('error');
      return Promise.reject(new Error('Live play needs a browser that supports WebSocket.'));
    }

    // Build the URL here (not in the constructor) so a malformed relay URL becomes a clean
    // rejection the engine can surface, rather than throwing out of makeTransport().
    let url: string;
    try {
      url = sessionUrl(this.baseUrl, this.code);
    } catch {
      this.emitStatus('error');
      return Promise.reject(
        new Error('That relay URL is not valid. Check it in Settings (use a wss:// address).'),
      );
    }

    this.emitStatus('connecting');
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        this.emitStatus('error');
        reject(e instanceof Error ? e : new Error('Could not reach the live relay.'));
        return;
      }
      this.ws = ws;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.emitStatus('error');
        try {
          ws.close();
        } catch {
          /* already closing */
        }
        reject(new Error('The live relay did not respond. Check the relay URL in Settings.'));
      }, OPEN_TIMEOUT_MS);

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.emitStatus('open');
        resolve();
      };

      ws.onmessage = (e: MessageEvent) => {
        let env: TransportEnvelope;
        try {
          env = JSON.parse(typeof e.data === 'string' ? e.data : '') as TransportEnvelope;
        } catch {
          return; // ignore anything that isn't a framed envelope
        }
        for (const handler of this.messageHandlers) handler(env);
      };

      ws.onerror = () => {
        this.emitStatus('error');
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('Could not reach the live relay.'));
      };

      ws.onclose = () => {
        if (this.ws === ws) this.emitStatus('closed');
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('The live relay closed the connection.'));
      };
    });
  }

  send(env: TransportEnvelope): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(env));
    }
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
    const ws = this.ws;
    this.ws = null;
    this.emitStatus('closed');
    try {
      ws?.close();
    } catch {
      /* already closing */
    }
    this.messageHandlers.clear();
    this.statusHandlers.clear();
  }

  private emitStatus(status: TransportStatus): void {
    for (const handler of this.statusHandlers) handler(status);
  }
}
