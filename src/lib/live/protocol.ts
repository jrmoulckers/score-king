/**
 * Live co-play wire protocol (ARCHITECTURE.md Phase 3).
 *
 * Host-authoritative: the party leader's World is the single source of truth for a
 * live session. Guests hold a live **replica** and send **intents** ("record this
 * round"); the leader applies them to its durable stores and rebroadcasts the
 * resulting state. One real writer ⇒ no CRDTs in the hot path. The wire format reuses
 * the durable mutation vocabulary — the move stream is ephemeral propagation, never a
 * second source of truth.
 *
 * This module is transport-agnostic: the same messages flow over the same-origin
 * {@link ../live/broadcast.BroadcastChannelTransport} today and a relay later.
 */
import type { Game, ID, Player, Round } from '../types';

/** Bumped on any breaking change to the message shapes below. */
export const PROTOCOL_VERSION = 2;

/** Someone present in a live session — keyed off the stable member id, never the handle. */
export interface Participant {
  id: ID;
  name: string;
  color: string;
  role: 'leader' | 'guest';
  /**
   * The scoreboard seat this device has claimed, if any. Absent/undefined means the device
   * is a spectator ("just watching"). When a seat is claimed the participant's `name`/`color`
   * are set to that player's, so presence reads in the board's own language.
   */
  playerId?: ID;
}

/** The leader's authoritative view of the live game — the guests' replica. */
export interface LiveState {
  game: Game;
  /** Ordered as `game.playerIds`, resolved to records. */
  players: Player[];
  rounds: Round[];
  /** Stamp of the leader's last broadcast, so a guest can ignore stale frames. */
  rev: number;
}

/**
 * A guest's proposed change, in the durable mutation vocabulary. The leader is free to
 * reject it (validation) — guests never write directly. The first cut supports recording
 * a round (the core live action); editing/removing stays with the leader, who has the
 * full game screen.
 */
export type LiveIntent = { kind: 'record-round'; input: unknown };

/** Everything that crosses the wire, discriminated by `t`. */
export type LiveMessage =
  // guest → all: "I'm here" (announce on join / reconnect)
  | { t: 'hello'; protocol: number; participant: Participant }
  // leader → one guest: accept, hand over the current replica + roster
  | { t: 'welcome'; participant: Participant; state: LiveState; peers: Participant[] }
  // leader → all: authoritative state after any change
  | { t: 'state'; state: LiveState }
  // leader → all: roster changed (someone joined/left)
  | { t: 'peers'; peers: Participant[] }
  // guest → leader: propose a change
  | { t: 'intent'; intent: LiveIntent }
  // guest → leader: claim (or release) a scoreboard seat; leader re-broadcasts the roster
  | { t: 'claim'; participant: Participant }
  // leader → one guest: a proposed intent was rejected
  | { t: 'reject'; reason: string }
  // anyone → all: leaving cleanly
  | { t: 'bye' }
  // leader → all: the session is ending. `reason` separates a deliberate host-end ('ended',
  // the default when omitted) from a transport synthesising a close because the link dropped
  // ('lost') — so a guest can be told the honest truth instead of always "the host closed it".
  | { t: 'closed'; reason?: 'ended' | 'lost' };
