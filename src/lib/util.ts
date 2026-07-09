import type { ID, Player } from './types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Longest player/handle we keep. A pasted essay of a name would blow out the
 * scoreboard columns, avatars, and backup size — so names are trimmed and capped
 * both at the input (a `maxlength`) and defensively here at the storage boundary.
 */
export const MAX_NAME_LEN = 40;

/** Trim and cap a user-typed name to {@link MAX_NAME_LEN}. */
export function cleanName(name: string): string {
  return (name ?? '').trim().slice(0, MAX_NAME_LEN);
}

/** Case-/whitespace-insensitive name match, so "Alex" and " alex " read as the same person. */
export function sameName(a: string, b: string): boolean {
  return cleanName(a).toLowerCase() === cleanName(b).toLowerCase();
}

/**
 * Resolve a game's ordered lineup, substituting a "Removed player" placeholder for any
 * id that no longer resolves to a member — a player hard-deleted mid-game. Keeping the
 * slot preserves their scorecard column and their contribution to the standings instead
 * of silently collapsing the board (which would misattribute or hide recorded points).
 */
export function rosterFor(playerIds: ID[], roster: Player[]): Player[] {
  return playerIds.map(
    (pid) =>
      roster.find((p) => p.id === pid) ?? {
        id: pid,
        name: 'Removed player',
        color: '#5b5e7e',
        createdAt: 0,
        claimed: false,
        archived: true,
      },
  );
}

export const PALETTE = [
  '#7c5cff', '#34d399', '#f87171', '#fbbf24', '#38bdf8', '#fb7185',
  '#a78bfa', '#4ade80', '#f59e0b', '#22d3ee', '#e879f9', '#facc15',
];

/**
 * Color-blind-friendly counterparts to PALETTE, index-for-index, drawn from the
 * Paul Tol "muted" and Okabe-Ito palettes. Chosen to stay distinguishable under
 * deuteranopia, protanopia, and tritanopia.
 */
export const CVD_PALETTE = [
  '#332288', '#44aa99', '#cc6677', '#e69f00', '#56b4e9', '#882255',
  '#aa4499', '#117733', '#d55e00', '#88ccee', '#ddcc77', '#999933',
];

export function pickColor(used: string[]): string {
  const free = PALETTE.find((c) => !used.includes(c));
  return free ?? PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

/** Map a base palette color to its color-blind-safe equivalent. Custom colors pass through. */
export function resolvePlayerColor(hex: string, colorBlind: boolean): string {
  if (!colorBlind) return hex;
  const i = PALETTE.indexOf(hex.toLowerCase());
  return i >= 0 ? CVD_PALETTE[i] : hex;
}

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = lin((n >> 16) & 255);
  const g = lin((n >> 8) & 255);
  const b = lin(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Pick black or white text for best WCAG contrast against a background color. */
export function textOn(hex: string): string {
  const l = relativeLuminance(hex);
  const contrastWhite = 1.05 / (l + 0.05);
  const contrastBlack = (l + 0.05) / 0.05;
  return contrastBlack >= contrastWhite ? '#0b0b12' : '#ffffff';
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return formatDate(ts);
}

/**
 * Like {@link relativeTime} but with seconds granularity, for fast-moving heartbeats such as the
 * sync poll's "Last checked …" label. Pass `now` (e.g. a 1s ticker) so callers can force the label
 * to recompute each second. Falls back to {@link relativeTime} once past a minute.
 */
export function relativeTimeSec(ts: number, now: number = Date.now()): string {
  const sec = Math.max(0, Math.round((now - ts) / 1000));
  if (sec < 3) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  return relativeTime(ts);
}

const HANDLE_ADJECTIVES = [
  'Royal', 'Crowned', 'Sneaky', 'Lucky', 'Mighty', 'Jolly', 'Dapper', 'Cosmic',
  'Turbo', 'Wily', 'Brave', 'Cheeky', 'Noble', 'Zany', 'Swift', 'Grand',
  'Merry', 'Bold', 'Sly', 'Epic', 'Plucky', 'Gilded', 'Rowdy', 'Fuzzy',
];

const HANDLE_NOUNS = [
  'Otter', 'Wizard', 'Badger', 'Comet', 'Monarch', 'Jester', 'Phoenix', 'Walrus',
  'Goose', 'Raccoon', 'Dragon', 'Penguin', 'Yeti', 'Narwhal', 'Falcon', 'Hedgehog',
  'Bandit', 'Maverick', 'Champion', 'Gremlin', 'Knight', 'Wombat', 'Llama', 'Pixel',
];

/**
 * A whimsical, on-brand display handle (e.g. "Royal Otter") for a not-yet-claimed
 * member. Avoids handles already in `taken`, falling back to a numbered variant.
 */
export function generateHandle(taken: string[] = []): string {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
  const make = () => `${pick(HANDLE_ADJECTIVES)} ${pick(HANDLE_NOUNS)}`;
  for (let i = 0; i < 24; i++) {
    const handle = make();
    if (!used.has(handle.toLowerCase())) return handle;
  }
  return `${make()} ${Math.floor(Math.random() * 90) + 10}`;
}

const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1 — unambiguous

/** A short, unambiguous join code (e.g. "K7QP4") for a live session. */
export function generateJoinCode(len = 5): string {
  const a = JOIN_CODE_ALPHABET;
  const pick = (n: number) => {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  };
  let out = '';
  for (let i = 0; i < len; i++) out += a[pick(a.length)];
  return out;
}

/** Normalize user-typed codes: uppercase, strip non-alphabet chars (handles paste/typos). */
export function normalizeJoinCode(raw: string): string {
  return (raw || '')
    .toUpperCase()
    .split('')
    .filter((c) => JOIN_CODE_ALPHABET.includes(c))
    .join('');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
