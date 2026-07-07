<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import type { CustomInput } from './types';
  import { COUNTER_COLUMN_KEY, effectiveColumns } from './types';
  import { getCustomDef } from './defRegistry';

  let { input = $bindable(), ctx }: { input: CustomInput; ctx: RoundContext } = $props();

  const def = $derived(getCustomDef(ctx.game.type));
  const cols = $derived(def ? effectiveColumns(def) : []);
  const columnsMode = $derived(def?.inputShape === 'columns');
  const step = $derived(def && def.step && def.step > 0 ? def.step : 1);

  // Keep the draft's shape in sync with the def and the current players. This makes the
  // editor robust when a def gained/lost a column, or a player joined, since the round
  // was first created — every stepper always has a real number to bind to.
  $effect(() => {
    if (!def) return;
    if (!input.values) input.values = {};
    for (const p of ctx.players) {
      let row = input.values[p.id];
      if (!row) {
        row = {};
        input.values[p.id] = row;
      }
      for (const c of cols) {
        if (typeof row[c.key] !== 'number') row[c.key] = 0;
      }
    }
  });
</script>

<div class="stack">
  {#each ctx.players as p (p.id)}
    {#if columnsMode}
      <div class="prow cols">
        <span class="who">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        <div class="fields">
          {#each cols as c (c.key)}
            <div class="field">
              <span class="collabel">
                {c.label}{#if c.negative}<span class="neg" aria-label="subtracts"> −</span>{/if}
              </span>
              {#if input.values?.[p.id]}
                <Stepper bind:value={input.values[p.id][c.key]} {step} />
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="prow spread">
        <span class="who">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        {#if input.values?.[p.id]}
          <Stepper bind:value={input.values[p.id][COUNTER_COLUMN_KEY]} {step} />
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .prow {
    display: flex;
    gap: 10px;
  }
  .prow.spread {
    align-items: center;
    justify-content: space-between;
  }
  .prow.cols {
    flex-direction: column;
    align-items: stretch;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .collabel {
    font-size: 0.8rem;
    color: var(--muted);
    font-weight: 600;
  }
  .neg {
    color: var(--muted);
  }
</style>
