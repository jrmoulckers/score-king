<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import {
    FINSPAN_CATEGORIES,
    FINSPAN_HELP,
    categoryPoints,
    emptyRow,
    scoreRow,
    type FinspanInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: FinspanInput; ctx: RoundContext } = $props();

  // Guarantee every seated player has a row, even one added after the sheet was created.
  $effect(() => {
    for (const p of ctx.players) {
      if (!input.values[p.id]) input.values[p.id] = emptyRow();
    }
  });

  let showHelp = $state(false);

  function total(id: string): number {
    return scoreRow(input.values[id]);
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="pill">🐟 Final scoresheet · week 4</span>
    <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
      Scoring
    </button>
  </div>

  {#if showHelp}
    <pre class="help">{FINSPAN_HELP}</pre>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const row = input.values[p.id]}
    {#if row}
      <div class="prow">
        <div class="row spread phead">
          <span class="row" style="gap: 8px">
            <Avatar name={p.name} color={p.color} />
            <strong>{p.name}</strong>
          </span>
          <span class="total">{total(p.id)}<span class="unit">pts</span></span>
        </div>
        <div class="grid">
          {#each FINSPAN_CATEGORIES as c (c.key)}
            <div class="f">
              <span class="flabel">
                <span aria-hidden="true">{c.emoji}</span>
                {c.label}{#if c.per !== 1}<span class="mult">×{c.per}</span>{/if}
              </span>
              {#if c.entry === 'count'}
                <Stepper bind:value={row[c.key]} min={0} />
              {:else}
                <input
                  class="pts"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  aria-label={`${p.name} ${c.label}`}
                  bind:value={row[c.key]}
                />
              {/if}
              {#if c.per !== 1}
                <span class="contrib">= {categoryPoints(c, row[c.key])} pts</span>
              {/if}
            </div>
          {/each}
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
  }
  .phead {
    margin-bottom: 10px;
  }
  .total {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-weight: 800;
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
  }
  .unit {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--muted);
  }
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .flabel {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .mult {
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .pts {
    width: 88px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .contrib {
    font-size: 0.72rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
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
