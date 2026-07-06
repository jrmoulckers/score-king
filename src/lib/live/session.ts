/**
 * Host-authoritative live-play engine (ARCHITECTURE.md Phase 3).
 *
 * A single in-memory session controller, exposed to the UI as Svelte stores. It sits
 * above the {@link SessionTransport} seam, so it is transport-agnostic: same engine over
 * the same-origin BroadcastChannel today, a relay later.
 *
 * Roles:
 * - **Leader** (the host): owns the durable World. Applies guests' intents through the
 *   normal store flows and rebroadcasts authoritative state. The leader keeps using its
 *   own full game screen; this engine just mirrors and accepts proposals.
 * - **Guest**: holds a read-only {@link LiveState} replica and proposes intents. Never
 *   writes locally.
 */
import { writable, derived, get } from 'svelte/store';
import type { Participant, LiveState, LiveIntent, LiveMessage } from './protocol';
import { PROTOCOL_VERSION } from './protocol';
import type { SessionTransport, TransportEnvelope } from './transport';
import { BroadcastChannelTransport, isBroadcastSupported } from './broadcast';
import {
  RelayTransport,
  isRelayConfigured,
  isWebSocketSupported,
  effectiveRelayUrl,
} from './relay';
import { WebRtcTransport, isWebRtcSupported } from './webrtc';
import type { ID } from '../types';
import { settings } from '../stores/settings';
import { players } from '../stores/players';
import { showToast } from '../stores/toast';
import { uid, generateHandle, PALETTE } from '../util';

export type LiveStatus = 'off' | 'connecting' | 'hosting' | 'guest' | 'error';

export const liveStatus = writable<LiveStatus>('off');
export const liveCode = writable<string | null>(null);
export const liveParticipants = writable<Participant[]>([]);
/** This device's own participant (identity + any claimed seat). Null when off. */
export const liveSelf = writable<Participant | null>(null);
/** The guest's replica of the leader's game. Null for the leader (who uses its own screen). */
export const liveReplica = writable<LiveState | null>(null);
export const liveError = writable<string | null>(null);
/** True when the active session runs over the relay (cross-device) vs. same-browser only. */
export const liveRemote = writable<boolean>(false);

/** Convenience: a session is live when hosting or joined as a guest. */
export const liveActive = derived(liveStatus, ($s) => $s === 'hosting' || $s === 'guest');

/** Whether this browser can run live play at all (same-origin, the relay, or nearby P2P). */
export function isLiveSupported(): boolean {
  return isBroadcastSupported() || isWebSocketSupported() || isWebRtcSupported();
}

/** Whether serverless nearby (WebRTC) play can run on this device. */
export function isNearbySupported(): boolean {
  return isWebRtcSupported();
}

/** Handlers the leader provides so the engine can read + mutate the durable World. */
export interface HostHandlers {
  self: Participant;
  /** Current authoritative snapshot of the live game (rev is filled in by the engine). */
  buildState: () => LiveState;
  /** Apply a guest's intent. Resolve to an error string to reject it, or null to accept. */
  applyIntent: (intent: LiveIntent, from: ID) => Promise<string | null>;
}

const JOIN_TIMEOUT_MS = 4000;

let transport: SessionTransport | null = null;
let role: 'leader' | 'guest' | null = null;
let selfId: ID | null = null;
let mySelf: Participant | null = null;
let leaderId: ID | null = null;
let seq = 0;
let rev = 0;
let peers: Participant[] = [];
let host: HostHandlers | null = null;
let unsubMessage: (() => void) | null = null;
let joinTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Serializes leader-side durable mutations. `appendRound`/`removeRound` are non-atomic
 * read-modify-writes (read count → write index), so an applied guest intent must never
 * interleave with another intent or the host's own save — otherwise two writers observe
 * the same length and produce a duplicate round index. Every leader-side mutation (guest
 * intents here, the host's local saves via {@link runHostExclusive}) funnels through this
 * one chain, which is the serialization the "single writer ⇒ no CRDTs" model assumes.
 */
let opChain: Promise<unknown> = Promise.resolve();

/** Run a leader-side durable mutation exclusively, after any in-flight one has settled. */
export function runHostExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = opChain.then(fn, fn);
  opChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/** Build a participant for this device: the lead member if there is one, else a guest handle. */
export function currentSelf(asRole: 'leader' | 'guest'): Participant {
  const leadId = get(settings).leadMemberId;
  const roster = get(players);
  const lead = leadId ? roster.find((p) => p.id === leadId && !p.archived && !p.deleted) : undefined;
  if (lead) return { id: lead.id, name: lead.name, color: lead.color, role: asRole };
  const taken = roster.map((p) => p.name);
  // Skip palette[0] (Royal Violet) — it's the reserved primary-action accent.
  const color = PALETTE[1 + Math.floor(Math.random() * (PALETTE.length - 1))];
  return { id: uid(), name: generateHandle(taken), color, role: asRole };
}

function send(msg: LiveMessage, to?: ID): void {
  transport?.send({ from: selfId!, to, seq: seq++, msg } satisfies TransportEnvelope);
}

function setPeers(next: Participant[]): void {
  peers = next;
  liveParticipants.set(next);
}

function upsertPeer(p: Participant): void {
  const next = peers.filter((x) => x.id !== p.id);
  next.push(p);
  setPeers(next);
}

function makeTransport(code: string): SessionTransport {
  // The only place that picks a transport. Prefer the relay when one is configured (real
  // cross-device play); otherwise fall back to the same-origin BroadcastChannel (same
  // browser profile). The engine above this line is identical either way.
  if (isRelayConfigured()) {
    liveRemote.set(true);
    return new RelayTransport(effectiveRelayUrl(), code);
  }
  liveRemote.set(false);
  return new BroadcastChannelTransport(code);
}

/** Broadcast the leader's current authoritative state (call after any local change). */
export function publish(): void {
  if (role !== 'leader' || !host) return;
  const state = host.buildState();
  state.rev = ++rev;
  send({ t: 'state', state });
}

/** Start hosting a live session under `code`. The caller supplies durable read/apply hooks. */
export async function startHosting(code: string, handlers: HostHandlers): Promise<void> {
  await teardown();
  role = 'leader';
  host = handlers;
  selfId = handlers.self.id;
  leaderId = handlers.self.id;
  rev = 0;
  mySelf = handlers.self;
  liveSelf.set(handlers.self);
  setPeers([handlers.self]);
  liveCode.set(code);
  liveReplica.set(null);
  liveError.set(null);
  liveStatus.set('connecting');

  transport = makeTransport(code);
  unsubMessage = transport.onMessage(onLeaderMessage);
  try {
    await transport.open();
    liveStatus.set('hosting');
    attachUnload();
  } catch (e) {
    liveError.set(e instanceof Error ? e.message : 'Could not start live play.');
    liveStatus.set('error');
    await teardown();
    throw e;
  }
}

/** Join an existing live session by `code` as a guest. */
export async function joinSession(code: string, self: Participant): Promise<void> {
  await teardown();
  role = 'guest';
  selfId = self.id;
  mySelf = self;
  liveSelf.set(self);
  rev = 0;
  setPeers([]);
  liveCode.set(code);
  liveReplica.set(null);
  liveError.set(null);
  liveStatus.set('connecting');

  transport = makeTransport(code);
  unsubMessage = transport.onMessage(onGuestMessage);
  try {
    await transport.open();
    attachUnload();
    send({ t: 'hello', protocol: PROTOCOL_VERSION, participant: self });
    joinTimer = setTimeout(() => {
      if (get(liveStatus) === 'connecting') {
        liveError.set('No live game found for that code. Check it and try again.');
        liveStatus.set('error');
        void teardown();
      }
    }, JOIN_TIMEOUT_MS);
  } catch (e) {
    liveError.set(e instanceof Error ? e.message : 'Could not join live play.');
    liveStatus.set('error');
    await teardown();
    throw e;
  }
}

/** Guest: propose a change to the leader. */
export function sendIntent(intent: LiveIntent): void {
  if (role !== 'guest') return;
  send({ t: 'intent', intent }, leaderId ?? undefined);
}

/**
 * Guest: claim a scoreboard seat (become that player) or release it (pass `null` → spectator).
 * Adopts the seat's name+color as this device's presence identity and tells the leader, who
 * re-broadcasts the roster so everyone reads presence in the board's own names, not handles.
 */
export function claimSeat(seat: { id: ID; name: string; color: string } | null): void {
  if (role !== 'guest' || !mySelf) return;
  const next: Participant = seat
    ? { ...mySelf, playerId: seat.id, name: seat.name, color: seat.color }
    : { ...mySelf, playerId: undefined };
  mySelf = next;
  liveSelf.set(next);
  upsertPeer(next);
  send({ t: 'claim', participant: next }, leaderId ?? undefined);
}

// ── Nearby (serverless WebRTC) play ────────────────────────────────────────────────────
// Same host-authoritative engine, different transport: no relay, no server — the handshake
// is hand-carried between devices in the room as a QR / copy-paste (see live/webrtc.ts).
// The controls below let the nearby-play UI drive that out-of-band exchange; once a data
// channel opens, everything funnels through the same onLeader/onGuestMessage paths above.

/** Host-side controls to invite guests over the serverless nearby transport. */
export interface NearbyHostControls {
  /** Mint one invite (an offer) to show the next guest as a QR / code. */
  createInvite(): Promise<string>;
  /** Take that guest's scanned/pasted reply (their answer) and connect them. */
  acceptAnswer(answer: string): Promise<void>;
  /** Drop an invite the host backed out of before the guest replied. */
  cancelInvite(): void;
}

/** Guest-side control to accept a host's nearby invite. */
export interface NearbyGuestControls {
  /** Take the host's offer, and return the answer signal to show back to the host. */
  acceptInvite(offer: string): Promise<string>;
}

/** Start hosting a **nearby** (serverless, same-room) live session. */
export async function startHostingNearby(
  code: string,
  handlers: HostHandlers,
): Promise<NearbyHostControls> {
  await teardown();
  role = 'leader';
  host = handlers;
  selfId = handlers.self.id;
  leaderId = handlers.self.id;
  rev = 0;
  mySelf = handlers.self;
  liveSelf.set(handlers.self);
  setPeers([handlers.self]);
  liveCode.set(code);
  liveReplica.set(null);
  liveError.set(null);
  liveStatus.set('connecting');

  const rtc = new WebRtcTransport(code, 'leader');
  transport = rtc;
  liveRemote.set(true);
  unsubMessage = transport.onMessage(onLeaderMessage);
  try {
    await transport.open(); // a leader is ready at once; guests attach as they scan in
    liveStatus.set('hosting');
    attachUnload();
  } catch (e) {
    liveError.set(e instanceof Error ? e.message : 'Could not start nearby play.');
    liveStatus.set('error');
    await teardown();
    throw e;
  }
  return {
    createInvite: () => rtc.createInvite(),
    acceptAnswer: (answer: string) => rtc.acceptAnswer(answer),
    cancelInvite: () => rtc.cancelInvite(),
  };
}

/** Join a **nearby** live session as a guest by accepting the host's scanned/pasted invite. */
export async function joinSessionNearby(self: Participant): Promise<NearbyGuestControls> {
  await teardown();
  role = 'guest';
  selfId = self.id;
  mySelf = self;
  liveSelf.set(self);
  rev = 0;
  setPeers([]);
  liveCode.set(null);
  liveReplica.set(null);
  liveError.set(null);
  liveStatus.set('connecting');

  const rtc = new WebRtcTransport('', 'guest');
  transport = rtc;
  liveRemote.set(true);
  unsubMessage = transport.onMessage(onGuestMessage);

  return {
    acceptInvite: async (offer: string): Promise<string> => {
      // Throws (surfaced to the UI) if the offer is malformed. Builds the peer + answer.
      const answer = await rtc.acceptInvite(offer);
      liveCode.set(rtc.code);
      // The channel opens once the host scans our answer; then announce ourselves and wait
      // for the welcome, exactly like the code-based join.
      void rtc
        .open()
        .then(() => {
          send({ t: 'hello', protocol: PROTOCOL_VERSION, participant: self });
          joinTimer = setTimeout(() => {
            if (get(liveStatus) === 'connecting') {
              liveError.set('Connected, but the host didn’t respond. Ask them to try again.');
              liveStatus.set('error');
              void teardown();
            }
          }, JOIN_TIMEOUT_MS);
        })
        .catch((e: unknown) => {
          if (get(liveStatus) === 'connecting') {
            liveError.set(e instanceof Error ? e.message : 'Nearby play didn’t connect.');
            liveStatus.set('error');
            void teardown();
          }
        });
      return answer;
    },
  };
}
/** Leave the session cleanly (leader ends it for everyone; a guest just departs). */
export async function leaveSession(): Promise<void> {
  if (transport && selfId) {
    send(role === 'leader' ? { t: 'closed' } : { t: 'bye' });
  }
  await teardown();
  liveStatus.set('off');
  liveCode.set(null);
  liveReplica.set(null);
  setPeers([]);
}

function onLeaderMessage(env: TransportEnvelope): void {
  if (env.to && env.to !== selfId) return;
  const m = env.msg;
  if (m.t === 'hello') {
    if (m.protocol !== PROTOCOL_VERSION) {
      send({ t: 'reject', reason: 'Your app version is out of date — refresh to join.' }, env.from);
      return;
    }
    upsertPeer({ ...m.participant, role: 'guest' });
    const state = host!.buildState();
    state.rev = rev;
    send({ t: 'welcome', participant: host!.self, state, peers }, env.from);
    send({ t: 'peers', peers });
  } else if (m.t === 'intent') {
    const { intent } = m;
    const from = env.from;
    // Serialize against other intents and the host's own saves (see opChain).
    void runHostExclusive(async () => {
      if (role !== 'leader' || !host) return;
      const err = await host.applyIntent(intent, from);
      if (err) send({ t: 'reject', reason: err }, from);
      else publish();
    });
  } else if (m.t === 'claim') {
    // A guest claimed/released a seat: update the roster and fan the new names out to all.
    upsertPeer({ ...m.participant, role: 'guest' });
    send({ t: 'peers', peers });
  } else if (m.t === 'bye') {
    setPeers(peers.filter((p) => p.id !== env.from));
    send({ t: 'peers', peers });
  }
}

function onGuestMessage(env: TransportEnvelope): void {
  if (env.to && env.to !== selfId) return;
  const m = env.msg;
  if (m.t === 'welcome') {
    clearJoinTimer();
    leaderId = env.from;
    rev = m.state.rev;
    liveReplica.set(m.state);
    setPeers(m.peers);
    liveStatus.set('guest');
  } else if (m.t === 'state') {
    if (m.state.rev >= rev) {
      rev = m.state.rev;
      liveReplica.set(m.state);
    }
  } else if (m.t === 'peers') {
    setPeers(m.peers);
  } else if (m.t === 'reject') {
    showToast(m.reason);
  } else if (m.t === 'closed') {
    showToast('The host ended the live game.');
    void teardown();
    liveStatus.set('off');
    liveCode.set(null);
    liveReplica.set(null);
    setPeers([]);
  }
}

function clearJoinTimer(): void {
  if (joinTimer !== undefined) {
    clearTimeout(joinTimer);
    joinTimer = undefined;
  }
}

let unloadAttached = false;
function onUnload(): void {
  if (transport && selfId) send(role === 'leader' ? { t: 'closed' } : { t: 'bye' });
}
function attachUnload(): void {
  if (unloadAttached || typeof window === 'undefined') return;
  window.addEventListener('pagehide', onUnload);
  unloadAttached = true;
}
function detachUnload(): void {
  if (!unloadAttached || typeof window === 'undefined') return;
  window.removeEventListener('pagehide', onUnload);
  unloadAttached = false;
}

async function teardown(): Promise<void> {
  clearJoinTimer();
  detachUnload();
  unsubMessage?.();
  unsubMessage = null;
  transport?.close();
  transport = null;
  role = null;
  selfId = null;
  mySelf = null;
  liveSelf.set(null);
  leaderId = null;
  host = null;
  seq = 0;
  opChain = Promise.resolve();
  liveRemote.set(false);
}
