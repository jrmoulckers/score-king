<script lang="ts">
  import { haptic } from '../../haptics';
  import {
    cardCodes,
    cardLabel,
    cardValue,
    computeGrid,
    gridShape,
    type CardCode,
    type GolfConfig,
  } from './logic';

  /**
   * Golf's flagship "tap the grid" helper — an optional card layout that mirrors
   * the physical grid on the table (3×2 / 2×2 / 3×3). Tap a cell to set its card;
   * two-or-more matching cards in the same column strike through (they cancel to 0,
   * the heart of Golf), and the hole total is computed live and handed back to the
   * editor via {@link onscore}. Pure convenience layered over the manual stepper —
   * every cell is ≥46px, the total is tabular, and the strike + "cancels" wording
   * co-signal the cancel so it never rests on colour alone.
   */
  let {
    cfg,
    cells = $bindable(),
    onscore,
    label = '',
  }: {
    cfg: GolfConfig;
    cells: (CardCode | null)[];
    onscore: (total: number) => void;
    label?: string;
  } = $props();

  const shape = $derived(gridShape(cfg.grid));
  const size = $derived(shape.cols * shape.rows);
  const codes = $derived(cardCodes(cfg));

  // Keep the cell array sized to the current ruleset (grid size can differ per game).
  $effect(() => {
    if (cells.length !== size) {
      const next = cells.slice(0, size);
      while (next.length < size) next.push(null);
      cells = next;
    }
  });

  const breakdown = $derived(computeGrid(cells, cfg));
  const filled = $derived(cells.some((c) => c != null));
  const canceledCount = $derived(breakdown.canceled.filter(Boolean).length);

  // Push the computed total up whenever the laid-out grid changes, but only once
  // a card is actually placed — an untouched helper never overwrites a typed score.
  let prev = -Infinity;
  $effect(() => {
    const t = breakdown.total;
    if (filled && t !== prev) {
      prev = t;
      onscore(t);
    }
  });

  let picking = $state<number | null>(null);

  function openCell(i: number) {
    picking = picking === i ? null : i;
  }
  function setCard(i: number, code: CardCode | null) {
    cells[i] = code;
    picking = null;
    haptic('tick');
  }
  function clearAll() {
    for (let i = 0; i < cells.length; i++) cells[i] = null;
    prev = -Infinity;
    picking = null;
    haptic('tick');
    onscore(0);
  }
</script>

<div class="grid-helper">
  <div
    class="grid"
    style="grid-template-columns: repeat({shape.cols}, 1fr)"
    role="group"
    aria-label={label ? `${label} card grid` : 'Card grid'}
  >
    {#each cells as code, i (i)}
      {@const canceled = breakdown.canceled[i]}
      <button
        type="button"
        class="cell"
        class:set={code != null}
        class:canceled
        aria-pressed={picking === i}
        aria-label={code ? `Card ${cardLabel(code)}${canceled ? ', cancelled' : ''} — change` : `Empty cell — add a card`}
        onclick={() => openCell(i)}
      >
        {#if code}
          <span class="face">{cardLabel(code)}</span>
          {#if canceled}<span class="strike" aria-hidden="true">⊘</span>{/if}
        {:else}
          <span class="plus" aria-hidden="true">＋</span>
        {/if}
      </button>
    {/each}
  </div>

  {#if picking !== null}
    <div class="picker" role="group" aria-label="Pick a card">
      {#each codes as code (code)}
        <button type="button" class="pick" onclick={() => setCard(picking!, code)}>
          <span class="pface">{cardLabel(code)}</span>
          <span class="pval">{cardValue(code, cfg)}</span>
        </button>
      {/each}
      <button type="button" class="pick clear" onclick={() => setCard(picking!, null)}>
        <span class="pface">⌫</span>
        <span class="pval">clear</span>
      </button>
    </div>
  {/if}

  <div class="foot row spread">
    <span class="hint">
      {#if canceledCount > 0}
        ⊘ {canceledCount} card{canceledCount === 1 ? '' : 's'} cancel in-column
      {:else if filled}
        Tap a card to change it
      {:else}
        Tap a cell to lay out your grid
      {/if}
    </span>
    <span class="tot">
      <span class="tlbl">hole</span>
      <span class="tnum">{breakdown.total}</span>
      {#if filled}
        <button type="button" class="clr" onclick={clearAll} aria-label="Clear the grid">clear</button>
      {/if}
    </span>
  </div>
</div>

<style>
  .grid-helper {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
  }
  .grid {
    display: grid;
    gap: 8px;
    /* Keep the felt compact so the whole hand fits a thumb's reach. */
    max-width: 260px;
  }
  .cell {
    position: relative;
    aspect-ratio: 3 / 4;
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font-weight: 800;
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
    transition: transform var(--dur-press, 90ms) var(--ease-standard, ease),
      border-color var(--dur-base, 180ms) var(--ease-standard, ease);
  }
  .cell:active {
    transform: scale(0.95);
  }
  .cell.set {
    background: var(--surface-3);
    border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
  }
  .cell.canceled .face {
    opacity: 0.4;
    text-decoration: line-through;
  }
  .cell.canceled {
    border-style: dashed;
    border-color: color-mix(in srgb, var(--good) 55%, var(--border));
  }
  .strike {
    position: absolute;
    top: 2px;
    right: 4px;
    font-size: 0.7rem;
    color: var(--good);
  }
  .plus {
    color: var(--muted);
    font-weight: 700;
    font-size: 1.1rem;
  }
  .picker {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
    gap: 6px;
  }
  .pick {
    min-height: 46px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
  }
  .pick:active {
    transform: translateY(1px);
  }
  .pick.clear {
    color: var(--muted);
  }
  .pface {
    font-size: 0.98rem;
    line-height: 1.1;
  }
  .pval {
    font-size: 0.66rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .foot {
    align-items: center;
  }
  .hint {
    font-size: 0.78rem;
    color: var(--muted);
  }
  .tot {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
  }
  .tlbl {
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .tnum {
    font-weight: 800;
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
  }
  .clr {
    border: none;
    background: transparent;
    color: var(--muted);
    font-size: 0.72rem;
    cursor: pointer;
    padding: 2px 4px;
    text-decoration: underline;
  }
</style>
