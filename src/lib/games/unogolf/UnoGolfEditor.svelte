<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { bumpOnChange } from '../../motion';
  import { haptic } from '../../haptics';
  import SinkBurst from './SinkBurst.svelte';
  import UnoGolfProgress from './UnoGolfProgress.svelte';
  import { closestToPin, handStrokes, resolveConfig, type UnoGolfInput } from './logic';

  let { input = $bindable(), ctx }: { input: UnoGolfInput; ctx: RoundContext } = $props();

  const cfg = $derived(resolveConfig(ctx.config));
  const hole = $derived(ctx.roundIndex + 1);
  const playerIds = $derived(ctx.players.map((p) => p.id));
  const parked = $derived(ctx.players.length - (input.out ? 1 : 0));

  // Race header (Target format): totals here are cumulative BEFORE this hole. The game
  // ends when any total reaches the cap, so the fill tracks the highest total; the 👑
  // tracks who's actually winning — the LOWEST total, since low wins in golf.
  const totalsBefore = $derived(ctx.totals ?? {});
  const maxTotal = $derived(
    playerIds.reduce((m, id) => Math.max(m, Number(totalsBefore[id]) || 0), 0),
  );
  const leaderId = $derived.by(() => {
    const vals = playerIds.map((id) => Number(totalsBefore[id]) || 0);
    if (!vals.length || vals.every((v) => v === 0)) return null;
    const best = Math.min(...vals);
    const i = vals.findIndex((v) => v === best);
    return i >= 0 ? playerIds[i] : null;
  });
  const leaderName = $derived(
    leaderId ? (ctx.players.find((p) => p.id === leaderId)?.name ?? '?') : null,
  );
  const leaderTotal = $derived(leaderId ? Number(totalsBefore[leaderId]) || 0 : 0);

  // Whoever parked closest to the pin this hole (fewest leftover strokes among the
  // players still counting). Null until it's a clear, non-tied call.
  const closestId = $derived(closestToPin(input, playerIds, cfg));

  let showKey = $state(false);
  // Per-player token that replays the "sank it" burst each time they drop the ball.
  let sinkToken = $state<Record<string, number>>({});

  function strokes(id: string): number {
    return input.out === id ? 0 : handStrokes(input.hands[id], cfg);
  }
  function projected(id: string): number {
    return (Number(totalsBefore[id]) || 0) + strokes(id);
  }

  function sink(id: string) {
    if (input.out === id) {
      input.out = null;
    } else {
      input.out = id;
      input.hands[id] = { numbers: 0, actions: 0, wilds: 0 };
      sinkToken[id] = (sinkToken[id] ?? 0) + 1;
      haptic('win');
    }
  }
</script>

<div class="stack">
  <UnoGolfProgress
    format={cfg.format}
    {hole}
    holes={cfg.holes}
    target={cfg.target}
    {leaderName}
    {leaderTotal}
    {maxTotal}
  />

  <div class="row spread">
    <span class="muted hint">
      {#if input.out}
        Tally the cards left in every other hand — lowest total wins.
      {:else}
        Someone sinks the hole for 0; everyone else counts what's left in hand.
      {/if}
    </span>
    <button
      type="button"
      class="btn small ghost"
      onclick={() => (showKey = !showKey)}
      aria-expanded={showKey}
    >
      Card values
    </button>
  </div>

  {#if showKey}
    <div class="key" role="note">
      <span class="chip">🔢 0–9 = face</span>
      <span class="chip">⛔ Action = {cfg.actionValue}</span>
      <span class="chip">🌈 Wild = {cfg.wildValue}</span>
    </div>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const isOut = input.out === p.id}
    {@const isClosest = !isOut && closestId === p.id}
    <div class="prow" class:out={isOut}>
      <SinkBurst token={isOut ? (sinkToken[p.id] ?? 0) : 0} />

      <div class="row spread head">
        <span class="row who">
          <Avatar name={p.name} color={p.color} />
          <strong class="ellipsis">{p.name}</strong>
        </span>
        {#if isOut}
          <span class="badge">⛳ Sank it</span>
        {:else}
          <span class="subtotal tnum" aria-label="{p.name} carries {strokes(p.id)} strokes this hole">
            +{strokes(p.id)}<span class="sub">strokes</span>
          </span>
        {/if}
      </div>

      <div class="row spread foot">
        <span class="tag" class:pin={isClosest}>
          {#if isOut}
            Cleared the hole — 0 strokes.
          {:else if isClosest}
            ⛳🎯 Closest to the pin
          {:else}
            &nbsp;
          {/if}
        </span>
        <span class="running">
          <span class="lbl">total</span>
          <span class="num tnum" use:bumpOnChange={projected(p.id)}>{projected(p.id)}</span>
        </span>
      </div>

      <div class="row sinkrow">
        <button
          type="button"
          class="sink"
          class:on={isOut}
          onclick={() => sink(p.id)}
          aria-pressed={isOut}
        >
          ⛳ {isOut ? 'Sank the hole' : 'Sank it?'}
        </button>
      </div>

      {#if !isOut}
        <div class="tally">
          <label class="f">
            <span class="klabel">🔢 Numbers <span class="khint">face value</span></span>
            <input
              type="number"
              min="0"
              inputmode="numeric"
              aria-label="{p.name} number-card face value"
              bind:value={input.hands[p.id].numbers}
            />
          </label>
          <label class="f">
            <span class="klabel">⛔ Actions <span class="khint">×{cfg.actionValue}</span></span>
            <Stepper bind:value={input.hands[p.id].actions} min={0} label="{p.name} action cards" />
          </label>
          <label class="f">
            <span class="klabel">🌈 Wilds <span class="khint">×{cfg.wildValue}</span></span>
            <Stepper bind:value={input.hands[p.id].wilds} min={0} label="{p.name} wild cards" />
          </label>
        </div>
      {/if}
    </div>
  {/each}

  <p class="muted foot-note">
    {#if input.out}
      {parked}
      {parked === 1 ? 'player counts' : 'players count'} their leftover strokes this hole.
    {:else}
      Someone always goes out to end a hole — tap ⛳ to sink it.
    {/if}
  </p>
</div>

<style>
  .prow {
    position: relative;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  /* The player who sank the hole took the best possible line — 0 strokes. That reads as
     a semantic-good win (green + ⛳ + words), never a second Royal Violet fill and never
     Crown Gold (reserved for the game leader/winner). */
  .prow.out {
    background: color-mix(in srgb, var(--good) 12%, var(--surface-2));
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
  }
  .head {
    align-items: center;
  }
  .who {
    gap: 8px;
    min-width: 0;
  }
  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    flex: none;
    font-weight: 700;
    color: var(--good);
  }
  .subtotal {
    flex: none;
    font-weight: 800;
  }
  .subtotal .sub {
    margin-left: 3px;
    font-weight: 500;
    font-size: 0.72rem;
    color: var(--muted);
  }

  .foot {
    align-items: baseline;
  }
  .tag {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag.pin {
    color: var(--good);
    font-weight: 700;
  }
  .running {
    flex: none;
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
  }
  .lbl {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .num {
    font-weight: 800;
  }

  .sinkrow {
    margin: 0;
  }
  .sink {
    flex: 1;
    min-height: 46px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--muted);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .sink:hover {
    color: var(--text);
    background: var(--surface-3);
  }
  /* Selected = green-good tint (marks the hole cleared), NOT a violet fill — the one
     Royal Violet action on the screen stays the shell's Save. */
  .sink.on {
    background: color-mix(in srgb, var(--good) 14%, var(--surface));
    border-color: color-mix(in srgb, var(--good) 55%, var(--border));
    color: var(--good);
  }
  .sink:active {
    transform: translateY(1px);
  }
  .sink:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .tally {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .klabel {
    font-size: 0.78rem;
    color: var(--muted);
    font-weight: 600;
    white-space: nowrap;
  }
  .klabel .khint {
    font-weight: 500;
    opacity: 0.85;
  }
  .f input {
    width: 92px;
    min-height: 46px;
    padding: 11px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .f input:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }

  .key {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .chip {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .hint {
    font-size: 0.85rem;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
  .foot-note {
    margin: 2px 0 0;
    font-size: 0.82rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .prow,
    .sink {
      transition: none;
    }
  }
</style>
