<script lang="ts">
  import { pipLayout } from './logic';

  /**
   * A real domino face rendered as dot-pips — the Chicken Foot personality atom.
   * Two halves (`a` | `b`) each draw their pips on a classic 3-column grid via the
   * pure {@link pipLayout} helper (double-9 → 3×3, double-12 → 3×4), so the same
   * component serves the big current-double face and the mini countdown tiles.
   *
   * Built entirely from the surface ramp and text/muted colors — never Royal Violet
   * or Crown Gold, which the shell reserves for the primary action and the leader.
   * The double-blank is the dreaded "goose egg": two empty halves rendered as a
   * hollow, muted ghost so the 0–0 reads as ominous, not broken.
   */
  let {
    a,
    b = a,
    size = 'lg',
    label = '',
  }: { a: number; b?: number; size?: 'sm' | 'lg'; label?: string } = $props();

  const blank = $derived((Number(a) || 0) <= 0 && (Number(b) || 0) <= 0);
  const halves = $derived([pipLayout(a), pipLayout(b)]);
</script>

<span
  class="domino {size}"
  class:blank
  role="img"
  aria-label={label || `Domino ${Math.max(0, a)}–${Math.max(0, b)}`}
>
  {#each halves as layout, i (i)}
    {#if i === 1}<span class="bar" aria-hidden="true"></span>{/if}
    <span class="half" style="--rows: {layout.rows}">
      {#each layout.dots as dot (`${dot.c}-${dot.r}`)}
        <span class="pip" style="grid-column: {dot.c + 1}; grid-row: {dot.r + 1};"></span>
      {/each}
    </span>
  {/each}
</span>

<style>
  .domino {
    display: inline-flex;
    align-items: stretch;
    background: var(--surface-3);
    border: 1px solid var(--border);
    overflow: hidden;
    line-height: 1;
    box-sizing: border-box;
  }
  .lg {
    border-radius: var(--radius-sm);
    --pip: 7px;
    --pad: 8px;
    --gap: 5px;
  }
  .sm {
    border-radius: var(--radius-sm);
    --pip: 2.5px;
    --pad: 3px;
    --gap: 2px;
  }
  .half {
    display: grid;
    grid-template-columns: repeat(3, var(--pip));
    grid-template-rows: repeat(var(--rows), var(--pip));
    gap: var(--gap);
    align-content: center;
    justify-content: center;
    padding: var(--pad);
    box-sizing: border-box;
  }
  .lg .half {
    min-width: 52px;
    min-height: 52px;
  }
  .sm .half {
    min-width: 20px;
    min-height: 20px;
  }
  .pip {
    width: var(--pip);
    height: var(--pip);
    border-radius: 50%;
    background: var(--text);
    align-self: center;
    justify-self: center;
  }
  .bar {
    width: 1px;
    background: var(--border);
  }

  /* The goose egg: a hollow, muted domino so the dreaded 0–0 reads as ominous. */
  .blank {
    background: color-mix(in srgb, var(--bad) 6%, var(--surface-2));
    border-style: dashed;
    border-color: color-mix(in srgb, var(--bad) 40%, var(--border));
  }
</style>
