/**
 * Serverless, same-room {@link SessionTransport} over **WebRTC data channels** — the "nearby"
 * transport. No relay, no signalling server, nothing on the network but the two devices: a
 * short handshake blob is hand-carried between them out of band (a QR scan or a copy-paste,
 * see {@link ./signal}), after which frames flow **directly** peer-to-peer.
 *
 * ## Leader-hub star
 * The live protocol is already leader-centric — guests only ever message the leader, and the
 * leader broadcasts to everyone; no frame is addressed guest→guest. So this transport is a
 * **star**: the leader holds one peer connection per guest, each guest holds exactly one (to
 * the leader). That is a perfect fit for the engine above, which is left completely unchanged.
 *
 * ## No echo, and disconnect synthesis
 * A data channel never delivers a sender its own frames, matching the BroadcastChannel/relay
 * semantics the engine relies on. When a channel drops, the transport synthesises the protocol
 * message the engine would otherwise get over a relay — a `bye` from the lost guest (leader
 * side) or a `closed` from the host (guest side) — so roster upkeep and teardown need no
 * WebRTC-specific code.
 *
 * ## LAN-only by design
 * The real peer factory uses **no ICE servers** (`iceServers: []`): only host/mDNS candidates
 * are gathered, so a connection can form on the local network but no traffic is relayed through
 * anyone else's infrastructure and no public address is discovered. Same-room play, truly
 * private. Establishing across the open internet would need STUN/TURN — deliberately out of
 * scope for this transport (that's what the relay is for).
 */
import type { ID } from '../types';
import type { SessionTransport, TransportEnvelope, TransportStatus } from './transport';
import { encodeSignal, decodeSignal } from './signal';

/** How long to wait for ICE candidate gathering before sending the SDP we already have. */
const ICE_GATHER_MS = 2500;
/** How long a guest keeps its answer live waiting for the host to scan it, before giving up. */
const GUEST_CONNECT_MS = 180_000;
const CHANNEL_LABEL = 'sk';

/** Whether this browser can run the nearby (WebRTC) transport at all. */
export function isWebRtcSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

/**
 * One peer link (an `RTCPeerConnection` plus its single data channel), abstracted so the
 * transport's routing can be unit-tested against an in-memory mock. Real impl below.
 */
export interface RtcPeer {
  /** LEADER: open a data channel, create the offer, gather ICE, resolve the local SDP. */
  createOffer(): Promise<string>;
  /** GUEST: apply the remote offer, answer it, gather ICE, resolve the local SDP. */
  acceptOffer(remoteSdp: string): Promise<string>;
  /** LEADER: apply the guest's answer, completing the handshake. */
  acceptAnswer(remoteSdp: string): Promise<void>;
  /** Post a frame on the data channel (no-op until it is open). */
  send(data: string): void;
  /** Tear the connection down. */
  close(): void;
}

/** Lifecycle callbacks the transport hands each peer so it can surface channel events. */
export interface RtcPeerHooks {
  onMessage: (data: string) => void;
  onOpen: () => void;
  onClose: () => void;
}

/** Builds a peer wired to the given hooks. Swapped for a mock in tests. */
export type RtcFactory = (hooks: RtcPeerHooks) => RtcPeer;

interface Conn {
  inviteId: string;
  peer: RtcPeer;
  open: boolean;
  /** The far participant's id, bound on the first inbound frame (their `hello`). */
  peerId: ID | null;
}

export class WebRtcTransport implements SessionTransport {
  private _code: string;
  private readonly role: 'leader' | 'guest';
  private readonly factory: RtcFactory;
  private conns: Conn[] = [];
  private messageHandlers = new Set<(env: TransportEnvelope) => void>();
  private statusHandlers = new Set<(status: TransportStatus) => void>();
  private closing = false;
  private guestGate: { resolve: () => void; reject: (e: Error) => void; settled: boolean } | null = null;
  private guestTimer: ReturnType<typeof setTimeout> | undefined;
  private guestOpened = false;

  constructor(code: string, role: 'leader' | 'guest', factory: RtcFactory = browserFactory) {
    this._code = code;
    this.role = role;
    this.factory = factory;
  }

  /** The join code. For a guest it is adopted from the offer during {@link acceptInvite}. */
  get code(): string {
    return this._code;
  }

  open(): Promise<void> {
    if (this.role === 'leader') {
      // The leader is ready immediately — it can mint invites now; guests attach over time.
      this.emitStatus('open');
      return Promise.resolve();
    }
    // A guest is "open" once its single channel to the leader opens — which only happens after
    // the host scans the answer. Resolve then; a generous timer guards a host who never scans.
    if (this.guestOpened) {
      this.emitStatus('open');
      return Promise.resolve();
    }
    this.emitStatus('connecting');
    return new Promise<void>((resolve, reject) => {
      this.guestGate = { resolve, reject, settled: false };
      this.guestTimer = setTimeout(() => {
        if (this.guestGate && !this.guestGate.settled) {
          this.guestGate.settled = true;
          this.emitStatus('error');
          reject(new Error('The host didn’t connect in time. Ask them to scan your code again.'));
        }
      }, GUEST_CONNECT_MS);
    });
  }

  // ── Signalling (called by the nearby-play UI, not the engine) ──────────────────────────

  /** LEADER: mint a fresh invite for one more guest. Returns the offer signal to show as a QR. */
  async createInvite(): Promise<string> {
    if (this.role !== 'leader') throw new Error('Only the host creates invites.');
    const inviteId = randomId();
    const conn: Conn = { inviteId, peer: null as unknown as RtcPeer, open: false, peerId: null };
    conn.peer = this.factory(this.hooksFor(conn));
    this.conns.push(conn);
    const sdp = await conn.peer.createOffer();
    return encodeSignal({ k: 'offer', c: this._code, i: inviteId, s: sdp });
  }

  /** LEADER: take a guest's scanned/pasted answer and finish that handshake. */
  async acceptAnswer(text: string): Promise<void> {
    if (this.role !== 'leader') throw new Error('Only the host accepts answers.');
    const sig = await decodeSignal(text);
    if (sig.k !== 'answer') throw new Error('That’s an invite, not a reply — swap the codes around.');
    const conn = this.conns.find((c) => c.inviteId === sig.i);
    if (!conn) throw new Error('That reply is for a different invite. Show this player a fresh code.');
    await conn.peer.acceptAnswer(sig.s);
  }

  /**
   * LEADER: discard the most recent invite the host backed out of before the guest replied,
   * releasing its idle `RTCPeerConnection`. Only ever touches an un-opened invite, so a guest
   * whose channel is already up (or coming up) is never affected.
   */
  cancelInvite(): void {
    if (this.role !== 'leader') return;
    const conn = this.conns[this.conns.length - 1];
    if (!conn || conn.open) return;
    this.conns = this.conns.filter((c) => c !== conn);
    try {
      conn.peer.close();
    } catch {
      /* already gone */
    }
  }

  /** GUEST: take the host's scanned/pasted offer, wire up, and return the answer to show back. */
  async acceptInvite(text: string): Promise<string> {
    if (this.role !== 'guest') throw new Error('Only a guest accepts an invite.');
    const sig = await decodeSignal(text);
    if (sig.k !== 'offer') throw new Error('That’s a reply, not an invite. Ask the host for their code.');
    this._code = sig.c;
    const conn: Conn = { inviteId: sig.i, peer: null as unknown as RtcPeer, open: false, peerId: null };
    conn.peer = this.factory(this.hooksFor(conn));
    this.conns = [conn];
    const sdp = await conn.peer.acceptOffer(sig.s);
    return encodeSignal({ k: 'answer', c: sig.c, i: sig.i, s: sdp });
  }

  // ── SessionTransport ───────────────────────────────────────────────────────────────────

  send(env: TransportEnvelope): void {
    const data = JSON.stringify(env);
    if (this.role === 'guest') {
      // The only reachable peer is the leader; `to` is irrelevant on a spoke.
      const conn = this.conns[0];
      if (conn?.open) conn.peer.send(data);
      return;
    }
    // Leader: address one bound guest, or fan out to every open channel (no echo — the leader
    // never has a channel to itself).
    for (const conn of this.conns) {
      if (!conn.open) continue;
      if (env.to && conn.peerId !== env.to) continue;
      conn.peer.send(data);
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
    this.closing = true;
    if (this.guestTimer !== undefined) clearTimeout(this.guestTimer);
    if (this.guestGate && !this.guestGate.settled) {
      this.guestGate.settled = true;
      this.guestGate.reject(new Error('Nearby play was cancelled.'));
    }
    this.emitStatus('closed');
    for (const conn of this.conns) {
      try {
        conn.peer.close();
      } catch {
        /* already gone */
      }
    }
    this.conns = [];
    this.messageHandlers.clear();
    this.statusHandlers.clear();
  }

  // ── internals ──────────────────────────────────────────────────────────────────────────

  private hooksFor(conn: Conn): RtcPeerHooks {
    return {
      onMessage: (data) => {
        let env: TransportEnvelope;
        try {
          env = JSON.parse(data) as TransportEnvelope;
        } catch {
          return; // ignore anything that isn't a framed envelope
        }
        // Learn which participant is on this channel from their first frame, so the leader can
        // later address them (e.g. `welcome`, `reject`) by id.
        if (conn.peerId === null && env.from) conn.peerId = env.from;
        for (const handler of this.messageHandlers) handler(env);
      },
      onOpen: () => {
        conn.open = true;
        if (this.role === 'guest') {
          this.guestOpened = true;
          if (this.guestGate && !this.guestGate.settled) {
            this.guestGate.settled = true;
            if (this.guestTimer !== undefined) clearTimeout(this.guestTimer);
            this.emitStatus('open');
            this.guestGate.resolve();
          }
        }
      },
      onClose: () => this.handleClose(conn),
    };
  }

  /** A channel dropped: forget the peer and synthesise the message the engine expects. */
  private handleClose(conn: Conn): void {
    if (this.closing) return; // an intentional teardown — the engine already knows
    const existed = this.conns.includes(conn);
    this.conns = this.conns.filter((c) => c !== conn);
    if (!existed) return;
    // Release the dropped peer's RTCPeerConnection/channel now — the session-wide close() only
    // walks the *current* conns, and we've just removed this one, so nothing else would.
    try {
      conn.peer.close();
    } catch {
      /* already gone */
    }
    if (this.role === 'leader') {
      // Tell the engine this guest left, so it drops them and re-broadcasts the roster.
      if (conn.peerId) this.deliver({ from: conn.peerId, seq: -1, msg: { t: 'bye' } });
    } else {
      // The host is gone — the engine tears the guest session down on `closed`.
      this.deliver({ from: conn.peerId ?? '', seq: -1, msg: { t: 'closed' } });
    }
  }

  private deliver(env: TransportEnvelope): void {
    for (const handler of this.messageHandlers) handler(env);
  }

  private emitStatus(status: TransportStatus): void {
    for (const handler of this.statusHandlers) handler(status);
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

/**
 * The real peer, wrapping one `RTCPeerConnection` and its data channel. Uses non-trickle ICE
 * (gather candidates, then hand over one self-contained SDP) so the whole handshake fits in a
 * single QR — there is no side channel to trickle candidates over.
 */
function browserFactory(hooks: RtcPeerHooks): RtcPeer {
  const pc = new RTCPeerConnection({ iceServers: [] });
  let channel: RTCDataChannel | null = null;

  const wire = (ch: RTCDataChannel) => {
    channel = ch;
    ch.onopen = () => hooks.onOpen();
    ch.onclose = () => hooks.onClose();
    ch.onmessage = (e: MessageEvent) => {
      if (typeof e.data === 'string') hooks.onMessage(e.data);
    };
  };

  pc.onconnectionstatechange = () => {
    // `failed`/`closed` are terminal; `disconnected` is transient and often recovers, so we don't
    // treat it as a drop here — the data channel's own `onclose` is the authoritative signal.
    const s = pc.connectionState;
    if (s === 'failed' || s === 'closed') hooks.onClose();
  };

  const gatherIce = (): Promise<void> =>
    new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') return resolve();
      const done = () => {
        pc.removeEventListener('icegatheringstatechange', check);
        clearTimeout(timer);
        resolve();
      };
      const check = () => {
        if (pc.iceGatheringState === 'complete') done();
      };
      const timer = setTimeout(done, ICE_GATHER_MS);
      pc.addEventListener('icegatheringstatechange', check);
    });

  return {
    async createOffer() {
      wire(pc.createDataChannel(CHANNEL_LABEL, { ordered: true }));
      await pc.setLocalDescription(await pc.createOffer());
      await gatherIce();
      return pc.localDescription?.sdp ?? '';
    },
    async acceptOffer(remoteSdp) {
      pc.ondatachannel = (e: RTCDataChannelEvent) => wire(e.channel);
      await pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await gatherIce();
      return pc.localDescription?.sdp ?? '';
    },
    async acceptAnswer(remoteSdp) {
      await pc.setRemoteDescription({ type: 'answer', sdp: remoteSdp });
    },
    send(data) {
      if (channel && channel.readyState === 'open') channel.send(data);
    },
    close() {
      try {
        channel?.close();
      } catch {
        /* noop */
      }
      try {
        pc.close();
      } catch {
        /* noop */
      }
    },
  };
}
