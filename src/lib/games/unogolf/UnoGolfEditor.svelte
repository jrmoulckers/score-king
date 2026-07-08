<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { handStrokes, resolveConfig, type UnoGolfInput } from './logic';

  let { input = $bindable(), ctx }: { input: UnoGolfInput; ctx: RoundContext } = $props();

  const cfg = $derived(resolveConfig(ctx.config));
  const hole = $derived(ctx.roundIndex + 1);
  const totalHoles = $derived(cfg.format === 'holes' ? cfg.holes : null);
  const parked = $derived(ctx.players.length - (input.out ? 1 : 0));

  let showKey = $state(false);

  function strokes(id: string): number {
    return input.out === id ? 0 : handStrokes(input.hands[id], cfg);
  }

  function sink(id: string) {
    if (input.out === id) {
      input.out = null;
    } else {
      input.out = id;
      input.hands[id] = { numbers: 0, actions: 0, wilds: 0 };
    }
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="pill">
      {#if totalHoles}⛳ Hole {hole} of {totalHoles}{:else}⛳ Hole {hole}{/if}
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
      <span class="chip">0–9 = face</span>
      <span class="chip">Action = {cfg.actionValue}</span>
      <span class="chip">Wild = {cfg.wildValue}</span>
    </div>
  {/if}

  <p class="muted hint">
    {#if input.out}
      Tally the cards left in each other hand — number faces, then action &amp; wild counts.
    {:else}
      Tap ⛳ to mark who went out, then tally the cards left in every other hand.
    {/if}
  </p>

  {#each ctx.players as p (p.id)}
    {@const isOut = input.out === p.id}
    <div class="prow" class:out={isOut}>
      <div class="row spread head">
        <span class="row who">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        <span class="preview" class:score-good={isOut}>
          {#if isOut}
            <span class="sank">⛳ 0</span>
          {:else}
            +{strokes(p.id)}
          {/if}
        </span>
      </div>

      <div class="row sinkrow">
        <button
          type="button"
          class="toggle"
          class:on={isOut}
          onclick={() => sink(p.id)}
          aria-pressed={isOut}
        >
          ⛳ {isOut ? 'Sank the hole' : 'Sank it?'}
        </button>
      </div>

      {#if isOut}
        <p class="cleared muted">Cleared the hole — 0 strokes.</p>
      {:else}
        <div class="fields">
          <label class="f">
            <span>Number cards</span>
            <input
              type="number"
              min="0"
              inputmode="numeric"
              bind:value={input.hands[p.id].numbers}
            />
          </label>
          <label class="f">
            <span>Actions ×{cfg.actionValue}</span>
            <Stepper bind:value={input.hands[p.id].actions} min={0} />
          </label>
          <label class="f">
            <span>Wilds ×{cfg.wildValue}</span>
            <Stepper bind:value={input.hands[p.id].wilds} min={0} />
          </label>
        </div>
      {/if}
    </div>
  {/each}

  <p class="muted foot">
    {#if input.out}
      {parked}
      {parked === 1 ? 'player counts' : 'players count'} their leftover strokes this hole.
    {:else}
      Someone always goes out to end a hole — mark them with ⛳.
    {/if}
  </p>
</div>

<style>
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .prow.out {
    background: var(--surface-3);
    border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
  }
  .head {
    margin-bottom: 10px;
  }
  .who {
    gap: 8px;
  }
  .sinkrow {
    margin-bottom: 10px;
  }
  .toggle {
    flex: 1;
    min-height: 46px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .toggle.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .preview {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .sank {
    white-space: nowrap;
  }
  .fields {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .f input {
    width: 84px;
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
    margin: 0;
    font-size: 0.85rem;
  }
  .cleared {
    margin: 2px 0 0;
    font-size: 0.85rem;
  }
  .foot {
    margin: 2px 0 0;
    font-size: 0.82rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .prow,
    .toggle {
      transition: none;
    }
  }
</style>
