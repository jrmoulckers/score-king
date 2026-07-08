<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { opponentsTotal, readConfig, type UnoInput } from './logic';

  let { input = $bindable(), ctx }: { input: UnoInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));
  const golf = $derived(cfg.mode === 'golf');
  const playerIds = $derived(ctx.players.map((p) => p.id));
  const pot = $derived(opponentsTotal(input, playerIds));

  function goOut(id: string) {
    if (input.out === id) {
      input.out = null;
    } else {
      input.out = id;
      input.left[id] = 0; // whoever went out is holding nothing
    }
  }

  function add(id: string, amount: number) {
    input.left[id] = Math.max(0, (Number(input.left[id]) || 0) + amount);
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="muted">
      {input.out ? 'Now tally everyone else’s leftover cards.' : 'Who emptied their hand? Tap 🎉'}
    </span>
    {#if golf}
      <span class="pill">⛳ Low score wins</span>
    {:else if input.out}
      <span class="pill take"><span class="tnum">🎉 +{pot}</span></span>
    {/if}
  </div>

  {#each ctx.players as p (p.id)}
    {@const isOut = input.out === p.id}
    <div class="prow">
      <div class="row spread">
        <span class="row" style="gap: 8px; min-width: 0">
          <Avatar name={p.name} color={p.color} />
          <strong class="ellipsis">{p.name}</strong>
        </span>
        <button
          type="button"
          class="wentout"
          class:on={isOut}
          aria-pressed={isOut}
          onclick={() => goOut(p.id)}
        >
          {isOut ? '🎉 Went out' : 'Went out'}
        </button>
      </div>

      {#if isOut}
        <p class="note">
          {golf
            ? 'Empty hand — banks 0 this round.'
            : `Scoops the table · +${pot} point${pot === 1 ? '' : 's'}`}
        </p>
      {:else}
        <div class="entry">
          <div class="chips">
            <button type="button" class="chip" onclick={() => add(p.id, cfg.actionValue)}>
              +{cfg.actionValue}<span class="sub">action</span>
            </button>
            <button type="button" class="chip" onclick={() => add(p.id, cfg.wildValue)}>
              +{cfg.wildValue}<span class="sub">wild</span>
            </button>
          </div>
          <label class="left">
            <span class="sub">leftover</span>
            <Stepper bind:value={input.left[p.id]} min={0} />
          </label>
        </div>
      {/if}
    </div>
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
  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wentout {
    flex: none;
    min-height: 46px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--muted);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .wentout:hover {
    color: var(--text);
  }
  .wentout.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .wentout:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .note {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .entry {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-height: 46px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .chip:hover {
    background: var(--surface-3);
    border-color: var(--primary);
  }
  .chip:active {
    transform: translateY(1px);
  }
  .chip:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-end;
  }
  .sub {
    color: var(--muted);
    font-weight: 500;
    font-size: 0.78rem;
  }
  .take {
    color: var(--good);
    border-color: color-mix(in srgb, var(--good) 40%, var(--border));
    font-weight: 700;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
</style>
