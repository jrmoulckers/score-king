import type { ID } from '../../types';

/**
 * Salad Bowl (a.k.a. Fishbowl) — pure scoring, team-building, validation and copy.
 *
 * NO Svelte imports live here so the real game logic stays independently
 * unit-testable (see `saladbowl.test.ts`) and safe for the stats engine to reach.
 *
 * The bowl is a TEAM game, but the app shell scores strictly per-player
 * (`Record<ID, number>`) and crowns whoever holds the best total. So a team is
 * modelled as a *shared-score group*: every member of a team receives that team's
 * points for the round, which makes each teammate's cumulative total equal the
 * team's total. The shell's default winner logic then lights up the whole winning
 * team — no shared/engine change required.
 */

/** One recorded round: how many words each team guessed, indexed by team. */
export interface SaladBowlInput {
  /** Words guessed by each team this round; `guessed[teamIndex]`. */
  guessed: number[];
}

/** A team is a stable, ordered group of the game's players. */
export interface Team {
  index: number; // 0-based
  name: string; // "Team 1"
  emoji: string; // veggie badge, so teams read without relying on colour
  playerIds: ID[];
}

/** Veggie badges — one per team, on-theme and colour-independent. */
export const TEAM_EMOJI = ['🥬', '🍅', '🥕', '🌽'] as const;

/** The escalating constraints, one per round. The first `rounds` are used. */
export interface RoundTheme {
  emoji: string;
  name: string;
  /** One-line "what you may do" rule for the round. */
  rule: string;
}

export const ROUND_THEMES: RoundTheme[] = [
  {
    emoji: '🗣️',
    name: 'Describe',
    rule: 'Say anything to get it guessed — just never the word itself (Taboo-style).',
  },
  {
    emoji: '☝️',
    name: 'One Word',
    rule: 'Give exactly ONE word as your clue. Just one. Then move on.',
  },
  {
    emoji: '🎭',
    name: 'Charades',
    rule: 'No talking — act it out. Same words, now mimed.',
  },
  {
    emoji: '🗿',
    name: 'Sculptor',
    rule: 'No talking — mould a teammate like clay into the word.',
  },
];

const MIN_TEAMS = 2;
const MAX_TEAMS = 4;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = ROUND_THEMES.length; // 4

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Configured number of teams (2–4), defaulting to 2. */
export function teamCount(config: Record<string, unknown>): number {
  return clampInt(config?.teams, MIN_TEAMS, MAX_TEAMS, MIN_TEAMS);
}

/** Configured number of rounds (1–4), defaulting to the classic 3. */
export function roundCount(config: Record<string, unknown>): number {
  return clampInt(config?.rounds, MIN_ROUNDS, MAX_ROUNDS, 3);
}

/** Points awarded per word guessed (>=1), defaulting to 1. */
export function pointsPerWord(config: Record<string, unknown>): number {
  return clampInt(config?.pointsPerWord, 1, 1000, 1);
}

/** Turn timer length in seconds — informational only, never enforced. */
export function turnSeconds(config: Record<string, unknown>): number {
  return clampInt(config?.turnSeconds, 5, 3600, 60);
}

/** Whether the playful buzzer sound fires when the turn timer ends (default on). */
export function soundOn(config: Record<string, unknown>): boolean {
  return config?.sound !== false;
}

/**
 * Format a whole-second count as "M:SS" for the turn clock (e.g. 65 → "1:05").
 * Negative values clamp to "0:00" so the buzzer state never shows a minus sign.
 */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

/** The escalating constraint for a given 0-based round index. */
export function themeFor(roundIndex: number): RoundTheme {
  const i = Math.min(Math.max(0, Math.floor(roundIndex) || 0), ROUND_THEMES.length - 1);
  return ROUND_THEMES[i];
}

/**
 * Partition players into `count` teams by CONTIGUOUS selection order, as evenly as
 * possible (earlier teams absorb the remainder). Selecting players in team order
 * ("my team, then yours") therefore builds exactly the teams you'd expect. The team
 * count is capped at the player count so a team is never empty.
 */
export function makeTeams(playerIds: ID[], count: number): Team[] {
  const n = playerIds.length;
  if (n === 0) return [];
  const t = Math.max(1, Math.min(Math.floor(count) || 1, n));
  const base = Math.floor(n / t);
  const extra = n % t; // first `extra` teams get one more
  const teams: Team[] = [];
  let cursor = 0;
  for (let i = 0; i < t; i++) {
    const size = base + (i < extra ? 1 : 0);
    teams.push({
      index: i,
      name: `Team ${i + 1}`,
      emoji: TEAM_EMOJI[i] ?? '🥗',
      playerIds: playerIds.slice(cursor, cursor + size),
    });
    cursor += size;
  }
  return teams;
}

/** A fresh round draft: zero words guessed for each of `teamsLength` teams. */
export function createInput(teamsLength: number): SaladBowlInput {
  return { guessed: Array.from({ length: Math.max(0, teamsLength) }, () => 0) };
}

/** Words a team guessed this round, coerced to a non-negative integer. */
export function wordsFor(input: SaladBowlInput, teamIndex: number): number {
  const raw = input?.guessed?.[teamIndex];
  return Math.max(0, Math.floor(Number(raw) || 0));
}

/** Total words pulled from the bowl this round, across every team. */
export function bowlTotal(input: SaladBowlInput, teams: Team[]): number {
  return teams.reduce((sum, t) => sum + wordsFor(input, t.index), 0);
}

/** null when the round is valid, otherwise a human-readable reason. */
export function validate(input: SaladBowlInput, teams: Team[]): string | null {
  if (teams.length < 2) {
    return 'Salad Bowl needs at least 2 teams — add more players.';
  }
  for (const t of teams) {
    const raw = input?.guessed?.[t.index];
    const n = Number(raw);
    if (raw != null && (!Number.isFinite(n) || n < 0 || !Number.isInteger(n))) {
      return `${t.emoji} ${t.name}: enter whole words guessed (0 or more).`;
    }
  }
  return null;
}

/**
 * Per-player deltas for the round: every member of a team receives that team's
 * `words × pointsPerWord`, so teammates always share an identical running total.
 */
export function score(
  input: SaladBowlInput,
  teams: Team[],
  perWord: number,
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const t of teams) {
    const pts = wordsFor(input, t.index) * perWord;
    for (const pid of t.playerIds) out[pid] = pts;
  }
  return out;
}

/** Short history summary, e.g. "🗣️ Describe — 🥬 5 · 🍅 3". */
export function describe(round: { index: number; input: unknown }): string {
  const input = round.input as SaladBowlInput | undefined;
  const theme = themeFor(round.index);
  const guessed = Array.isArray(input?.guessed) ? input!.guessed : [];
  if (guessed.length === 0) return `${theme.emoji} ${theme.name}`;
  const parts = guessed.map(
    (g, i) => `${TEAM_EMOJI[i] ?? '🥗'} ${Math.max(0, Math.floor(Number(g) || 0))}`,
  );
  return `${theme.emoji} ${theme.name} — ${parts.join(' · ')}`;
}
