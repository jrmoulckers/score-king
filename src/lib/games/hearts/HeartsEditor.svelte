<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import type { HeartsInput } from './index';

  let { input = $bindable(), ctx }: { input: HeartsInput; ctx: RoundContext } = $props();

  const variantJack = $derived(!!ctx.config.variantJack);
  const total = $derived(
    Object.values(input.hearts).reduce((a, b) => a + (Number(b) || 0), 0),
  );

  function setQueen(id: string) {
    input.queen = input.queen === id ? null : id;
  }
  function setJack(id: string) {
    input.jack = input.jack === id ? null : id;
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="muted">Tap to assign the ♠Q{variantJack ? ' and ♦J' : ''}.</span>
    <span class="pill" class:score-bad={total !== 13}>♥ {total}/13</span>
  </div>

  {#each ctx.players as p (p.id)}
    <div class="prow">
      <div class="row spread" style="margin-bottom: 8px">
        <span class="row" style="gap: 8px">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        <Stepper bind:value={input.hearts[p.id]} min={0} max={13} label={`${p.name} hearts`} />
      </div>
      <div class="row" style="gap: 8px">
        <button type="button" class="toggle" class:on={input.queen === p.id} onclick={() => setQueen(p.id)}>
          ♠Q <span class="sub">(13)</span>
        </button>
        {#if variantJack}
          <button type="button" class="toggle jack" class:on={input.jack === p.id} onclick={() => setJack(p.id)}>
            ♦J <span class="sub">(−10)</span>
          </button>
        {/if}
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
  .toggle {
    flex: 1;
    padding: 9px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
  }
  .toggle .sub {
    color: var(--muted);
    font-weight: 500;
  }
  .toggle.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .toggle.on .sub {
    color: rgba(255, 255, 255, 0.8);
  }
</style>
