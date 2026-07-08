<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { holeCeiling, holeFloor, holeTag, readConfig, rulesetLines, type GolfInput } from './logic';

  let { input = $bindable(), ctx }: { input: GolfInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));
  const n = $derived(ctx.roundIndex + 1);
  const floor = $derived(holeFloor(cfg));
  const ceil = $derived(holeCeiling(cfg));
  let showRules = $state(false);

  function projected(id: string): number {
    return (ctx.totals[id] ?? 0) + (Math.trunc(Number(input.scores[id]) || 0));
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="pill">⛳ Hole {n} / {cfg.holes}</span>
    <button type="button" class="btn small ghost" onclick={() => (showRules = !showRules)}>
      Card values
    </button>
  </div>

  {#if showRules}
    <div class="help">
      {#each rulesetLines(cfg) as line}<div>{line}</div>{/each}
    </div>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const tag = holeTag(Math.trunc(Number(input.scores[p.id]) || 0))}
    <div class="prow">
      <div class="row spread">
        <span class="row" style="gap: 8px">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        <Stepper bind:value={input.scores[p.id]} min={floor} max={ceil} />
      </div>
      <div class="row spread foot">
        <span class="tag" class:under={tag === 'under'}>
          {#if tag === 'under'}🐦 under par{:else if tag === 'clean'}⛳ clean sheet{:else}&nbsp;{/if}
        </span>
        <span class="running">
          <span class="lbl">total</span>
          <span class="num">{projected(p.id)}</span>
        </span>
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
  .foot {
    margin-top: 8px;
  }
  .tag {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--muted);
  }
  .tag.under {
    color: var(--good);
  }
  .running {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
  }
  .lbl {
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .num {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .help {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
