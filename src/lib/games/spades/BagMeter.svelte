<script lang="ts">
  import { animateMotion, prefersReducedMotion } from '../../motion';
  import { bagDanger, bagsToPenalty, type BagDanger } from './logic';

  /**
   * Spades' signature costume: a meter of the sticky "bags" a unit is carrying,
   * filling toward the flat −100 sandbag hit. The bag count and the words
   * ("N to the −100 hit" / the danger caption) always carry the meaning, so the
   * colour escalation and the burst are decoration only — fully skipped under
   * reduced motion. Colour uses the semantic caution/loss tokens, never Crown
   * Gold (which belongs to the leader/winner alone). Lives entirely inside the
   * Spades editor and never touches the shared chrome.
   */
  let {
    /** Bags the unit carries after this hand — the 0..threshold-1 remainder. */
    bags,
    /** Bags that trip the flat −100 (the config's bag threshold). */
    threshold,
    /** How many −100 penalties this hand tripped (drives the burst + tag). */
    penalties = 0,
  }: { bags: number; threshold: number; penalties?: number } = $props();

  const level = $derived<BagDanger>(bagDanger(bags, threshold, penalties));
  const toHit = $derived(bagsToPenalty(bags, threshold));
  // Pips shown: a compact row capped so a huge house-rule threshold never sprawls.
  const pipCount = $derived(Math.min(Math.max(threshold, 1), 12));
  const filled = $derived(
    threshold > 0 ? Math.round((bags / threshold) * pipCount) : 0,
  );

  const caption = $derived(
    penalties > 0
      ? `💥 bags burst · −${100 * penalties}`
      : level === 'critical'
        ? 'one more and it pops!'
        : level === 'heavy'
          ? 'getting heavy'
          : 'traveling light',
  );

  // A one-shot shudder when a hand tips the pile over the threshold. The −100 is
  // already shown in the caption + the score, so this is pure delight.
  let meterEl: HTMLDivElement | undefined = $state();
  let prevPenalties = 0;
  let firstRun = true;
  $effect(() => {
    const p = penalties;
    if (firstRun) {
      firstRun = false;
      prevPenalties = p;
      return;
    }
    if (p > prevPenalties && meterEl && !prefersReducedMotion()) {
      animateMotion(
        meterEl,
        { x: [0, -3, 3, -2, 2, 0], scale: [1, 1.03, 1] },
        { duration: 0.4, ease: 'easeOut' },
      );
    }
    prevPenalties = p;
  });
</script>

<div class="meter" data-level={level} bind:this={meterEl}>
  <div class="track" aria-hidden="true">
    {#each Array(pipCount) as _, i (i)}
      <span class="pip" class:on={i < filled}></span>
    {/each}
  </div>
  <div class="read">
    <span class="tally">🛍️ {bags} {bags === 1 ? 'bag' : 'bags'}</span>
    <span class="dot" aria-hidden="true">·</span>
    <span class="hint">
      {#if penalties > 0}
        {caption}
      {:else}
        {toHit} to the −100 hit · {caption}
      {/if}
    </span>
  </div>
</div>

<style>
  .meter {
    display: flex;
    flex-direction: column;
    gap: 6px;
    /* Level tints stay on the semantic caution/loss tokens — never gold. */
    --meter: var(--muted);
  }
  .meter[data-level='heavy'] {
    --meter: var(--warn);
  }
  .meter[data-level='critical'] {
    --meter: var(--bad);
  }
  .track {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .pip {
    flex: 1;
    height: 7px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    transition: background var(--dur-base, 0.2s) var(--ease-standard, ease);
  }
  .pip.on {
    background: var(--meter);
    border-color: var(--meter);
  }
  .read {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 0.78rem;
    flex-wrap: wrap;
  }
  .tally {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--meter);
  }
  .dot {
    color: var(--muted);
  }
  .hint {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .meter[data-level='critical'] .hint {
    color: var(--bad);
    font-weight: 600;
  }
</style>
