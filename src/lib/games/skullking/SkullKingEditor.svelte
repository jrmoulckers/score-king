<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { scoreRow, skullking, type SKInput } from './index';

  let { input = $bindable(), ctx }: { input: SKInput; ctx: RoundContext } = $props();

  const n = $derived(ctx.roundIndex + 1);
  const requireBid = $derived(ctx.config.bonusesRequireBid !== false);
  const won = $derived(
    ctx.players.reduce((a, p) => a + (Number(input.rows[p.id]?.actual) || 0), 0),
  );
  let showHelp = $state(false);

  function preview(id: string): number {
    return scoreRow(input.rows[id], n, requireBid);
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="pill">Round {n} · {n} {n === 1 ? 'trick' : 'tricks'}</span>
    <span class="row" style="gap: 8px">
      <span class="pill" class:score-bad={won > n}>won {won}/{n}</span>
      <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
        Bonuses
      </button>
    </span>
  </div>

  {#if showHelp}
    <pre class="help">{skullking.help}</pre>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const row = input.rows[p.id]}
    <div class="prow">
      <div class="row spread" style="margin-bottom: 10px">
        <span class="row" style="gap: 8px">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        <span
          class="preview"
          class:score-good={preview(p.id) >= 0}
          class:score-bad={preview(p.id) < 0}
        >
          {preview(p.id) >= 0 ? '+' : ''}{preview(p.id)}
        </span>
      </div>
      <div class="fields">
        <label class="f">Bid<Stepper bind:value={row.bid} min={0} max={n} /></label>
        <label class="f">Won<Stepper bind:value={row.actual} min={0} max={n} /></label>
        <label class="f">Bonus<input type="number" step="10" bind:value={row.bonus} /></label>
      </div>
    </div>
  {/each}
</div>

<style>
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
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
  .preview {
    font-weight: 800;
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
