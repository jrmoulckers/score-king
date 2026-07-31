<script lang="ts">
  import type { ID, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import TableBank from './TableBank.svelte';
  import BettingBoard from './BettingBoard.svelte';
  import Settlement from './Settlement.svelte';
  import {
    investedByPlayer,
    readConfig,
    reconcileCashout,
    scoreHand,
    toMoney,
    type HoldemEvent,
    type HoldemConfig,
  } from './logic';

  let { input = $bindable(), ctx }: { input: HoldemEvent; ctx: RoundContext } = $props();

  const cfg = $derived<HoldemConfig>(readConfig(ctx.config));
  const invested = $derived(investedByPlayer(ctx.rounds));

  // The chosen event kind, seeded from the incoming draft (a buy-in by default).
  // svelte-ignore state_referenced_locally
  let kind = $state<HoldemEvent['kind']>(input?.kind ?? 'buyin');
  // For a hand: quick per-hand ('2') vs full street betting ('3'); string for Segmented.
  // svelte-ignore state_referenced_locally
  let handMode = $state<'2' | '3'>(readConfig(ctx.config).depth === 'betting' ? '3' : '2');

  // Buy-in draft state.
  let buyinPlayer = $state<ID>('');
  let buyinAmount = $state(0);
  // Per-hand (level 2) draft state.
  let committed = $state<Record<ID, number>>({});
  let winners = $state<ID[]>([]);
  // Cash-out draft state.
  let counts = $state<Record<ID, number>>({});

  let ready = false;
  $effect(() => {
    if (ready) return;
    ready = true;
    if (input?.kind === 'buyin') {
      buyinPlayer = input.playerId || ctx.players[0]?.id || '';
      buyinAmount = Number(input.amount) || cfg.defaultBuyin;
    } else {
      buyinPlayer = ctx.players.find((p) => !(invested[p.id] > 0))?.id ?? ctx.players[0]?.id ?? '';
      buyinAmount = cfg.defaultBuyin;
    }
    for (const p of ctx.players) {
      committed[p.id] = 0;
      counts[p.id] = Math.max(0, Math.round((invested[p.id] ?? 0) + (ctx.totals[p.id] ?? 0)));
    }
    syncInput();
  });

  function fmtMoney(amount: number): string {
    const v = Math.round(toMoney(amount, cfg) * 100) / 100;
    const body = Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
    return cfg.unit === 'chips' ? body : `$${body}`;
  }

  /** Order winners by seating so split odd chips are deterministic. */
  function orderWinners(ids: ID[]): ID[] {
    return ctx.players.map((p) => p.id).filter((id) => ids.includes(id));
  }

  // ── Keep the bound draft in lock-step with the active sub-editor ─────────────
  // Full-betting hands are the exception: BettingBoard pushes its result through
  // onSettle, so this only maintains buy-in / per-hand / cash-out drafts.
  function syncInput() {
    if (kind === 'buyin') {
      input = { kind: 'buyin', playerId: buyinPlayer, amount: buyinAmount };
    } else if (kind === 'cashout') {
      const counted: Record<ID, number> = {};
      for (const p of ctx.players) counted[p.id] = Number(counts[p.id]) || 0;
      input = { kind: 'cashout', counts: counted };
    } else if (handMode === '2') {
      const c: Record<ID, number> = {};
      let potTotal = 0;
      for (const p of ctx.players) {
        const v = Math.max(0, Math.round(Number(committed[p.id]) || 0));
        if (v > 0) c[p.id] = v;
        potTotal += v;
      }
      const win = orderWinners(winners.filter((id) => ctx.players.some((p) => p.id === id)));
      input = {
        kind: 'hand',
        level: 2,
        committed: c,
        pots: win.length && potTotal > 0 ? [{ amount: potTotal, winnerIds: win }] : [],
      };
    }
  }

  // React to the mode switchers. Track the last applied state so we rebuild the
  // draft exactly once per real change (never during an unrelated re-render).
  // svelte-ignore state_referenced_locally
  let lastKind = kind;
  // svelte-ignore state_referenced_locally
  let lastHandMode = handMode;
  $effect(() => {
    const k = kind;
    const hm = handMode;
    if (k === lastKind && hm === lastHandMode) return;
    lastKind = k;
    lastHandMode = hm;
    if (k === 'hand' && hm === '3') {
      input = { kind: 'hand', level: 3, committed: {}, pots: [] }; // empty shell; BettingBoard fills it
    } else {
      syncInput();
    }
    haptic('tick');
  });

  // Buy-in interactions.
  function selectBuyin(id: ID) {
    buyinPlayer = id;
    syncInput();
    haptic('tick');
  }
  $effect(() => {
    void buyinAmount;
    if (kind === 'buyin') syncInput();
  });

  // Per-hand (level 2) interactions.
  function toggleWinner(id: ID) {
    winners = winners.includes(id) ? winners.filter((x) => x !== id) : [...winners, id];
    syncInput();
    haptic('tick');
  }
  $effect(() => {
    void JSON.stringify(committed);
    if (kind === 'hand' && handMode === '2') syncInput();
  });

  // Cash-out interactions.
  $effect(() => {
    void JSON.stringify(counts);
    if (kind === 'cashout') syncInput();
  });

  function onHandSettled(hand: HoldemEvent) {
    input = hand;
  }

  const potLevel2 = $derived(
    ctx.players.reduce((a, p) => a + Math.max(0, Math.round(Number(committed[p.id]) || 0)), 0),
  );

  // Live projection for the bank preview: how this pending event moves each net.
  const projection = $derived.by<Record<ID, number>>(() => {
    if (kind === 'hand') {
      const ev = input;
      if (ev?.kind === 'hand' && ev.pots.length) return scoreHand(ev);
      return {};
    }
    if (kind === 'cashout') {
      const out: Record<ID, number> = {};
      for (const p of ctx.players) {
        const net = (Number(counts[p.id]) || 0) - (invested[p.id] ?? 0);
        out[p.id] = net - (ctx.totals[p.id] ?? 0);
      }
      return out;
    }
    return {}; // buy-in is net-neutral
  });

  // Final net per player if we cashed out now — feeds the settle-up preview.
  const finalNet = $derived.by<Record<ID, number>>(() => {
    const out: Record<ID, number> = {};
    for (const p of ctx.players) out[p.id] = (Number(counts[p.id]) || 0) - (invested[p.id] ?? 0);
    return out;
  });

  const cashoutDiff = $derived(
    kind === 'cashout' && input?.kind === 'cashout' ? reconcileCashout(input, ctx) : 0,
  );
</script>

<div class="holdem stack">
  <TableBank {ctx} {cfg} {projection} />

  <Segmented
    label="What happened?"
    bind:value={kind}
    options={[
      { value: 'buyin', label: '💰 Buy-in' },
      { value: 'hand', label: '♠️ Hand' },
      { value: 'cashout', label: '🧮 Cash out' },
    ]}
  />

  {#if kind === 'buyin'}
    <div class="pane stack">
      <span class="section-title">Who's buying in?</span>
      <div class="chips">
        {#each ctx.players as p (p.id)}
          <button
            type="button"
            class="pchip"
            class:on={buyinPlayer === p.id}
            aria-pressed={buyinPlayer === p.id}
            onclick={() => selectBuyin(p.id)}
          >
            <Avatar name={p.name} color={p.color} size={24} decorative />
            <span>{p.name}</span>
            {#if invested[p.id] > 0}<span class="reb">rebuy</span>{/if}
          </button>
        {/each}
      </div>
      <div class="amount-row">
        <span class="section-title">Amount</span>
        <Stepper bind:value={buyinAmount} min={1} step={1} label="Buy-in amount" />
        <button type="button" class="btn small" onclick={() => (buyinAmount = cfg.defaultBuyin)}>
          Default {fmtMoney(cfg.defaultBuyin)}
        </button>
      </div>
      <p class="note muted">Buying in doesn't move who's up or down — cash just becomes chips.</p>
    </div>
  {:else if kind === 'hand'}
    <div class="pane stack">
      <Segmented
        label="How much detail?"
        bind:value={handMode}
        options={[
          { value: '2', label: 'Quick' },
          { value: '3', label: 'Full betting' },
        ]}
      />

      {#if handMode === '2'}
        <span class="section-title">Chips each player put in — then tap the winner(s)</span>
        <ul class="hand-rows">
          {#each ctx.players as p (p.id)}
            <li class="hrow" class:win={winners.includes(p.id)}>
              <button
                type="button"
                class="star"
                class:on={winners.includes(p.id)}
                aria-pressed={winners.includes(p.id)}
                aria-label={`${p.name} wins`}
                onclick={() => toggleWinner(p.id)}
              >{winners.includes(p.id) ? '⭐' : '☆'}</button>
              <Avatar name={p.name} color={p.color} size={24} decorative />
              <span class="nm">{p.name}</span>
              <Stepper bind:value={committed[p.id]} min={0} step={cfg.bigBlind || 1} label={`${p.name} chips in`} />
            </li>
          {/each}
        </ul>
        <div class="pot-line">
          <span class="section-title">Pot</span>
          <span class="pot-val">{potLevel2.toLocaleString()}</span>
        </div>
      {:else}
        <BettingBoard {ctx} {cfg} onSettle={onHandSettled} />
      {/if}
    </div>
  {:else}
    <div class="pane stack">
      <span class="section-title">Final chip counts</span>
      <ul class="hand-rows">
        {#each ctx.players as p (p.id)}
          <li class="hrow">
            <Avatar name={p.name} color={p.color} size={24} decorative />
            <span class="nm">{p.name}</span>
            <Stepper bind:value={counts[p.id]} min={0} step={cfg.bigBlind || 1} label={`${p.name} final chips`} />
          </li>
        {/each}
      </ul>
      {#if Math.round(cashoutDiff) !== 0}
        <p class="warn-note" role="status">
          ⚠️ Counts are off by {fmtMoney(Math.abs(cashoutDiff))}
          {cashoutDiff > 0 ? 'more' : 'less'} than the buy-ins. Recount, or save anyway if someone left with chips.
        </p>
      {/if}
      <Settlement net={finalNet} players={ctx.players} {cfg} />
    </div>
  {/if}
</div>

<style>
  .holdem {
    gap: 12px;
  }
  .pane {
    gap: 10px;
  }
  .chips,
  .hand-rows {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .hand-rows {
    flex-direction: column;
  }
  .pchip {
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
  .pchip.on {
    border-color: var(--primary);
    background: var(--surface-2);
  }
  .pchip:focus-visible,
  .star:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .reb {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .amount-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .hrow {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 4px 6px;
    border-radius: var(--radius-sm);
  }
  .hrow.win {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .star {
    background: transparent;
    border: 0;
    font-size: 1.3rem;
    line-height: 1;
    cursor: pointer;
    width: 46px;
    height: 46px;
  }
  .nm {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pot-line,
  .pot-val {
    font-variant-numeric: tabular-nums;
  }
  .pot-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-top: 4px;
  }
  .pot-val {
    font-weight: 800;
    font-size: 1.15rem;
  }
  .note {
    font-size: 0.85rem;
    margin: 0;
  }
  .warn-note {
    margin: 0;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--warn) 14%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
    font-size: 0.9rem;
  }
</style>
