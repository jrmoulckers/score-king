<script lang="ts">
  import { onMount } from 'svelte';
  import { animateMotion, prefersReducedMotion } from '../../motion';
  import { legName } from './logic';

  /**
   * Skull King's per-game "costume": a 10-leg voyage strip with a ship that sails
   * to the current round. Pure Skull King flavor — it lives entirely inside the
   * game editor and never touches the shared chrome. The round number and leg
   * name carry the meaning in text, so the sailing animation is decoration only
   * and is fully skipped under reduced motion (the ship simply appears at its leg).
   */
  let { round, total }: { round: number; total: number } = $props();

  const legs = $derived(Array.from({ length: total }, (_, i) => i + 1));
  const name = $derived(legName(round, total));
  const isFinal = $derived(round === total);
  // Ship sits centered over the current leg: (index + 0.5) / total across the track.
  const shipPct = $derived(total > 0 ? ((round - 0.5) / total) * 100 : 0);

  let ship: HTMLSpanElement | undefined = $state();

  onMount(() => {
    if (!ship || prefersReducedMotion()) return;
    // Sail in from the previous leg with a gentle bob, then a bigger flourish on
    // the final round — the Skull King's Gauntlet deserves a flag-raising beat.
    const from = total > 0 ? Math.max(0, ((round - 1.5) / total) * 100) : 0;
    animateMotion(
      ship,
      isFinal
        ? { left: [`${from}%`, `${shipPct}%`], rotate: [-8, 8, -4, 0], scale: [0.9, 1.25, 1] }
        : { left: [`${from}%`, `${shipPct}%`], rotate: [-6, 4, 0] },
      { duration: isFinal ? 0.9 : 0.6, ease: 'easeOut' },
    );
  });
</script>

<div class="voyage" class:final={isFinal}>
  <div class="cap">
    <span class="leg">Leg {round} of {total}</span>
    <span class="name">{isFinal ? '💀 ' : ''}{name}{isFinal ? ' 👑' : ''}</span>
  </div>
  <div class="sea" aria-hidden="true">
    <div class="track">
      {#each legs as l (l)}
        <span class="dot" class:done={l < round} class:here={l === round}></span>
      {/each}
    </div>
    <span class="ship" bind:this={ship} style="left: {shipPct}%">{isFinal ? '🏴‍☠️' : '⛵'}</span>
  </div>
</div>

<style>
  .voyage {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .voyage.final {
    border-color: var(--primary);
  }
  .cap {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .leg {
    font-size: 0.78rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .name {
    font-weight: 700;
    font-size: 0.92rem;
    text-align: right;
  }
  .sea {
    position: relative;
    height: 26px;
  }
  .track {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
  }
  .dot.done {
    background: var(--primary);
    border-color: var(--primary);
    opacity: 0.55;
  }
  .dot.here {
    background: var(--primary);
    border-color: var(--primary-strong);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent);
  }
  .ship {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    font-size: 1.25rem;
    line-height: 1;
    pointer-events: none;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
  }
</style>
