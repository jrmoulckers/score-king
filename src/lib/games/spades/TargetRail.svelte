<script lang="ts">
  import { targetView } from './logic';

  /**
   * A slim "race to the target" rail for one scoring unit: where it stands now,
   * where this hand's projected delta lands it, and how that measures against the
   * winning score. Complements (never duplicates) the shared Scoreboard by showing
   * finish-line proximity and *this hand's* swing. The number + words always carry
   * the meaning; the fill uses neutral/primary only. Crown Gold is reserved for the
   * leader/winner — so a 👑 shows solely when this unit already leads the table.
   */
  let {
    /** The unit's cumulative total before this hand. */
    before,
    /** This hand's projected delta for the unit. */
    delta,
    /** Winning score; 0/absent means open-ended (rail hides). */
    target,
    /** True when this unit currently leads the table (drives the 👑, from ctx.totals). */
    leading = false,
  }: { before: number; delta: number; target: number; leading?: boolean } = $props();

  const v = $derived(targetView(before, delta, target));
  // Clamp the fill to the rail; a projected total can exceed the target (a win).
  const pct = $derived(
    v.target > 0 ? Math.max(0, Math.min(100, (v.projected / v.target) * 100)) : 0,
  );
  const nowPct = $derived(
    v.target > 0 ? Math.max(0, Math.min(100, (v.before / v.target) * 100)) : 0,
  );
  const signedDelta = $derived(delta >= 0 ? `+${delta}` : `${delta}`);
</script>

{#if target > 0}
  <div class="rail" class:reach={v.reaches}>
    <div class="bar" aria-hidden="true">
      <span class="fill proj" style="transform: scaleX({pct / 100})"></span>
      <span class="fill now" style="transform: scaleX({nowPct / 100})"></span>
    </div>
    <div class="cap">
      <span class="race">
        🏁 <span class="n">{before}</span>
        <span class="arrow" aria-hidden="true">→</span>
        <span class="n proj-n">{v.projected}</span>
        <span class="of">/ {target}</span>
      </span>
      <span class="tag">
        {#if v.reaches}
          👑 reign! <span class="swing">({signedDelta})</span>
        {:else}
          {v.remaining} to go <span class="swing">({signedDelta})</span>
        {/if}
        {#if leading && !v.reaches}<span class="lead" title="Leading">👑</span>{/if}
      </span>
    </div>
  </div>
{/if}

<style>
  .rail {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .bar {
    position: relative;
    height: 6px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    transform-origin: left center;
    border-radius: 999px;
    transition: transform var(--dur-base, 0.2s) var(--ease-standard, ease);
  }
  /* Two layers: the settled total, and a lighter projected reach ahead of it. */
  .fill.proj {
    background: color-mix(in srgb, var(--primary) 40%, transparent);
  }
  .fill.now {
    background: var(--primary);
  }
  .rail.reach .fill.proj {
    background: color-mix(in srgb, var(--primary) 70%, transparent);
  }
  .cap {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.76rem;
    color: var(--muted);
  }
  .race {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-variant-numeric: tabular-nums;
  }
  .n {
    font-weight: 700;
    color: var(--text);
  }
  .proj-n {
    color: var(--primary);
  }
  .of {
    color: var(--muted);
  }
  .arrow {
    color: var(--muted);
  }
  .tag {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .rail.reach .tag {
    color: var(--text);
  }
  .swing {
    color: var(--muted);
    font-weight: 500;
  }
</style>
