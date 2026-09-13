import type { ID } from '../../types';

/**
 * Hearts scoring — pure, Svelte-free. Everything the module, its editor, and its
 * tests need to turn a recorded round into per-player point deltas lives here.
 *
 * Each deck contributes 13 hearts (♥ = 1 pt each) plus a Queen of Spades
 * (♠Q = 13 pts): 26 penalty points per deck. Lower is better. "Shooting the moon"
 * reverses all 26 or 52 points. The optional Omnibus variant adds one Jack of
 * Diamonds (♦J = −10) per deck.
 */

export interface HeartsInput {
  /** Hearts taken this round, by player id. Must sum to 13 per deck. */
  hearts: Record<ID, number>;
  /** Legacy single-deck Queen holder. New rounds use `queens`. */
  queen: ID | null;
  /** Legacy single-deck Jack holder. New rounds use `jacks`. */
  jack: ID | null;
  /** Queens of Spades taken by each player (one per deck, +13 each). */
  queens?: Record<ID, number>;
  /** Jacks of Diamonds taken by each player (one per deck, −10 each). */
  jacks?: Record<ID, number>;
  /**
   * The shooter's pick for how a moon scores *this* round. Only meaningful when
   * someone shot the moon; absent on ordinary rounds and legacy saved rounds.
   */
  moonRule?: MoonRule;
  /** Players who tried to continue play in the wrong direction this round. */
  wrongWayPlayerIds?: ID[];
}

export type MoonRule = 'add26' | 'subtract';

export interface HeartsConfig {
  endScore: number;
  deckCount: 1 | 2;
  variantJack: boolean;
  /** Number of cards each player passes before a deal. */
  passCardCount: number;
  /** Show the rotating pass target each hand. */
  passing: boolean;
}

export const DEFAULT_CONFIG: HeartsConfig = {
  endScore: 100,
  deckCount: 1,
  variantJack: false,
  passCardCount: 3,
  passing: true,
};

/** Single-deck values; configured totals multiply these by the deck count. */
export const HEARTS_TOTAL = 13;
export const QUEEN_POINTS = 13;
export const JACK_POINTS = 10;
export const MOON_POINTS = 26;

function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function readConfig(config: Record<string, unknown> = {}): HeartsConfig {
  const passCardCount = Math.floor(numOr(config.passCardCount, DEFAULT_CONFIG.passCardCount));
  return {
    endScore: numOr(config.endScore, DEFAULT_CONFIG.endScore),
    deckCount: numOr(config.deckCount, DEFAULT_CONFIG.deckCount) === 2 ? 2 : 1,
    variantJack: !!config.variantJack,
    passCardCount: Math.min(HEARTS_TOTAL, Math.max(1, passCardCount)),
    // Default on (standard Hearts passes); only an explicit `false` turns it off,
    // so games saved before this option existed still show the ritual.
    passing: config.passing !== false,
  };
}

// ── Passing ritual ───────────────────────────────────────────────────────────
// Before each deal, the target advances around every other seat, followed by a hold.
// Purely informational (it never touches scoring).

export type PassDirection = 'left' | 'right' | 'across' | 'offset' | 'hold';

export interface PassInfo {
  direction: PassDirection;
  /** Around-table seat offset from the passing player; null for a hold hand. */
  seatOffset: number | null;
  /** A co-signal glyph (never color alone) — an arrow, or a raised hand for a hold. */
  glyph: string;
  /** Short label, e.g. "Pass left" / "Hold — no pass". */
  label: string;
  /** One-line reminder of who receives your cards this deal. */
  hint: string;
}

/**
 * Visit each other seat in order around the circle, then hold. This makes the
 * cycle complete and deterministic for every supported table size.
 */
export function passCycle(playerCount: number): PassDirection[] {
  const count = Math.max(2, Math.floor(playerCount));
  return [
    ...Array.from({ length: count - 1 }, (_, i) => {
      const offset = i + 1;
      if (offset === 1) return 'left';
      if (offset === count - 1) return 'right';
      if (count % 2 === 0 && offset === count / 2) return 'across';
      return 'offset';
    }),
    'hold',
  ];
}

/** Which way cards pass on a given (0-based) hand, for a given table size. */
export function passingFor(handIndex: number, playerCount: number, cardCount = 3): PassInfo {
  const cycle = passCycle(playerCount);
  const i = ((handIndex % cycle.length) + cycle.length) % cycle.length || 0;
  const direction = cycle[i];
  if (direction === 'hold') {
    return {
      direction,
      seatOffset: null,
      glyph: '✋',
      label: 'Hold — no pass',
      hint: 'Keep your hand — no passing this deal',
    };
  }

  const offset = i + 1;
  const safeCardCount = Math.min(
    HEARTS_TOTAL,
    Math.max(1, Math.floor(numOr(cardCount, DEFAULT_CONFIG.passCardCount))),
  );
  const cards = `${safeCardCount} card${safeCardCount === 1 ? '' : 's'}`;
  if (direction === 'left') {
    return {
      direction,
      seatOffset: offset,
      glyph: '←',
      label: 'Pass left',
      hint: `Pass ${cards} to the player on your left`,
    };
  }
  if (direction === 'right') {
    return {
      direction,
      seatOffset: offset,
      glyph: '→',
      label: 'Pass right',
      hint: `Pass ${cards} to the player on your right`,
    };
  }
  if (direction === 'across') {
    return {
      direction,
      seatOffset: offset,
      glyph: '↔',
      label: 'Pass across',
      hint: `Pass ${cards} to the player across from you`,
    };
  }
  return {
    direction,
    seatOffset: offset,
    glyph: '↷',
    label: `Pass ${offset} seats left`,
    hint: `Pass ${cards} to the player ${offset} seats to your left`,
  };
}

/** A fresh, empty round with every player on zero hearts and no cards claimed. */
export function emptyInput(playerIds: readonly ID[]): HeartsInput {
  return {
    hearts: Object.fromEntries(playerIds.map((id) => [id, 0])),
    queen: null,
    jack: null,
    queens: Object.fromEntries(playerIds.map((id) => [id, 0])),
    jacks: Object.fromEntries(playerIds.map((id) => [id, 0])),
    wrongWayPlayerIds: [],
  };
}

/** Valid, unique wrong-way player ids from optional round metadata. */
export function wrongWayPlayers(input: HeartsInput | undefined): ID[] {
  if (!Array.isArray(input?.wrongWayPlayerIds)) return [];
  return [...new Set(input.wrongWayPlayerIds.filter((id): id is ID => typeof id === 'string'))];
}

/** Hearts placed so far this round. */
export function heartsTotal(input: HeartsInput): number {
  return Object.values(input.hearts).reduce((a, b) => a + (numOr(b, 0) || 0), 0);
}

/** Number of scoring-card copies a player took, including legacy single-card rounds. */
function scoringCardCount(
  counts: Record<ID, number> | undefined,
  legacyHolder: ID | null,
  id: ID,
): number {
  if (counts) return Math.max(0, Math.floor(numOr(counts[id], 0)));
  return legacyHolder === id ? 1 : 0;
}

export function queenCount(input: HeartsInput, id: ID): number {
  return scoringCardCount(input.queens, input.queen, id);
}

export function jackCount(input: HeartsInput, id: ID): number {
  return scoringCardCount(input.jacks, input.jack, id);
}

export function queensTotal(input: HeartsInput): number {
  if (input.queens) {
    return Object.values(input.queens).reduce(
      (total, count) => total + Math.max(0, Math.floor(numOr(count, 0))),
      0,
    );
  }
  return input.queen ? 1 : 0;
}

export function jacksTotal(input: HeartsInput): number {
  if (input.jacks) {
    return Object.values(input.jacks).reduce(
      (total, count) => total + Math.max(0, Math.floor(numOr(count, 0))),
      0,
    );
  }
  return input.jack ? 1 : 0;
}

/** Infer old saved rounds as single-deck and completed 52-point rounds as double-deck. */
export function deckCountForInput(input: HeartsInput, config?: Record<string, unknown>): 1 | 2 {
  if (config) return readConfig(config).deckCount;
  return heartsTotal(input) > HEARTS_TOTAL || queensTotal(input) > 1 ? 2 : 1;
}

export function heartsInPlay(config: Record<string, unknown> = {}): number {
  return HEARTS_TOTAL * readConfig(config).deckCount;
}

export function moonPoints(config: Record<string, unknown> = {}): number {
  return MOON_POINTS * readConfig(config).deckCount;
}

/** Hearts still waiting to be assigned (never negative). */
export function heartsRemaining(input: HeartsInput, config: Record<string, unknown> = {}): number {
  return Math.max(0, HEARTS_TOTAL * deckCountForInput(input, config) - heartsTotal(input));
}

/**
 * Who shot the moon this round: took every heart and every Queen.
 * Returns their id, or null when nobody swept the board.
 */
export function shooter(input: HeartsInput, config?: Record<string, unknown>): ID | null {
  const deckCount = deckCountForInput(input, config);
  const requiredHearts = HEARTS_TOTAL * deckCount;
  for (const [id, h] of Object.entries(input.hearts)) {
    if ((numOr(h, 0) || 0) === requiredHearts && queenCount(input, id) === deckCount) return id;
  }
  return null;
}

/**
 * The raw penalty a single player takes this round *before* any moon reversal:
 * their hearts, plus 13 per Queen, minus 10 per Jack
 * (Omnibus only). This is the number to preview per row while entering.
 */
export function baseDelta(input: HeartsInput, id: ID, cfg: HeartsConfig): number {
  return (
    (numOr(input.hearts[id], 0) || 0) +
    queenCount(input, id) * QUEEN_POINTS -
    (cfg.variantJack ? jackCount(input, id) * JACK_POINTS : 0)
  );
}

/**
 * Per-player point deltas for a round, applying the moon reversal when someone
 * swept the board. Pure — the module's `scoreRound` delegates straight to this.
 */
export function scoreRound(
  input: HeartsInput,
  playerIds: readonly ID[],
  config: Record<string, unknown>,
): Record<ID, number> {
  const cfg = readConfig(config);
  const base: Record<ID, number> = {};
  for (const id of playerIds) base[id] = baseDelta(input, id, cfg);

  const moon = shooter(input, config);
  if (!moon) return base;
  const moonValue = moonPoints(config);

  // Old rounds did not carry a per-round choice. Honor their old game-level rule
  // when present, otherwise retain the historical add-26 behavior.
  const rule: MoonRule =
    input.moonRule === 'subtract' || input.moonRule === 'add26'
      ? input.moonRule
      : config.moonRule === 'subtract'
        ? 'subtract'
        : 'add26';

  const out: Record<ID, number> = {};
  for (const id of playerIds) {
    if (rule === 'subtract') {
      out[id] = id === moon ? -moonValue : base[id];
    } else {
      out[id] = id === moon ? 0 : base[id] + moonValue;
    }
  }
  return out;
}

/**
 * The delta a single player will take this round *after* the moon reversal — the
 * exact number to preview next to their name as the round is entered.
 */
export function previewDelta(
  input: HeartsInput,
  id: ID,
  playerIds: readonly ID[],
  config: Record<string, unknown>,
): number {
  return scoreRound(input, playerIds, config)[id] ?? 0;
}

/** Validate a round. Null when good, else a friendly, specific message. */
export function validateRound(
  input: HeartsInput,
  _players: readonly { id: ID; name: string }[],
  config: Record<string, unknown>,
): string | null {
  const cfg = readConfig(config);
  const total = heartsTotal(input);
  const requiredHearts = HEARTS_TOTAL * cfg.deckCount;
  if (total !== requiredHearts) {
    const left = requiredHearts - total;
    return left > 0
      ? `${left} more heart${left === 1 ? '' : 's'} to assign. Must total ${requiredHearts}.`
      : `That's ${-left} too many heart${-left === 1 ? '' : 's'}. Must total ${requiredHearts}.`;
  }
  const queenShortfall = cfg.deckCount - queensTotal(input);
  if (queenShortfall !== 0) {
    return queenShortfall > 0
      ? `Assign ${queenShortfall} more Queen${queenShortfall === 1 ? '' : 's'} of Spades (♠Q).`
      : `That's ${-queenShortfall} too many Queens of Spades.`;
  }
  if (cfg.variantJack) {
    const jackShortfall = cfg.deckCount - jacksTotal(input);
    if (jackShortfall !== 0) {
      return jackShortfall > 0
        ? `Assign ${jackShortfall} more Jack${jackShortfall === 1 ? '' : 's'} of Diamonds (♦J).`
        : `That's ${-jackShortfall} too many Jacks of Diamonds.`;
    }
  }
  if (shooter(input, config) && input.moonRule !== 'add26' && input.moonRule !== 'subtract') {
    return 'Choose how to score this moon before saving the round.';
  }
  return null;
}

export type OutcomeKind = 'moon' | 'lady' | 'clean' | 'points';

export interface Outcome {
  kind: OutcomeKind;
  emoji: string;
  label: string;
}

/**
 * A one-glance read of how a player fared this round, for the outcome tag beside
 * their preview. Co-signals with the numeric delta (never color alone): a moon,
 * eating the Queen, a spotless dodge, or an ordinary points haul.
 */
export function outcomeFor(
  input: HeartsInput,
  id: ID,
  playerIds: readonly ID[],
  config: Record<string, unknown>,
): Outcome {
  const moon = shooter(input, config);
  if (moon) {
    return id === moon
      ? { kind: 'moon', emoji: '🌙', label: 'shot the moon' }
      : { kind: 'points', emoji: '☄️', label: 'mooned' };
  }
  const delta = previewDelta(input, id, playerIds, config);
  const queens = queenCount(input, id);
  if (queens > 0) {
    return {
      kind: 'lady',
      emoji: '💔',
      label: queens === 1 ? 'took a Queen' : `took ${queens} Queens`,
    };
  }
  if (delta <= 0) return { kind: 'clean', emoji: '😇', label: 'clean' };
  return { kind: 'points', emoji: '♥️', label: `+${delta}` };
}

// ── Round storytelling ───────────────────────────────────────────────────────
// The history table remembers each hand as a single, evocative line. Lead with
// the drama — a moon, or the gut-punch "crashed moon" (missed by one heart) —
// otherwise name who took the Queens and how heavy their hand landed, with the
// ♦J noted when the Omnibus variant is in play.

/**
 * A compact one-liner summarizing a saved round, for the round history. Pure; the
 * module's `describeRound` just resolves ids to names through this.
 */
export function describeRound(
  input: HeartsInput,
  players: readonly { id: ID; name: string }[],
): string {
  const name = (id: ID | null) => players.find((p) => p.id === id)?.name ?? '?';
  if (!input?.hearts) return 'no cards';
  const wrongWayNames = wrongWayPlayers(input).map((id) => name(id));
  const wrongWayNote =
    wrongWayNames.length === 0
      ? ''
      : `↩ ${wrongWayNames.length === 1 ? wrongWayNames[0] : wrongWayNames.join(' & ')} went the wrong way`;
  const withWrongWay = (summary: string) =>
    wrongWayNote ? `${summary} · ${wrongWayNote}` : summary;

  const deckCount = deckCountForInput(input);
  const requiredHearts = HEARTS_TOTAL * deckCount;
  const moon = shooter(input);
  if (moon) return withWrongWay(`🌙 ${name(moon)} shot the moon`);

  const heartsOf = (id: ID) => numOr(input.hearts[id], 0) || 0;
  const jackOn = jacksTotal(input) > 0;
  const pointsFor = (id: ID) =>
    heartsOf(id) +
    queenCount(input, id) * QUEEN_POINTS -
    (jackOn ? jackCount(input, id) * JACK_POINTS : 0);
  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const queenHolders = players.filter((player) => queenCount(input, player.id) > 0);
  const jackHolders = players.filter((player) => jackCount(input, player.id) > 0);
  const holdersSummary = (
    holders: readonly { id: ID; name: string }[],
    count: (id: ID) => number,
  ) =>
    holders
      .map((player) => {
        const copies = count(player.id);
        return copies > 1 ? `${player.name} ×${copies}` : player.name;
      })
      .join(' & ');

  // Crashed a moon: took every Queen and all but one heart.
  const crashed = players.find(
    (player) =>
      queenCount(input, player.id) === deckCount && heartsOf(player.id) >= requiredHearts - 1,
  );
  if (crashed) {
    return withWrongWay(`☄️ ${crashed.name} crashed a moon — ${pointsFor(crashed.id)}`);
  }

  const parts: string[] = [];
  if (queenHolders.length) {
    parts.push(
      `💔 ${queenHolders
        .map((player) => `${player.name} ${signed(pointsFor(player.id))}`)
        .join(' · ')}`,
    );
  } else {
    // No Queen on record (legacy/partial round): fall back to the heaviest pile.
    const top = [...players].sort((a, b) => heartsOf(b.id) - heartsOf(a.id))[0];
    if (top && heartsOf(top.id) > 0) return withWrongWay(`♥️ ${name(top.id)} +${heartsOf(top.id)}`);
    return withWrongWay('no points');
  }
  if (jackOn) parts.push(`♦J ${holdersSummary(jackHolders, (id) => jackCount(input, id))}`);
  return withWrongWay(parts.join(' · '));
}

/** True when any player has reached the end score and the game can wrap. */
export function isFinished(totals: Record<ID, number>, config: Record<string, unknown>): boolean {
  const end = readConfig(config).endScore;
  return Object.values(totals).some((t) => t >= end);
}

// ── Endgame tension ──────────────────────────────────────────────────────────
// Hearts ends the moment anyone reaches the end score — and because lower wins,
// the player with the *highest* total is the one racing to end everyone's game
// (while losing it). Surfacing how close that is turns the shoot-the-moon call
// into a real gamble: is a +26 swing worth it when someone's one hand from home?

export interface EndgameInfo {
  /** The score that ends the game (endScore from config). */
  end: number;
  /** The seat with the highest total — the one who'll trip the finish. Null if empty. */
  atRiskId: ID | null;
  /** That seat's current total (0 when there's no one / no points yet). */
  atRiskTotal: number;
  /** Points from the finish for that seat (end − highest), never negative. */
  toEnd: number;
  /** True once a single hand — a moon is worth 26 — could reach the end. */
  imminent: boolean;
  /** True when a seat has already hit the end: this game finishes on the next save. */
  reached: boolean;
}

/**
 * How close the game is to ending, computed from the standings *going into* a hand.
 * Pure; the editor maps `atRiskId` to a name for its endgame strip.
 */
export function endgameInfo(
  totals: Record<ID, number>,
  playerIds: readonly ID[],
  config: Record<string, unknown>,
): EndgameInfo {
  const end = readConfig(config).endScore;
  let atRiskId: ID | null = null;
  let atRiskTotal = 0;
  let seen = false;
  for (const id of playerIds) {
    const t = numOr(totals[id], 0) || 0;
    if (!seen || t > atRiskTotal) {
      atRiskTotal = t;
      atRiskId = id;
      seen = true;
    }
  }
  const toEnd = Math.max(0, end - atRiskTotal);
  return {
    end,
    atRiskId,
    atRiskTotal,
    toEnd,
    imminent: toEnd > 0 && toEnd <= moonPoints(config),
    reached: seen && atRiskTotal >= end,
  };
}
