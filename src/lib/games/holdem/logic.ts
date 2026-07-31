import type { ID, RoundContext } from '../../types';

/**
 * Pure, Svelte-free Texas Hold'em model — the dealer's ledger, not a card
 * simulator. Real cards + chips stay on the table; this tracks the *money*: what
 * each player buys in for, how chips move when a hand is settled, and — the whole
 * point — a minimal "who owes whom" settlement at the end. No I/O, no DOM, so the
 * engine, editor and stats share one testable source of truth.
 *
 * ## How it maps onto Score King's engine
 * The generic engine is `round -> per-player deltas -> accumulating totals`. Here
 * **one round = one ledger event**, and a player's running **total = their net
 * position** in the tracking unit (dollars or chips):
 *
 * - **buyin**  — cash becomes chips at par, so net is unchanged: delta `0` for
 *   everyone. The amount is stored so we can tally what each player invested.
 * - **hand**   — chips move between players (zero-sum): delta = winnings − what
 *   you put in this hand. Built at any granularity (a tapped winner, or a full
 *   street-by-street run that produces side-pots).
 * - **cashout** — final chip counts reconcile the books: a player's delta is set
 *   so their running total lands exactly on `finalChips − invested`, whatever
 *   was (or wasn't) tracked hand-by-hand along the way.
 *
 * Chips are conserved, so across a whole session every delta set sums to 0, and
 * the settlement below always balances.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

/** How a table keeps score, and therefore how settlement is displayed. */
export type Unit = 'dollars' | 'chips' | 'chipsWithValue';

/** Default new-hand flow. Any single hand can still be escalated in the editor. */
export type Depth = 'ledger' | 'perhand' | 'betting';

export type Mode = 'cash' | 'tournament';

export interface HoldemConfig {
  /** What amounts are entered in; `chipsWithValue` converts to money for settle-up. */
  unit: Unit;
  /** Chips per one money unit — only meaningful when `unit === 'chipsWithValue'`. */
  chipsPerUnit: number;
  /** Pre-filled amount for the one-tap "+ Buy-in" / rebuy button. */
  defaultBuyin: number;
  /** Starting stack for full-betting hands (chips brought into a hand). */
  startingStack: number;
  /** Whether rebuys are offered between hands. */
  rebuys: boolean;
  /** Default granularity of a new hand. */
  depth: Depth;
  /** Cash (open-ended) vs tournament (play down to one stack). */
  mode: Mode;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  /** Minutes per blind level (tournament level timer). */
  blindMinutes: number;
}

const DEFAULTS: HoldemConfig = {
  unit: 'dollars',
  chipsPerUnit: 100,
  defaultBuyin: 20,
  startingStack: 1000,
  rebuys: true,
  depth: 'ledger',
  mode: 'cash',
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  blindMinutes: 15,
};

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function readConfig(config: Record<string, unknown>): HoldemConfig {
  const unitRaw = String(config.unit);
  const unit: Unit =
    unitRaw === 'chips' || unitRaw === 'chipsWithValue' ? (unitRaw as Unit) : 'dollars';
  const depthRaw = String(config.depth);
  const depth: Depth =
    depthRaw === 'perhand' || depthRaw === 'betting' ? (depthRaw as Depth) : 'ledger';
  const mode: Mode = String(config.mode) === 'tournament' ? 'tournament' : 'cash';
  return {
    unit,
    chipsPerUnit: Math.max(1, Math.trunc(num(config.chipsPerUnit, DEFAULTS.chipsPerUnit))),
    defaultBuyin: Math.max(0, num(config.defaultBuyin, DEFAULTS.defaultBuyin)),
    startingStack: Math.max(1, Math.trunc(num(config.startingStack, DEFAULTS.startingStack))),
    rebuys: config.rebuys === undefined ? DEFAULTS.rebuys : !!config.rebuys,
    depth,
    mode,
    smallBlind: Math.max(0, num(config.smallBlind, DEFAULTS.smallBlind)),
    bigBlind: Math.max(0, num(config.bigBlind, DEFAULTS.bigBlind)),
    ante: Math.max(0, num(config.ante, DEFAULTS.ante)),
    blindMinutes: Math.max(1, Math.trunc(num(config.blindMinutes, DEFAULTS.blindMinutes))),
  };
}

/** Convert a base-unit amount to money for display (only differs when chipsWithValue). */
export function toMoney(amount: number, cfg: HoldemConfig): number {
  return cfg.unit === 'chipsWithValue' ? amount / cfg.chipsPerUnit : amount;
}

// ─────────────────────────────────────────────────────────────────────────────
// Round events
// ─────────────────────────────────────────────────────────────────────────────

/** One awarded pot (main or side): its size and who splits it. */
export interface PotResult {
  amount: number;
  /** Winners, ordered first-to-act (left of the button) so odd chips break left. */
  winnerIds: ID[];
  /** Optional label for the history summary ("Side pot", "Main"). */
  label?: string;
}

/** A single logged action during a full-betting hand (Level 3), for replay/audit. */
export interface ActionLogEntry {
  playerId: ID;
  street: Street;
  action: BetAction;
  /** Chips put in by this action (call/bet/raise/all-in), 0 for check/fold. */
  amount: number;
}

/** A buy-in or rebuy — money becomes chips at par, so it never moves net. */
export interface BuyinEvent {
  kind: 'buyin';
  playerId: ID;
  amount: number;
}

/** A settled hand: what each player put in, and how the pot(s) were awarded. */
export interface HandEvent {
  kind: 'hand';
  /** 2 = tapped winner + contributions, 3 = full street-by-street run. */
  level: 2 | 3;
  /** Chips each player committed to the pot this hand. */
  committed: Record<ID, number>;
  /** Awarded pots (one for level 2, one-or-more side-pots for level 3). */
  pots: PotResult[];
  /** Present for level 3: dealer button + blinds context and the action log. */
  button?: ID;
  blinds?: { sb: number; bb: number; ante: number };
  log?: ActionLogEntry[];
}

/** Final chip counts (for all players or just those leaving), reconciling the books. */
export interface CashoutEvent {
  kind: 'cashout';
  counts: Record<ID, number>;
}

export type HoldemEvent = BuyinEvent | HandEvent | CashoutEvent;

// ─────────────────────────────────────────────────────────────────────────────
// Full-betting types (Level 3)
// ─────────────────────────────────────────────────────────────────────────────

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type BetAction = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

/** A player's live state within one full-betting hand. */
export interface Seat {
  playerId: ID;
  /** Chips remaining in front of the player. */
  stack: number;
  /** Chips committed on the current street. */
  committedStreet: number;
  /** Chips committed across the whole hand so far. */
  committedHand: number;
  folded: boolean;
  allIn: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Side-pot algorithm — the part home games always get wrong
// ─────────────────────────────────────────────────────────────────────────────

/** A pot layer: its size and the players eligible to win it (contributed & not folded). */
export interface PotLayer {
  amount: number;
  eligible: ID[];
}

/**
 * Split all committed chips into a main pot and any side-pots created by all-ins
 * of differing sizes. Folded players' chips still *fund* the pots but can never
 * win them. Adjacent layers with an identical eligible set are merged so the
 * result is the minimal set of distinct pots.
 *
 * @param committed  chips each player put in across the whole hand
 * @param folded     ids of players who folded (chips stay in, eligibility lost)
 * @param order      seat order (left of button first) — orders `eligible` for
 *                   deterministic odd-chip breaking at showdown
 */
export function sidePots(
  committed: Record<ID, number>,
  folded: Iterable<ID>,
  order?: ID[],
): PotLayer[] {
  const foldedSet = new Set(folded);
  const seq = order ?? Object.keys(committed);
  // Work on a copy we can peel down layer by layer, in seat order.
  const remain = new Map<ID, number>();
  for (const id of seq) remain.set(id, Math.max(0, Math.round(committed[id] ?? 0)));
  // Include any contributor not named in `order`, so nothing is dropped.
  for (const id of Object.keys(committed)) {
    if (!remain.has(id)) remain.set(id, Math.max(0, Math.round(committed[id] ?? 0)));
  }

  const layers: PotLayer[] = [];
  for (;;) {
    // Smallest positive remaining contribution defines the next layer height.
    let m = Infinity;
    for (const v of remain.values()) if (v > 0 && v < m) m = v;
    if (!Number.isFinite(m)) break;

    let amount = 0;
    const eligible: ID[] = [];
    for (const [id, v] of remain) {
      if (v <= 0) continue;
      remain.set(id, v - m);
      amount += m;
      if (!foldedSet.has(id)) eligible.push(id);
    }
    layers.push({ amount, eligible });
  }

  // Merge adjacent layers whose eligible sets match — a single logical pot.
  const merged: PotLayer[] = [];
  for (const layer of layers) {
    const prev = merged[merged.length - 1];
    if (prev && sameSet(prev.eligible, layer.eligible)) prev.amount += layer.amount;
    else merged.push({ amount: layer.amount, eligible: [...layer.eligible] });
  }
  return merged;
}

function sameSet(a: ID[], b: ID[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * Evenly split a pot among its winners, awarding any odd remainder one chip at a
 * time to the earliest-acting winners (already ordered left of the button). Pure
 * integer math so chips never leak.
 */
export function splitPot(amount: number, winnerIds: ID[]): Record<ID, number> {
  const out: Record<ID, number> = {};
  const n = winnerIds.length;
  if (n === 0) return out;
  const whole = Math.floor(amount / n);
  let rem = amount - whole * n;
  for (const id of winnerIds) {
    out[id] = (out[id] ?? 0) + whole + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hand scoring — net chip delta per player for one settled hand
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Net chips per player for a settled hand: winnings from every awarded pot minus
 * what they committed. Zero-sum whenever the pots' total equals the chips put in
 * (always true for pots derived from contributions / {@link sidePots}).
 */
export function scoreHand(event: HandEvent): Record<ID, number> {
  const delta: Record<ID, number> = {};
  for (const [id, amt] of Object.entries(event.committed)) {
    delta[id] = (delta[id] ?? 0) - (Math.round(amt) || 0);
  }
  for (const pot of event.pots) {
    const shares = splitPot(Math.round(pot.amount) || 0, pot.winnerIds);
    for (const [id, s] of Object.entries(shares)) delta[id] = (delta[id] ?? 0) + s;
  }
  return delta;
}

/** Total chips a player has invested so far (sum of their buy-ins / rebuys). */
export function investedByPlayer(rounds: { input: unknown }[]): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const r of rounds) {
    const e = r.input as HoldemEvent | undefined;
    if (e?.kind === 'buyin') out[e.playerId] = (out[e.playerId] ?? 0) + (Number(e.amount) || 0);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine glue: score one event into per-player deltas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-player deltas for one ledger event, in the tracking unit. `buyin` moves
 * nothing (net-neutral); `hand` applies the zero-sum chip swing; `cashout` snaps
 * each named player's running total onto `finalChips − invested` so the books
 * reconcile no matter how much was tracked hand-by-hand.
 */
export function scoreEvent(event: HoldemEvent, ctx: RoundContext): Record<ID, number> {
  switch (event.kind) {
    case 'buyin':
      return {}; // net-neutral: chips in == cash in
    case 'hand':
      return scoreHand(event);
    case 'cashout': {
      const invested = investedByPlayer(ctx.rounds);
      const out: Record<ID, number> = {};
      for (const [id, count] of Object.entries(event.counts)) {
        const net = (Number(count) || 0) - (invested[id] ?? 0);
        const before = ctx.totals[id] ?? 0;
        out[id] = net - before; // land the running total exactly on net
      }
      return out;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Settlement — the headline "who owes whom"
// ─────────────────────────────────────────────────────────────────────────────

export interface Transfer {
  from: ID;
  to: ID;
  amount: number;
}

/**
 * Turn a set of net positions (must sum to ~0) into a *minimal* list of payments
 * that settles everyone up. Greedy: repeatedly send the biggest debtor's whole
 * debt to the biggest creditor, which yields at most n−1 transfers — the fewest
 * anyone has to hand over cash. Works in integer hundredths to dodge float drift.
 *
 * @param net       net position per player, in the tracking unit (+ = is owed)
 * @param minAmount payments strictly below this are dropped as rounding dust
 */
export function settle(net: Record<ID, number>, minAmount = 0.005): Transfer[] {
  const cents = (v: number) => Math.round(v * 100);
  const creditors: { id: ID; v: number }[] = [];
  const debtors: { id: ID; v: number }[] = [];
  for (const [id, raw] of Object.entries(net)) {
    const c = cents(raw);
    if (c > 0) creditors.push({ id, v: c });
    else if (c < 0) debtors.push({ id, v: -c });
  }
  // Largest first so the biggest imbalances clear in the fewest hops.
  creditors.sort((a, b) => b.v - a.v);
  debtors.sort((a, b) => b.v - a.v);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  const floor = cents(minAmount);
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    if (pay > 0 && pay >= floor) {
      transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: pay / 100 });
    }
    debtors[i].v -= pay;
    creditors[j].v -= pay;
    if (debtors[i].v <= 0) i++;
    if (creditors[j].v <= 0) j++;
  }
  return transfers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/** Return null when the event is recordable, else a short human-readable reason. */
export function validateEvent(event: HoldemEvent, ctx: RoundContext): string | null {
  switch (event.kind) {
    case 'buyin': {
      if (!ctx.players.some((p) => p.id === event.playerId)) return 'Pick who is buying in.';
      if (!(Number(event.amount) > 0)) return 'Buy-in must be more than 0.';
      return null;
    }
    case 'hand': {
      const committedTotal = Object.values(event.committed).reduce(
        (a, v) => a + (Number(v) || 0),
        0,
      );
      if (committedTotal <= 0) return 'No chips in the pot yet.';
      if (Object.values(event.committed).some((v) => Number(v) < 0))
        return 'Bets cannot be negative.';
      if (event.pots.length === 0 || event.pots.some((p) => p.winnerIds.length === 0))
        return 'Pick who wins the pot.';
      const potTotal = event.pots.reduce((a, p) => a + (Number(p.amount) || 0), 0);
      if (Math.round(potTotal) !== Math.round(committedTotal))
        return 'Pot awarded must equal the chips put in.';
      return null;
    }
    case 'cashout': {
      const ids = Object.keys(event.counts);
      if (ids.length === 0) return 'Enter final chip counts to settle up.';
      if (Object.values(event.counts).some((v) => !Number.isFinite(Number(v)) || Number(v) < 0))
        return 'Chip counts cannot be negative.';
      return null;
    }
  }
}

/**
 * Do the final chip counts reconcile with the money put on the table? Chips are
 * conserved, so a healthy count matches total buy-ins exactly. Returns the signed
 * difference (counted − invested) for the *counted* players; the editor surfaces a
 * gentle "off by N" nudge without blocking the save. Non-zero is legitimate when a
 * player pocketed or lost chips, so it's a warning, never an error.
 */
export function reconcileCashout(event: CashoutEvent, ctx: RoundContext): number {
  const invested = investedByPlayer(ctx.rounds);
  let counted = 0;
  let owed = 0;
  for (const id of Object.keys(event.counts)) {
    counted += Number(event.counts[id]) || 0;
    owed += invested[id] ?? 0;
  }
  return counted - owed;
}
