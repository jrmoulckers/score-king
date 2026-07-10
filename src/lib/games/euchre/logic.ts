import type { ID } from '../../types';

/**
 * Pure Euchre scoring — no Svelte, no I/O, so it's independently unit-testable and
 * safe for the stats engine to import.
 *
 * Euchre is a fixed-partnership game: 4 players, two teams of two, 5 tricks a hand.
 * Score King's shell has no partnership model of its own (the `teams` flag is only
 * declared), so a game keeps team play *inside its module*: both partners on a team
 * receive the team's hand points, so each partner's running total equals the team
 * score and the generic scoreboard / leader / winner / target-finish all read as
 * team semantics with no shell changes.
 */

export type TeamIndex = 0 | 1;
export type HandResult = 'made' | 'march' | 'euchred';
export type Pairing = 'adjacent' | 'across';

export interface EuchreInput {
  /** Resolved partnerships (two player ids each), fixed for the whole game. */
  teams: [ID[], ID[]];
  /** The team that named trump — "the makers". */
  maker: TeamIndex | null;
  /** The makers went alone (a partner sat the hand out). */
  alone: boolean;
  /** Which maker played the lone hand (set only when `alone`). */
  alonePlayer: ID | null;
  /** Outcome of the hand, from the making team's point of view. */
  result: HandResult | null;
}

export interface EuchreOptions {
  /** Going alone and sweeping all 5 scores 4 (otherwise the normal march of 2). */
  aloneBonus: boolean;
  /** Euchring a lone caller scores the defenders 4 (otherwise the normal 2). */
  loneEuchreBonus: boolean;
}

export const DEFAULT_OPTIONS: EuchreOptions = { aloneBonus: true, loneEuchreBonus: false };

export interface HandPoints {
  /** Points to the making team this hand. */
  maker: number;
  /** Points to the defending team this hand. */
  defenders: number;
}

/** Split picked players into two partnerships by pick order. */
export function resolveTeams<T extends { id: ID }>(
  players: T[],
  pairing: Pairing,
): [ID[], ID[]] {
  const ids = players.map((p) => p.id);
  const pick = (...idx: number[]): ID[] => idx.map((i) => ids[i]).filter((x): x is ID => x != null);
  return pairing === 'across'
    ? [pick(0, 2), pick(1, 3)]
    : [pick(0, 1), pick(2, 3)];
}

/**
 * Points awarded for a single hand.
 * - made (3–4 tricks): makers +1.
 * - march (all 5): makers +2 — or +4 if they went alone (with the alone bonus on).
 * - euchred (makers took fewer than 3): defenders +2 — or +4 for euchring a lone
 *   caller (with the lone-euchre bonus on).
 */
export function handPoints(
  result: HandResult,
  alone: boolean,
  opts: EuchreOptions = DEFAULT_OPTIONS,
): HandPoints {
  switch (result) {
    case 'made':
      return { maker: 1, defenders: 0 };
    case 'march':
      return { maker: alone && opts.aloneBonus ? 4 : 2, defenders: 0 };
    case 'euchred':
      return { maker: 0, defenders: alone && opts.loneEuchreBonus ? 4 : 2 };
  }
}

/** Per-player point deltas for a hand: every teammate shares their team's points. */
export function scoreEuchre(
  input: EuchreInput,
  opts: EuchreOptions = DEFAULT_OPTIONS,
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const team of input.teams) for (const id of team) out[id] = 0;
  if (input.maker == null || input.result == null) return out;

  const pts = handPoints(input.result, input.alone, opts);
  const makers = input.teams[input.maker] ?? [];
  const defenders = input.teams[input.maker === 0 ? 1 : 0] ?? [];
  for (const id of makers) out[id] = pts.maker;
  for (const id of defenders) out[id] = pts.defenders;
  return out;
}

/** Null when the hand is valid to record, otherwise a human-readable reason. */
export function validateEuchre(input: EuchreInput): string | null {
  const flat = input.teams.flat();
  if (flat.length < 4) return 'Euchre needs four players split into two partnerships.';
  if (input.maker == null) return 'Tap the team that called trump.';
  if (input.result == null) return 'Record how the hand went.';
  if (input.alone) {
    if (!input.alonePlayer) return 'Pick which partner went alone.';
    const makers = input.teams[input.maker] ?? [];
    if (!makers.includes(input.alonePlayer)) {
      return 'The lone player must be on the team that called it.';
    }
  }
  return null;
}

/**
 * Short, glanceable summary of a recorded hand for the history table. `awarded` is the
 * points the scoring team actually got this hand (read from the stored deltas so the
 * text always matches the recorded score, even under house-rule bonuses); when omitted
 * it's derived with the default rules.
 */
export function describeHand(
  input: EuchreInput,
  players: { id: ID; name: string }[],
  awarded?: number,
): string {
  if (input.maker == null || input.result == null) return 'Hand not recorded';
  const name = (id: ID | null): string =>
    (id != null && players.find((p) => p.id === id)?.name) || '?';
  const teamLabel = (idx: TeamIndex): string =>
    (input.teams[idx] ?? []).map((id) => name(id)).join(' & ') || `Team ${idx + 1}`;

  const makers = teamLabel(input.maker);
  const defenders = teamLabel(input.maker === 0 ? 1 : 0);
  const pts =
    awarded ??
    (() => {
      const p = handPoints(input.result, input.alone, DEFAULT_OPTIONS);
      return input.result === 'euchred' ? p.defenders : p.maker;
    })();
  const plus = `+${pts}`;

  if (input.result === 'euchred') {
    return `🚫 ${makers} euchred — ${defenders} ${plus}`;
  }
  const lone = input.alone ? ` — ${name(input.alonePlayer)} alone` : '';
  if (input.result === 'march') return `🧹 ${makers} marched${lone} ${plus}`;
  return `✋ ${makers} made it${lone} ${plus}`;
}

// --- celebration: the whimsical, earned "big moment" for a recorded hand ---

/**
 * The card-table drama of a hand, ready for the editor to stage. `big` marks the
 * three moments worth a flourish (a march, a lone sweep, a euchre); an ordinary made
 * hand stays deliberately quiet so the loud moments keep their scarcity. `points` is
 * what the *scoring* side takes this hand (makers on made/march, defenders on a euchre),
 * derived through {@link handPoints} so the copy always matches the recorded score —
 * even under house-rule bonuses. Pure (no Svelte) so it's unit-testable.
 */
export interface Celebration {
  tone: HandResult;
  lone: boolean;
  /** Deserves an animated flourish (march, lone sweep, or euchre). */
  big: boolean;
  emoji: string;
  headline: string;
  cheer: string;
  /** Points to the side that scored this hand. */
  points: number;
}

export function celebrationFor(
  result: HandResult,
  alone: boolean,
  opts: EuchreOptions = DEFAULT_OPTIONS,
): Celebration {
  const p = handPoints(result, alone, opts);
  if (result === 'euchred') {
    const pts = p.defenders;
    return {
      tone: 'euchred',
      lone: alone,
      big: true,
      emoji: '🚫',
      headline: 'Euchred!',
      cheer: alone
        ? `Set a loner — defenders take +${pts}!`
        : `Set them — defenders take +${pts}.`,
      points: pts,
    };
  }
  if (result === 'march') {
    const pts = p.maker;
    return alone
      ? {
          tone: 'march',
          lone: true,
          big: true,
          emoji: '🐺',
          headline: 'Loner sweep!',
          cheer: `Alone. All five. Legendary — +${pts}.`,
          points: pts,
        }
      : {
          tone: 'march',
          lone: false,
          big: true,
          emoji: '🧹',
          headline: 'Clean sweep!',
          cheer: `All five tricks — march for +${pts}.`,
          points: pts,
        };
  }
  // made (3–4 tricks): quiet by design.
  return {
    tone: 'made',
    lone: alone,
    big: false,
    emoji: '✋',
    headline: alone ? 'Made it — alone' : 'Made it',
    cheer: `Three or four tricks — banked for +${p.maker}.`,
    points: p.maker,
  };
}

// --- race to the barn: team totals + who's leading, for the peg track ---

/**
 * Each team's running score. Both partners mirror the team total (see {@link scoreEuchre}),
 * so the max across a team's members is the team score and is robust to a missing id.
 */
export function teamTotals(
  teams: [ID[], ID[]],
  totals: Record<ID, number>,
): [number, number] {
  const score = (team: ID[]): number =>
    team.length ? Math.max(...team.map((id) => totals[id] ?? 0)) : 0;
  return [score(teams[0] ?? []), score(teams[1] ?? [])];
}

/** The team in front, or null on a tie (including 0–0). */
export function leadingTeam(scores: [number, number]): TeamIndex | null {
  if (scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 0 : 1;
}

/** Tricks-to-the-barn: points a team still needs to hit the target (never negative). */
export function toTarget(score: number, target: number): number {
  return Math.max(0, target - score);
}

// --- config coercion (config values arrive as `unknown` from stored game config) ---

export function pairingFromConfig(config: Record<string, unknown>): Pairing {
  return config.pairing === 'across' ? 'across' : 'adjacent';
}

export function optionsFromConfig(config: Record<string, unknown>): EuchreOptions {
  return {
    aloneBonus: config.aloneBonus !== false,
    loneEuchreBonus: config.loneEuchreBonus === true,
  };
}

export function targetFromConfig(config: Record<string, unknown>): number {
  const t = Number(config.target);
  return Number.isFinite(t) && t > 0 ? t : 10;
}
