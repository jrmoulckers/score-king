<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import {
    LEFTOVER_CATEGORY,
    emptyRow,
    scoreRow,
    scoringCategories,
    tracksFood,
    type WingspanRow,
    type WingspanInput,
  } from './logic';
  import { wingspan } from './index';

  let { input = $bindable(), ctx }: { input: WingspanInput; ctx: RoundContext } = $props();

  const cats = $derived(scoringCategories(ctx.config));
  const showFood = $derived(tracksFood(ctx.config));
  let showHelp = $state(false);

  // Keep the draft's shape in sync with the current players and config, so every stepper always
  // has a real number to bind to — even if a player joined, or Nectar toggled on, after this
  // scoresheet draft was first created. Mirrors the custom-game editor's self-healing draft.
  $effect(() => {
    if (!input.rows) input.rows = {};
    const base = emptyRow();
    for (const p of ctx.players) {
      let row = input.rows[p.id];
      if (!row) {
        input.rows[p.id] = emptyRow();
        continue;
      }
      for (const k of Object.keys(base) as (keyof WingspanRow)[]) {
        if (typeof row[k] !== 'number') row[k] = base[k];
      }
    }
  });

  function total(id: string): number {
    return scoreRow(input.rows?.[id]);
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="pill">Final scoresheet 🪶</span>
    <button
      type="button"
      class="btn small ghost"
      onclick={() => (showHelp = !showHelp)}
      aria-expanded={showHelp}
    >
      Scoring
    </button>
  </div>

  {#if showHelp}
    <pre class="help">{wingspan.help}</pre>
  {/if}

  {#each ctx.players as p (p.id)}
    <div class="prow">
      <div class="phead">
        <span class="who">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        <span class="total">
          <span class="totnum">{total(p.id)}</span>
          <span class="totlbl">pts</span>
        </span>
      </div>

      {#if input.rows?.[p.id]}
        <div class="grid">
          {#each cats as c (c.key)}
            <label class="cell">
              <span class="clabel"><span class="cemoji" aria-hidden="true">{c.emoji}</span>{c.short}</span>
              <Stepper bind:value={input.rows[p.id][c.key]} min={0} max={999} />
            </label>
          {/each}
        </div>

        {#if showFood}
          <div class="tiebreak">
            <label class="cell">
              <span class="clabel">
                <span class="cemoji" aria-hidden="true">{LEFTOVER_CATEGORY.emoji}</span>{LEFTOVER_CATEGORY.label}
              </span>
              <Stepper bind:value={input.rows[p.id].leftover} min={0} max={999} />
            </label>
            <span class="tienote">Breaks ties · not scored</span>
          </div>
        {/if}
      {/if}
    </div>
  {/each}
</div>

<style>
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
  }
  .phead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .who strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .total {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    flex: none;
  }
  .totnum {
    font-size: 1.5rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .totlbl {
    font-size: 0.75rem;
    color: var(--muted);
    font-weight: 600;
  }
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 18px;
  }
  .cell {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .clabel {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
  }
  .cemoji {
    font-size: 0.95rem;
  }
  .tiebreak {
    display: flex;
    align-items: flex-end;
    gap: 14px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px dashed var(--border);
  }
  .tienote {
    font-size: 0.75rem;
    color: var(--muted);
    padding-bottom: 12px;
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
    line-height: 1.5;
  }
</style>
