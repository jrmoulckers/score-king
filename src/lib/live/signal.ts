/**
 * Codec for the out-of-band WebRTC handshake used by the serverless **nearby** transport
 * (see {@link ./webrtc}). There is no relay in this path — two devices in the same room
 * hand-carry a small blob (shown as a QR, or copied as text) to bootstrap a direct
 * peer-to-peer connection. A signal carries one SDP (an `offer` or its `answer`) plus the
 * session join code and an invite id that pairs a leader's offer with the guest's answer.
 *
 * The payload is JSON, deflate-compressed (SDP is very repetitive, so this roughly halves
 * it and keeps a whole handshake inside a single scannable QR), then base64url-encoded so
 * it is safe to paste or embed. Compression is optional and self-describing: a short header
 * records whether the bytes are deflated, so a browser without `CompressionStream` still
 * interoperates — just with a larger blob.
 *
 * Wire form: `sk1.<z|r>.<base64url>` — `z` = deflate-raw, `r` = uncompressed.
 */

import { bytesToBase64url, base64urlToBytes, deflate, inflate } from '../share/codec';

export type SignalKind = 'offer' | 'answer';

/** Bumped on any breaking change to the {@link Signal} shape or framing below. */
export const SIGNAL_VERSION = 1;

const HEADER = `sk${SIGNAL_VERSION}`;

export interface Signal {
  /** Format version — must equal {@link SIGNAL_VERSION}. */
  v: number;
  /** Which half of the handshake this is. */
  k: SignalKind;
  /** The session join code (short, human-shareable) — lets the far side sanity-check. */
  c: string;
  /** Correlates a leader's offer with the matching guest answer. */
  i: string;
  /** The SDP blob. */
  s: string;
}

// ── public codec ─────────────────────────────────────────────────────────────────────────

/** Encode a signal to its compact wire string (`sk1.z.…` deflated, or `sk1.r.…` raw). */
export async function encodeSignal(signal: Omit<Signal, 'v'>): Promise<string> {
  const json = JSON.stringify({ v: SIGNAL_VERSION, ...signal } satisfies Signal);
  const raw = new TextEncoder().encode(json);
  const packed = await deflate(raw);
  if (packed && packed.length < raw.length) {
    return `${HEADER}.z.${bytesToBase64url(packed)}`;
  }
  return `${HEADER}.r.${bytesToBase64url(raw)}`;
}

/** Decode a wire string back to a {@link Signal}. Throws a friendly Error on anything invalid. */
export async function decodeSignal(text: string): Promise<Signal> {
  const trimmed = (text ?? '').trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER || (parts[1] !== 'z' && parts[1] !== 'r')) {
    throw new Error('That doesn’t look like a nearby-play code. Check you copied all of it.');
  }
  let bytes: Uint8Array;
  try {
    bytes = base64urlToBytes(parts[2]);
    if (parts[1] === 'z') bytes = await inflate(bytes);
  } catch {
    throw new Error('That nearby-play code is corrupted — ask for a fresh one.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('That nearby-play code is corrupted — ask for a fresh one.');
  }
  const sig = parsed as Partial<Signal>;
  if (
    !sig ||
    sig.v !== SIGNAL_VERSION ||
    (sig.k !== 'offer' && sig.k !== 'answer') ||
    typeof sig.c !== 'string' ||
    typeof sig.i !== 'string' ||
    typeof sig.s !== 'string'
  ) {
    throw new Error('That nearby-play code is from a different app version — refresh both devices.');
  }
  return sig as Signal;
}
