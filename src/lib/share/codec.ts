/**
 * Framework-free primitives for turning a small JSON blob into a compact, paste- and
 * QR-safe string: **base64url** over raw bytes, plus optional **deflate-raw** compression
 * via the Streams API (with graceful absence on browsers that lack `CompressionStream`).
 *
 * Extracted from the nearby-play handshake codec ({@link ../live/signal}) so the live
 * handshake and the game-recap share codec ({@link ./recap}) share one battle-tested
 * implementation. This module is pure and side-effect free.
 */

// ── base64url over raw bytes (works in the browser and in Node) ──────────────────────────

export function bytesToBase64url(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000; // chunk the spread so a big payload can't blow the call stack
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlToBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── deflate-raw via the Streams API, with graceful absence ───────────────────────────────

async function pipeThrough(
  bytes: Uint8Array,
  stream: 'CompressionStream' | 'DecompressionStream',
): Promise<Uint8Array> {
  const Ctor = (globalThis as Record<string, unknown>)[stream] as
    | (new (format: string) => ReadableWritablePair<Uint8Array, Uint8Array>)
    | undefined;
  if (!Ctor) throw new Error('no-stream');
  const transform = new Ctor('deflate-raw');
  const piped = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(transform as unknown as ReadableWritablePair);
  const buf = await new Response(piped as unknown as BodyInit).arrayBuffer();
  return new Uint8Array(buf);
}

/** Deflate-raw the bytes, or return null when `CompressionStream` is unavailable. */
export async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    return await pipeThrough(bytes, 'CompressionStream');
  } catch {
    return null; // CompressionStream unavailable → caller falls back to raw
  }
}

/** Inverse of {@link deflate}. Throws when the bytes aren't valid deflate-raw. */
export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, 'DecompressionStream');
}
