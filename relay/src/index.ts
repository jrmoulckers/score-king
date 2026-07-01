/**
 * Score King — live-play relay (Cloudflare Worker + Durable Object).
 *
 * A dumb, stateless message bus. It resolves a join code to a session and forwards frames
 * between the devices in it. It **stores no game data** — the only state is the set of live
 * WebSocket connections for a room, and even that lives in the Durable Object's socket list
 * (via the Hibernatable WebSockets API), not in durable storage.
 *
 * Topology: one Durable Object instance per join code (`idFromName(code)`), so every device
 * that connects with the same code lands in the same room. The room forwards each incoming
 * frame to the *other* sockets only — it never echoes a sender's own frame back, matching the
 * BroadcastChannel semantics the client engine relies on (the leader never receives the state
 * it just broadcast).
 *
 * Deploy: see README.md (`npx wrangler deploy`). Storage stays self-owned; this is only a bus.
 */

export interface Env {
  SESSIONS: DurableObjectNamespace;
}

/** Join codes are short and alphanumeric (see the app's generateJoinCode/normalizeJoinCode). */
const CODE_RE = /^[A-Z0-9]{4,16}$/;

/** Soft ceiling on devices per room — a party, not a broadcast. Keeps abuse cheap to shed. */
const MAX_PEERS = 32;

/** Drop absurdly large frames early; real live frames are small JSON envelopes. */
const MAX_FRAME_BYTES = 128 * 1024;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check / friendly root — no game data, nothing to see.
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return new Response('Score King live relay: OK. Forwards messages, stores nothing.', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    const match = url.pathname.match(/^\/live\/([^/]+)\/?$/);
    if (!match) return new Response('Not found', { status: 404 });

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }

    const code = decodeURIComponent(match[1]).toUpperCase();
    if (!CODE_RE.test(code)) {
      return new Response('Bad join code.', { status: 400 });
    }

    // Every device on this code shares one room (Durable Object instance).
    const id = env.SESSIONS.idFromName(code);
    const room = env.SESSIONS.get(id);
    return room.fetch(request);
  },
};

/** One live session. Holds only its open sockets — no game state, no durable storage. */
export class SessionRoom {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(_request: Request): Promise<Response> {
    if (this.state.getWebSockets().length >= MAX_PEERS) {
      return new Response('This live session is full.', { status: 503 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Hibernatable accept: the runtime can evict this object from memory between frames and
    // rehydrate on the next one, so an idle room costs nothing and holds no data.
    this.state.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(sender: WebSocket, message: string | ArrayBuffer): void {
    const size = typeof message === 'string' ? message.length : message.byteLength;
    if (size > MAX_FRAME_BYTES) return;

    // Fan out to everyone else in the room. Never echo back to the sender.
    for (const peer of this.state.getWebSockets()) {
      if (peer === sender) continue;
      try {
        peer.send(message);
      } catch {
        // A peer that can't receive is on its way out; its close handler will clean it up.
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): void {
    try {
      ws.close(code >= 1000 && code <= 4999 ? code : 1000);
    } catch {
      // Already closing.
    }
  }

  webSocketError(ws: WebSocket): void {
    try {
      ws.close(1011, 'error');
    } catch {
      // Already closing.
    }
  }
}
