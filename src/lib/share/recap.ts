/**
 * Codec + view model for **sharing one game's results** — a read-only recap of final
 * standings and the round-by-round scorecard. The whole snapshot is self-contained and
 * carried in a URL **fragment** (never sent to the server), so a friend can open the link,
 * scan the QR, or read the copied text and see the outcome without any backend, account, or
 * access to the sharer's wider World.
 *
 * The payload is JSON, `deflate`-compressed then base64url-encoded (reusing the same
 * primitives as the nearby-play handshake, see {@link ./codec}). It is deliberately compact
 * and **index-based**: players are a positional list and rounds/winners reference them by
 * index, so no stable member ids ever leave the device. Totals are derived from the rounds.
 *
 * Wire form: `skr1.<z|r>.<base64url>` — `z` = deflate-raw, `r` = uncompressed.
 */

import type { Game, ID, Player } from '../types';
import { resolveLower } from '../types';
import { getModule } from '../games/registry';
import { standings, type Standing } from '../scoring';
import { absoluteUrl } from '../router';
import { bytesToBase64url, base64urlToBytes, deflate, inflate } from './codec';

/** Bumped on any breaking change to {@link RecapPayload} or the framing below. */
export const RECAP_VERSION = 1;

const HEADER = `skr${RECAP_VERSION}`;

/** The app-relative route that renders a shared recap. */
export const RECAP_PATH = '/recap';

/**
 * The compact, self-contained snapshot of a finished game's results. Keys are terse to keep
 * the encoded string short; everything is positional so no member ids are shared.
 */
export interface RecapPayload {
  /** Format version — must equal {@link RECAP_VERSION}. */
  v: number;
  /** Game module id (e.g. 'skullking'), used to resolve emoji / name / win direction. */
  t: string;
  /** Optional custom game label. */
  n?: string;
  /** Game config — drives lower-is-better resolution (and any future display). */
  cfg?: Record<string, unknown>;
  /** Finished-at time (ms epoch). */
  f: number;
  /** Players as `[name, color]`, index-aligned with {@link r} columns and {@link w}. */
  p: [name: string, color: string][];
  /** Winner indices into {@link p} (the exact recorded outcome). */
  w: number[];
  /** Rounds: each is per-player deltas aligned to {@link p} (missing entries default to 0). */
  r: number[][];
}

/** Build a shareable payload from a finished game and its ordered players + rounds. */
export function buildRecapPayload(
  game: Game,
  orderedPlayers: Player[],
  rounds: { index: number; deltas: Record<ID, number> }[],
  opts: { name?: string } = {},
): RecapPayload {
  const idIndex = new Map(orderedPlayers.map((p, i) => [p.id, i]));
  const ordered = [...rounds].sort((a, b) => a.index - b.index);
  return {
    v: RECAP_VERSION,
    t: game.type,
    n: opts.name ?? game.name,
    cfg: game.config,
    f: game.finishedAt ?? Date.now(),
    p: orderedPlayers.map((p) => [p.name, p.color] as [string, string]),
    w: (game.winnerIds ?? [])
      .map((id) => idIndex.get(id))
      .filter((i): i is number => i != null),
    r: ordered.map((round) => orderedPlayers.map((p) => round.deltas[p.id] ?? 0)),
  };
}

/** Encode a payload to its compact wire string (`skr1.z.…` deflated, or `skr1.r.…` raw). */
export async function encodeRecap(payload: RecapPayload): Promise<string> {
  const json = JSON.stringify({ ...payload, v: RECAP_VERSION } satisfies RecapPayload);
  const raw = new TextEncoder().encode(json);
  const packed = await deflate(raw);
  if (packed && packed.length < raw.length) {
    return `${HEADER}.z.${bytesToBase64url(packed)}`;
  }
  return `${HEADER}.r.${bytesToBase64url(raw)}`;
}

/** Decode a wire string back to a {@link RecapPayload}. Throws a friendly Error on bad input. */
export async function decodeRecap(text: string): Promise<RecapPayload> {
  const trimmed = (text ?? '').trim().replace(/^#/, '');
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER || (parts[1] !== 'z' && parts[1] !== 'r')) {
    throw new Error('That doesn’t look like a Score King results link.');
  }
  let bytes: Uint8Array;
  try {
    bytes = base64urlToBytes(parts[2]);
    if (parts[1] === 'z') bytes = await inflate(bytes);
  } catch {
    throw new Error('This results link looks corrupted — ask for a fresh one.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('This results link looks corrupted — ask for a fresh one.');
  }
  if (!isRecapPayload(parsed)) {
    throw new Error('This results link is from a different app version — ask for a fresh one.');
  }
  return parsed;
}

function isRecapPayload(x: unknown): x is RecapPayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    o.v === RECAP_VERSION &&
    typeof o.t === 'string' &&
    typeof o.f === 'number' &&
    Array.isArray(o.p) &&
    o.p.every((e) => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string') &&
    Array.isArray(o.w) &&
    o.w.every((i) => typeof i === 'number') &&
    Array.isArray(o.r) &&
    o.r.every((row) => Array.isArray(row) && (row as unknown[]).every((n) => typeof n === 'number'))
  );
}

/** Build an absolute, shareable URL that carries the recap in its fragment. */
export function recapShareUrl(wire: string): string {
  return `${absoluteUrl(RECAP_PATH)}#${wire}`;
}

// ── Derived view model (shared by the recap page and the image card) ─────────────────────

export interface RecapView {
  type: string;
  name?: string;
  /** Module emoji, or a die fallback for an unknown/removed game type. */
  emoji: string;
  /** Module display name, or the raw type id as a fallback. */
  title: string;
  finishedAt: number;
  /** Synthesized players — `id` is the positional index as a string (read-only artifact). */
  players: { id: string; name: string; color: string }[];
  totals: Record<string, number>;
  winners: string[];
  lowerIsBetter: boolean;
  standings: Standing[];
  /** Round-by-round per-player deltas, aligned to {@link players} order. */
  rounds: number[][];
}

/**
 * Expand a payload into a ready-to-render view: synthesized players (positional ids),
 * derived totals + standings, resolved win direction, and winner ids. Falls back to the
 * rank-1 finishers when a payload carries no explicit winners.
 */
export function recapView(payload: RecapPayload): RecapView {
  const module = getModule(payload.t);
  const players = payload.p.map(([name, color], i) => ({ id: String(i), name, color }));
  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.id] = 0));
  for (const row of payload.r) {
    row.forEach((delta, i) => {
      const id = String(i);
      if (id in totals) totals[id] += delta || 0;
    });
  }
  const lowerIsBetter = module ? resolveLower(module, payload.cfg ?? {}) : false;
  const ranked = standings(totals, lowerIsBetter);
  const explicit = payload.w.map((i) => String(i)).filter((id) => id in totals);
  const winners = explicit.length
    ? explicit
    : ranked.filter((s) => s.rank === 1).map((s) => s.playerId);
  return {
    type: payload.t,
    name: payload.n,
    emoji: module?.emoji ?? '🎲',
    title: payload.n || module?.name || payload.t,
    finishedAt: payload.f,
    players,
    totals,
    winners,
    lowerIsBetter,
    standings: ranked,
    rounds: payload.r,
  };
}

/** A plain-text recap suitable for pasting into a chat, ending with the share link. */
export function recapText(view: RecapView, url: string): string {
  const date = new Date(view.finishedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const lines = view.standings.map((s) => {
    const name = byId.get(s.playerId)?.name ?? '?';
    const crown = view.winners.includes(s.playerId) ? ' 🏆' : '';
    return `${s.rank}. ${name} — ${s.total}${crown}`;
  });
  const winnerNames = view.winners.map((id) => byId.get(id)?.name ?? '?').join(' & ');
  const header = `${view.emoji} ${view.title} — ${date}`;
  const crownLine = winnerNames
    ? `🏆 ${winnerNames} ${view.winners.length > 1 ? 'tie!' : 'wins!'}`
    : '';
  return [header, crownLine, '', ...lines, '', `Scored with Score King 👑 ${url}`]
    .filter((l) => l !== null)
    .join('\n');
}
