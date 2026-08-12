<script lang="ts">
  import type { ID, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import {
    sidePots,
    type ActionLogEntry,
    type HandEvent,
    type HoldemConfig,
    type PotLayer,
    type Street,
  } from './logic';

  const {
    ctx,
    cfg,
    onSettle,
  }: {
    ctx: RoundContext;
    cfg: HoldemConfig;
    /** Called with the fully-settled hand the moment showdown resolves. */
    onSettle: (hand: HandEvent) => void;
  } = $props();

  interface LiveSeat {
    id: ID;
    name: string;
    color: string;
    stack: number;
    committedStreet: number;
    committedHand: number;
    folded: boolean;
    allIn: boolean;
    acted: boolean;
    /** No chips at the table — sits the hand out entirely. */
    out: boolean;
  }

  const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];
  const STREET_LABEL: Record<Street, string> = {
    preflop: 'Preflop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River',
    showdown: 'Showdown',
  };

  // Current chips in front of each player = what they bought in plus their net so
  // far. So full-betting stacks carry across hands with no separate chip ledger.
  function currentStack(id: ID): number {
    let invested = 0;
    for (const r of ctx.rounds) {
      const e = r.input as { kind?: string; playerId?: ID; amount?: number } | undefined;
      if (e?.kind === 'buyin' && e.playerId === id) invested += Number(e.amount) || 0;
    }
    return Math.max(0, Math.round(invested + (ctx.totals[id] ?? 0)));
  }

  // Button advances one seat per hand played so far.
  const handsPlayed = $derived(
    ctx.rounds.filter((r) => (r.input as { kind?: string })?.kind === 'hand').length,
  );

  let seats = $state<LiveSeat[]>([]);
  let street = $state<Street>('preflop');
  let currentBet = $state(0);
  // svelte-ignore state_referenced_locally
  let minRaise = $state(cfg.bigBlind || 1);
  let acting = $state(-1);
  let buttonIndex = $state(0);
  let log = $state<ActionLogEntry[]>([]);
  let phase = $state<'betting' | 'showdown' | 'done'>('betting');
  let layers = $state<PotLayer[]>([]);
  let potWinners = $state<Record<number, ID[]>>({});
  let raiseTo = $state(0);
  let showRaise = $state(false);
  let inited = false;

  const n = $derived(seats.length);
  const inHand = $derived(seats.filter((s) => !s.folded && !s.out));
  const canAct = $derived(inHand.filter((s) => !s.allIn && s.stack > 0));
  const pot = $derived(seats.reduce((a, s) => a + s.committedHand, 0));
  const actingSeat = $derived(acting >= 0 ? seats[acting] : null);
  const toCall = $derived(actingSeat ? Math.max(0, currentBet - actingSeat.committedStreet) : 0);
  const callCapped = $derived(actingSeat ? Math.min(toCall, actingSeat.stack) : 0);

  $effect(() => {
    if (inited) return;
    inited = true;
    init();
  });

  function init() {
    const players = ctx.players;
    const nn = players.length;
    buttonIndex = nn ? handsPlayed % nn : 0;
    seats = players.map((p) => {
      const stack = currentStack(p.id);
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        stack,
        committedStreet: 0,
        committedHand: 0,
        folded: false,
        allIn: false,
        acted: false,
        out: stack <= 0,
      };
    });
    postBlinds();
  }

  function idxAfter(from: number, pred: (s: LiveSeat) => boolean): number {
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      if (pred(seats[i])) return i;
    }
    return -1;
  }

  function postBlinds() {
    const live = seats.filter((s) => !s.out);
    if (live.length < 2) {
      // Not enough chips in play to run a hand — bail to a trivial showdown.
      goShowdown();
      return;
    }
    // Antes first.
    if (cfg.ante > 0) for (const s of seats) if (!s.out) commit(s, cfg.ante);
    // Heads-up: the button is the small blind and acts first preflop.
    const headsUp = live.length === 2;
    const sbIndex = headsUp ? buttonIndex : idxAfter(buttonIndex, (s) => !s.out);
    const bbIndex = idxAfter(sbIndex, (s) => !s.out);
    if (cfg.smallBlind > 0) commit(seats[sbIndex], cfg.smallBlind);
    if (cfg.bigBlind > 0) commit(seats[bbIndex], cfg.bigBlind);
    currentBet = Math.max(cfg.bigBlind, cfg.smallBlind, 0);
    minRaise = cfg.bigBlind || 1;
    for (const s of seats) s.acted = false; // blind posters still owe an action (BB option)
    street = 'preflop';
    acting = idxAfter(bbIndex, canActPred);
    if (acting < 0) closeStreet();
  }

  const canActPred = (s: LiveSeat) =>
    !s.folded && !s.out && !s.allIn && s.stack > 0 && (!s.acted || s.committedStreet < currentBet);

  /** Move `amount` (capped to stack) from a seat's stack into the pot. */
  function commit(s: LiveSeat, amount: number) {
    const put = Math.max(0, Math.min(amount, s.stack));
    s.stack -= put;
    s.committedStreet += put;
    s.committedHand += put;
    if (s.stack === 0) s.allIn = true;
  }

  function record(s: LiveSeat, action: ActionLogEntry['action'], amount: number) {
    log = [...log, { playerId: s.id, street, action, amount }];
  }

  function advance() {
    acting = idxAfter(acting, canActPred);
    if (acting < 0) closeStreet();
  }

  function fold() {
    const s = actingSeat;
    if (!s) return;
    s.folded = true;
    s.acted = true;
    record(s, 'fold', 0);
    haptic('tick');
    advance();
  }

  function checkCall() {
    const s = actingSeat;
    if (!s) return;
    if (callCapped > 0) {
      commit(s, callCapped);
      record(s, 'call', callCapped);
    } else {
      record(s, 'check', 0);
    }
    s.acted = true;
    haptic('tick');
    advance();
  }

  function allIn() {
    const s = actingSeat;
    if (!s) return;
    const put = s.stack;
    const target = s.committedStreet + put;
    commit(s, put);
    record(s, 'allin', put);
    if (target > currentBet) {
      const fullRaise = target - currentBet >= minRaise;
      if (fullRaise) {
        minRaise = target - currentBet;
        for (const o of seats) if (o !== s && !o.folded && !o.out && !o.allIn) o.acted = false;
      }
      currentBet = target;
    }
    s.acted = true;
    haptic('win');
    advance();
  }

  function openRaise() {
    const s = actingSeat;
    if (!s) return;
    const min = Math.min(currentBet + minRaise, s.committedStreet + s.stack);
    raiseTo = min;
    showRaise = true;
  }

  function potFraction(frac: number) {
    const s = actingSeat;
    if (!s) return;
    const call = Math.max(0, currentBet - s.committedStreet);
    const potAfterCall = pot + call;
    const target = currentBet + Math.round(frac * potAfterCall);
    raiseTo = Math.max(currentBet + minRaise, Math.min(target, s.committedStreet + s.stack));
  }

  function confirmRaise() {
    const s = actingSeat;
    if (!s) return;
    const target = Math.min(Math.max(raiseTo, currentBet + 1), s.committedStreet + s.stack);
    const add = target - s.committedStreet;
    commit(s, add);
    const isAllIn = s.stack === 0;
    record(s, 'raise', add);
    const fullRaise = target - currentBet >= minRaise;
    if (!isAllIn || fullRaise) minRaise = target - currentBet;
    currentBet = target;
    for (const o of seats) if (o !== s && !o.folded && !o.out && !o.allIn) o.acted = false;
    s.acted = true;
    showRaise = false;
    haptic('win');
    advance();
  }

  function closeStreet() {
    // Everyone folded but one → that player takes it, no showdown needed.
    if (inHand.length <= 1) {
      finalizeSingle();
      return;
    }
    // No more decisions possible (all but one are all-in) → run it to showdown.
    if (canAct.length <= 1 && inHand.every((s) => s.committedStreet === currentBet || s.allIn)) {
      goShowdown();
      return;
    }
    const idx = STREETS.indexOf(street);
    if (idx >= STREETS.length - 1) {
      goShowdown();
      return;
    }
    // Next street: clear street commitments, reopen action, first active left of button.
    street = STREETS[idx + 1];
    currentBet = 0;
    minRaise = cfg.bigBlind || 1;
    for (const s of seats) {
      s.committedStreet = 0;
      s.acted = false;
    }
    acting = idxAfter(buttonIndex, canActPred);
    if (acting < 0) closeStreet();
  }

  function order(): ID[] {
    // Seat order starting left of the button — drives odd-chip tie-breaking.
    const ids: ID[] = [];
    for (let k = 1; k <= n; k++) ids.push(seats[(buttonIndex + k) % n].id);
    return ids;
  }

  function committedMap(): Record<ID, number> {
    const m: Record<ID, number> = {};
    for (const s of seats) if (s.committedHand > 0) m[s.id] = s.committedHand;
    return m;
  }

  function finalizeSingle() {
    const winner = inHand[0];
    acting = -1;
    phase = 'done';
    writeHand([{ amount: pot, winnerIds: winner ? [winner.id] : [] }]);
  }

  function goShowdown() {
    acting = -1;
    const folded = seats.filter((s) => s.folded).map((s) => s.id);
    layers = sidePots(committedMap(), folded, order());
    potWinners = {};
    // Auto-select the sole eligible player for any single-candidate pot.
    layers.forEach((l, i) => {
      if (l.eligible.length === 1) potWinners[i] = [...l.eligible];
    });
    phase = layers.length ? 'showdown' : 'done';
    if (!layers.length) writeHand([]);
  }

  function toggleWinner(layerIdx: number, id: ID) {
    const cur = potWinners[layerIdx] ?? [];
    potWinners[layerIdx] = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  }

  const allPotsAwarded = $derived(
    phase === 'showdown' && layers.every((_, i) => (potWinners[i] ?? []).length > 0),
  );

  function awardPots() {
    if (!allPotsAwarded) return;
    const seq = order();
    const pots = layers.map((l, i) => {
      const winners = seq.filter((id) => (potWinners[i] ?? []).includes(id));
      return {
        amount: l.amount,
        winnerIds: winners,
        label: layers.length > 1 ? (i === 0 ? 'Main pot' : `Side pot ${i}`) : undefined,
      };
    });
    phase = 'done';
    writeHand(pots);
    haptic('win');
  }

  /** Commit the settled hand up to the editor, which the shell then saves. */
  function writeHand(pots: HandEvent['pots']) {
    onSettle({
      kind: 'hand',
      level: 3,
      committed: committedMap(),
      pots,
      button: seats[buttonIndex]?.id,
      blinds: { sb: cfg.smallBlind, bb: cfg.bigBlind, ante: cfg.ante },
      log,
    });
  }

  const dealerName = $derived(seats[buttonIndex]?.name ?? '');
</script>

<div class="board">
  <div class="felt-table">
    <span class="suit-mark" aria-hidden="true">♠</span>
    <div class="topline">
      <span class="pill">{STREET_LABEL[street]}</span>
      <span class="pill">🔘 {dealerName}</span>
      <span class="pill"
        >SB {cfg.smallBlind} / BB {cfg.bigBlind}{cfg.ante ? ` · ante ${cfg.ante}` : ''}</span
      >
    </div>

    <div class="pot">
      <span class="pot-label">Pot</span>
      <span class="pot-num">{pot.toLocaleString()}</span>
    </div>
  </div>

  <ul class="seats">
    {#each seats as s, i (s.id)}
      <li class="seat" class:acting={i === acting} class:folded={s.folded} class:out={s.out}>
        <Avatar name={s.name} color={s.color} size={26} decorative />
        <span class="nm">
          {s.name}
          {#if i === buttonIndex}<span class="dot" title="Dealer">🔘</span>{/if}
        </span>
        <span class="tags">
          {#if s.out}<span class="tag">no chips</span>
          {:else if s.folded}<span class="tag">folded</span>
          {:else if s.allIn}<span class="tag allin">all-in</span>
          {:else if s.committedStreet > 0}<span class="tag bet">{s.committedStreet}</span>{/if}
        </span>
        <span class="stack">{s.stack.toLocaleString()}</span>
      </li>
    {/each}
  </ul>

  {#if phase === 'betting' && actingSeat}
    <div class="turn">
      <strong>{actingSeat.name}</strong> to act
    </div>
    {#if showRaise}
      <div class="raise">
        <div class="quick">
          <button type="button" class="btn small" onclick={() => potFraction(0.5)}>½ pot</button>
          <button type="button" class="btn small" onclick={() => potFraction(0.75)}>¾ pot</button>
          <button type="button" class="btn small" onclick={() => potFraction(1)}>Pot</button>
          <button
            type="button"
            class="btn small"
            onclick={() => (raiseTo = actingSeat.committedStreet + actingSeat.stack)}>Max</button
          >
        </div>
        <div class="raise-row">
          <Stepper
            bind:value={raiseTo}
            min={currentBet + 1}
            max={actingSeat.committedStreet + actingSeat.stack}
            step={cfg.bigBlind || 1}
            label="Raise to"
          />
          <button type="button" class="btn primary" onclick={confirmRaise}
            >Raise to {raiseTo.toLocaleString()}</button
          >
        </div>
        <button type="button" class="btn ghost small" onclick={() => (showRaise = false)}
          >Cancel</button
        >
      </div>
    {:else}
      <div class="actions">
        <button type="button" class="btn danger" onclick={fold}>Fold</button>
        <button type="button" class="btn" onclick={checkCall}>
          {callCapped > 0 ? `Call ${callCapped.toLocaleString()}` : 'Check'}
        </button>
        {#if actingSeat.stack > callCapped}
          <button type="button" class="btn primary" onclick={openRaise}>
            {currentBet > 0 ? 'Raise' : 'Bet'}
          </button>
        {/if}
        <button type="button" class="btn" onclick={allIn}
          >All-in {actingSeat.stack.toLocaleString()}</button
        >
      </div>
    {/if}
  {:else if phase === 'showdown'}
    <div class="showdown">
      <div class="section-title">Showdown — who wins each pot?</div>
      {#each layers as l, i (i)}
        <div class="potlayer">
          <div class="potlayer-head">
            <span class="pl-name"
              >{layers.length > 1 ? (i === 0 ? 'Main pot' : `Side pot ${i}`) : 'Pot'}</span
            >
            <span class="pl-amt">{l.amount.toLocaleString()}</span>
          </div>
          <div class="cands">
            {#each l.eligible as id (id)}
              {@const s = seats.find((x) => x.id === id)}
              <button
                type="button"
                class="cand"
                class:on={(potWinners[i] ?? []).includes(id)}
                aria-pressed={(potWinners[i] ?? []).includes(id)}
                onclick={() => toggleWinner(i, id)}
              >
                {#if s}<Avatar name={s.name} color={s.color} size={22} decorative />{/if}
                <span>{s?.name ?? id}</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
      <button
        type="button"
        class="btn primary block"
        disabled={!allPotsAwarded}
        onclick={awardPots}
      >
        Award {layers.length > 1 ? 'pots' : 'pot'}
      </button>
    </div>
  {:else}
    <div class="done">✅ Hand settled — tap <strong>Save</strong> to record it.</div>
  {/if}
</div>

<style>
  .board {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .topline {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    position: relative;
    z-index: 1;
  }
  /* The card table: the pot sits on deep baize, dealer/blind chips resting on the rail.
     The one per-game costume surface — felt tokens live in app.css, documented in
     DESIGN.md as the Hold'em accent. Static (no motion) and the same in both themes. */
  .felt-table {
    position: relative;
    overflow: hidden;
    padding: 12px 14px 16px;
    border-radius: var(--radius);
    background: radial-gradient(120% 90% at 50% 22%, var(--felt) 0%, var(--felt-edge) 100%);
    box-shadow:
      inset 0 0 0 2px var(--felt-line),
      inset 0 0 44px color-mix(in srgb, var(--felt-edge) 70%, transparent);
  }
  .suit-mark {
    position: absolute;
    right: 8px;
    bottom: -14px;
    font-size: 5.5rem;
    line-height: 1;
    color: var(--felt-line);
    pointer-events: none;
    user-select: none;
  }
  /* Chips on the rail: translucent so the baize reads through, light ink for contrast. */
  .felt-table .pill {
    background: color-mix(in srgb, var(--felt-edge) 62%, transparent);
    border-color: var(--felt-line);
    color: var(--felt-ink);
    font-variant-numeric: tabular-nums;
  }
  .pot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding-top: 12px;
    position: relative;
    z-index: 1;
  }
  .pot-label {
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--felt-ink) 72%, transparent);
  }
  .pot-num {
    font-size: 2.1rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--felt-ink);
    text-shadow: 0 1px 0 color-mix(in srgb, var(--felt-edge) 75%, transparent);
  }
  .seats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .seat {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    transition:
      border-color var(--dur-base) var(--ease-standard),
      opacity var(--dur-base) var(--ease-standard);
  }
  .seat.acting {
    border-color: var(--primary);
    background: var(--surface-2);
  }
  .seat.folded,
  .seat.out {
    opacity: 0.5;
  }
  .nm {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stack {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    min-width: 4em;
    text-align: right;
  }
  .tags {
    display: inline-flex;
    gap: 4px;
  }
  .tag {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: var(--radius-pill, 999px);
    background: var(--surface-3);
    color: var(--muted);
  }
  .tag.bet {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .tag.allin {
    color: var(--warn);
  }
  .turn {
    text-align: center;
    color: var(--muted);
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .raise {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .quick {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .raise-row {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }
  .potlayer {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    margin-bottom: 8px;
  }
  .potlayer-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .pl-amt {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .cands {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cand {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 46px;
    padding: 4px 14px 4px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill, 999px);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .cand.on {
    border-color: var(--primary);
    background: var(--surface-2);
  }
  .cand:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .done {
    text-align: center;
    color: var(--muted);
    padding: 8px 0;
  }
  .dot {
    font-size: 0.7em;
  }
</style>
