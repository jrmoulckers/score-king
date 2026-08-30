<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { bumpOnChange } from '../../motion';
  import { wizard } from './index';
  import { cardsForRound, scoreRow, type WizardInput } from './logic';

  let { input = $bindable(), ctx }: { input: WizardInput; ctx: RoundContext } = $props();

  const n = $derived(cardsForRound(ctx.roundIndex));
  const bidSum = $derived(
    ctx.players.reduce((a, p) => a + (Number(input.rows[p.id]?.bid) || 0), 0),
  );
  const trickSum = $derived(
    ctx.players.reduce((a, p) => a + (Number(input.rows[p.id]?.tricks) || 0), 0),
  );
  const tableRead = $derived(
    bidSum === n ? '⚖️ dead even' : bidSum > n ? '🌊 over-bid table' : '🍃 bids to spare',
  );
  const left = $derived(n - trickSum);

  // Who's leading right now — crowned so the table can see the race, never
  // colour alone (the 👑 + "leading" label carry the state).
  const leaderIds = $derived(computeLeaders(ctx.players, ctx.totals));
  function computeLeaders(
    players: RoundContext['players'],
    totals: Record<string, number>,
  ): Set<string> {
    if (players.length < 2) return new Set();
    const vals = players.map((p) => totals[p.id] ?? 0);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    if (max === min) return new Set();
    return new Set(players.filter((p) => (totals[p.id] ?? 0) === max).map((p) => p.id));
  }

  function preview(id: string): number {
    return scoreRow(input.rows[id]);
  }

  let showHelp = $state(false);
</script>

<div class="stack">
  <div class="row spread wrap">
    <span class="pill" class:score-bad={trickSum > n}>
      🃏 {trickSum} of {n} tricks{#if left > 0}
        · {left} to go{:else if left === 0}
        · hand complete ✓{:else}
        · {-left} over!{/if}
    </span>
    <span class="row wrap" style="gap: 8px">
      <span class="pill">Bids: {bidSum} · {tableRead}</span>
      <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
        How to score
      </button>
    </span>
  </div>

  {#if showHelp}
    <pre class="help">{wizard.help}</pre>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const row = input.rows[p.id]}
    {#if row}
      {@const delta = preview(p.id)}
      {@const leading = leaderIds.has(p.id)}
      <div class="prow">
        <div class="phead row spread">
          <span class="who row" style="gap: 8px">
            <Avatar name={p.name} color={p.color} />
            <strong>{p.name}</strong>
            {#if leading}<span class="crown" title="Leading">👑</span>{/if}
          </span>
          <span
            class="proj"
            class:score-good={delta >= 0}
            class:score-bad={delta < 0}
            use:bumpOnChange={delta}
          >
            {delta >= 0 ? `+${delta}` : delta}
          </span>
        </div>

        <div class="fields row">
          <label class="f">
            <span>Bid</span>
            <Stepper bind:value={row.bid} min={0} max={n} label={`${p.name} bid`} />
          </label>
          <label class="f">
            <span>Tricks</span>
            <Stepper bind:value={row.tricks} min={0} max={n} label={`${p.name} tricks`} />
          </label>
        </div>
      </div>
    {/if}
  {/each}
</div>

<style>
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .who strong {
    font-weight: 700;
  }
  .crown {
    font-size: 0.95rem;
  }
  .proj {
    font-weight: 800;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    padding-left: 8px;
  }
  .fields {
    gap: 16px;
    flex-wrap: wrap;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .help {
    white-space: pre-wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    font-size: 0.85rem;
    margin: 0;
    font-family: inherit;
    color: var(--muted);
  }
</style>
