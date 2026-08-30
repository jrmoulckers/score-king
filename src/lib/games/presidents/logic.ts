import type { ID, Player } from '../../types';

/**
 * Presidents (a.k.a. President / Scum / Asshole) — pure scoring. Svelte-free on
 * purpose so the round editor, the module, and the tests all share one source of
 * truth for position → title → points.
 *
 * Each round every player finishes in a strict order (no ties): the first player
 * out is crowned President, the last player holding cards is stuck as Scum, and
 * everyone between takes a title based on the table size:
 *
 *   3 players:      President · Citizen · Scum
 *   4 players:       President · Vice President · Vice Scum · Scum
 *   5+ players:      President · Vice President · Citizen(s) · Vice Scum · Scum
 *
 * The exact point value assigned per finish varies a lot between groups, so this
 * module ships a well-documented default (`rankPoints`) plus two common house-rule
 * alternates (`tieredTitles`, `winsOnly`), selectable in config.
 *
 * Card-passing (Scum hands their best 1–2 cards to the President, who hands back
 * their worst) is a physical table ritual, not something this module scores — see
 * the module's `help` text.
 */

export type SchemeId = 'rankPoints' | 'tieredTitles' | 'winsOnly';

/** A single round: each player's finishing position (1 = President ... n = Scum). */
export interface PresidentsInput {
  positions: Record<ID, number>;
}

export interface PresidentsConfig {
  scheme: SchemeId;
  /** End the game once any player reaches this total. 0 disables the threshold. */
  targetScore: number;
  /** Play a fixed number of rounds instead (or in addition). 0 = open-ended. */
  roundCount: number;
}

const DEFAULTS: PresidentsConfig = { scheme: 'rankPoints', targetScore: 15, roundCount: 0 };

export function normalizeScheme(value: unknown): SchemeId {
  return value === 'tieredTitles' || value === 'winsOnly' || value === 'rankPoints'
    ? value
    : DEFAULTS.scheme;
}

/** Coerce the target score (>= 0; 0 disables the threshold end condition). */
export function normalizeTargetScore(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return DEFAULTS.targetScore;
  return n;
}

/** Coerce rounds-per-game (>= 0; 0 means open-ended / target-only). */
export function normalizeRoundCount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return DEFAULTS.roundCount;
  return Math.min(500, n);
}

export function readConfig(config: Record<string, unknown> = {}): PresidentsConfig {
  return {
    scheme: normalizeScheme(config.scheme),
    targetScore: normalizeTargetScore(config.targetScore),
    roundCount: normalizeRoundCount(config.roundCount),
  };
}

// ── Titles ───────────────────────────────────────────────────────────────────

export type TitleTier = 'president' | 'vp' | 'neutral' | 'vs' | 'scum';

export interface TitleInfo {
  tier: TitleTier;
  label: string;
  emoji: string;
}

const TITLES: Record<TitleTier, Omit<TitleInfo, 'tier'>> = {
  president: { label: 'President', emoji: '👑' },
  vp: { label: 'Vice President', emoji: '🎖️' },
  neutral: { label: 'Citizen', emoji: '🙂' },
  vs: { label: 'Vice Scum', emoji: '🥴' },
  scum: { label: 'Scum', emoji: '💩' },
};

/**
 * The title a finishing position earns at a given table size. Matches the
 * standard convention: President/Scum always exist; Vice President/Vice Scum
 * only appear once the table is big enough (4+) to have a distinct second-best
 * and second-worst seat; everyone else in the middle is a Citizen.
 */
export function titleFor(position: number, playerCount: number): TitleInfo {
  const n = Math.max(1, Math.floor(playerCount));
  const pos = Math.min(n, Math.max(1, Math.floor(position)));
  let tier: TitleTier;
  if (pos === 1) tier = 'president';
  else if (pos === n) tier = 'scum';
  else if (n >= 4 && pos === 2) tier = 'vp';
  else if (n >= 4 && pos === n - 1) tier = 'vs';
  else tier = 'neutral';
  return { tier, ...TITLES[tier] };
}

export interface SchemeMeta {
  id: SchemeId;
  label: string;
  blurb: string;
}

export const SCHEME_META: Record<SchemeId, SchemeMeta> = {
  rankPoints: {
    id: 'rankPoints',
    label: 'Rank points (default)',
    blurb:
      'Scales with the table: 1st scores playerCount−1, each spot down scores one less, last scores 0.',
  },
  tieredTitles: {
    id: 'tieredTitles',
    label: 'Tiered titles',
    blurb:
      'Fixed per title regardless of table size: President +3 · Vice President +1 · Citizen 0 · Vice Scum −1 · Scum −3.',
  },
  winsOnly: {
    id: 'winsOnly',
    label: 'Presidencies only',
    blurb: 'Only the President scores: +1 per round won, everyone else 0. Tracks who rules the table most.',
  },
};

const TIERED_POINTS: Record<TitleTier, number> = {
  president: 3,
  vp: 1,
  neutral: 0,
  vs: -1,
  scum: -3,
};

/**
 * Points a finishing position earns under a scheme. `playerCount` matters for
 * `rankPoints` (which scales with the table) and for resolving the title used by
 * `tieredTitles`.
 */
export function pointsForPosition(
  scheme: SchemeId,
  position: number,
  playerCount: number,
): number {
  const n = Math.max(1, Math.floor(playerCount));
  const pos = Math.floor(Number(position));
  if (!Number.isFinite(pos) || pos < 1 || pos > n) return 0;

  if (scheme === 'winsOnly') return pos === 1 ? 1 : 0;
  if (scheme === 'tieredTitles') return TIERED_POINTS[titleFor(pos, n).tier];
  // rankPoints: 1st scores n-1 down to 0 for last.
  return n - pos;
}

/** Score one round: every player's finishing position mapped to points. */
export function scoreRound(
  input: PresidentsInput,
  config: Partial<PresidentsConfig> | Record<string, unknown> = {},
): Record<ID, number> {
  const scheme = normalizeScheme((config as Record<string, unknown>).scheme);
  const positions = input?.positions ?? {};
  const playerCount = Object.keys(positions).length;
  const out: Record<ID, number> = {};
  for (const [id, pos] of Object.entries(positions)) {
    out[id] = pointsForPosition(scheme, Number(pos) || 0, playerCount);
  }
  return out;
}

/**
 * Validate a round: every player needs a distinct finishing spot from 1..n (no
 * ties — someone is always literally the next to run out of cards, and someone
 * is always literally last).
 */
export function validateRound(
  input: PresidentsInput,
  players: Pick<Player, 'id' | 'name'>[],
  _config: Record<string, unknown> = {},
): string | null {
  const n = players.length;
  const positions = input?.positions ?? {};
  const takenBy = new Map<number, string>();
  for (const p of players) {
    const pos = Math.floor(Number(positions[p.id]) || 0);
    if (pos < 1) return `Where did ${p.name} finish? 🏁`;
    if (pos > n) return `${p.name}: only ${n} players are seated, so there's no spot ${pos}.`;
    const clash = takenBy.get(pos);
    if (clash) return `${clash} and ${p.name} can't both finish in the same spot.`;
    takenBy.set(pos, p.name);
  }
  return null;
}

/** Fresh round draft: seed each player into a distinct spot, seating order = finish order. */
export function freshPositions(players: Pick<Player, 'id'>[]): PresidentsInput {
  return {
    positions: Object.fromEntries(players.map((p, i) => [p.id, i + 1])),
  };
}

/** Is this round complete: every player holds a distinct in-range finishing spot? */
export function roundComplete(input: PresidentsInput, players: Pick<Player, 'id'>[]): boolean {
  const n = players.length;
  if (n === 0) return false;
  const positions = input?.positions ?? {};
  const seen = new Set<number>();
  for (const p of players) {
    const pos = Math.floor(Number(positions[p.id]) || 0);
    if (pos < 1 || pos > n || seen.has(pos)) return false;
    seen.add(pos);
  }
  return true;
}

/** A compact one-liner for a saved round: the President and the Scum, always. */
export function describeRound(
  input: PresidentsInput,
  players: readonly { id: ID; name: string }[],
): string {
  const positions = input?.positions ?? {};
  const n = Object.keys(positions).length;
  if (!n) return 'no results yet';
  const ranked = players
    .map((p) => ({ name: p.name, pos: Math.floor(Number(positions[p.id]) || 0) }))
    .filter((r) => r.pos >= 1 && r.pos <= n)
    .sort((a, b) => a.pos - b.pos);
  if (!ranked.length) return 'no results yet';
  const first = ranked[0];
  const last = ranked[ranked.length - 1];
  const firstTitle = titleFor(first.pos, n);
  if (ranked.length === 1) return `${firstTitle.emoji} ${first.name}`;
  const lastTitle = titleFor(last.pos, n);
  return `${firstTitle.emoji} ${first.name} · ${lastTitle.emoji} ${last.name}`;
}

/** True once any player has reached the configured target score. */
export function isFinished(totals: Record<ID, number>, config: Record<string, unknown>): boolean {
  const target = readConfig(config).targetScore;
  if (target <= 0) return false;
  return Object.values(totals).some((t) => t >= target);
}

/** Fixed round count from config, or null for an open-ended (target-only) game. */
export function maxRounds(config: Record<string, unknown>): number | null {
  const n = readConfig(config).roundCount;
  return n > 0 ? n : null;
}
