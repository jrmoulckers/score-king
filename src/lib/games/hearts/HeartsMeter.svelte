<script lang="ts">
  const {
    points = 0,
    total = 26,
    moonReady = false,
    hearts,
    totalHearts,
    queens,
    totalQueens,
  }: {
    points?: number;
    total?: number;
    moonReady?: boolean;
    hearts: number;
    totalHearts: number;
    queens: number;
    totalQueens: number;
  } = $props();

  const left = $derived(Math.max(0, total - points));
  const over = $derived(points > total || hearts > totalHearts || queens > totalQueens);
  const heartsLeft = $derived(Math.max(0, totalHearts - hearts));
  const queensLeft = $derived(Math.max(0, totalQueens - queens));
  const stacks = $derived([
    {
      suit: 'heart',
      glyph: '♥',
      total: totalHearts,
      left: heartsLeft,
      points: hearts,
      maxPoints: totalHearts,
      label: 'Heart points placed',
    },
    {
      suit: 'queen',
      glyph: 'Q♠',
      total: totalQueens,
      left: queensLeft,
      points: queens * 13,
      maxPoints: totalQueens * 13,
      label: 'Queen of Spades points placed',
    },
  ]);

  const caption = $derived(
    moonReady
      ? '🌙 Moon shot'
      : points > total
        ? `${points - total} too many points`
        : left === 0
          ? `All ${total} points placed`
          : `${left} point${left === 1 ? '' : 's'} left to place`,
  );
</script>

<div class="meter" class:ready={moonReady} class:over>
  <div class="allocation">
    <div class="inventory">
      {#each stacks as stack (stack.suit)}
        <div class="pile">
          <div
            class="cards"
            data-suit={stack.suit}
            style="--stack-width: {24 + (stack.total - 1) * 4}px"
            aria-hidden="true"
          >
            {#each Array.from({ length: stack.total }, (_, i) => i) as i (i)}
              <span
                class="playing-card"
                class:allocated={i >= Math.min(stack.total, stack.left)}
                style="--offset: {i * 4}px">{stack.glyph}</span
              >
            {/each}
          </div>
          <span class="remaining">
            {#if stack.suit === 'heart'}
              {heartsLeft} heart{heartsLeft === 1 ? '' : 's'} left
            {:else}
              {queensLeft} Queen{queensLeft === 1 ? '' : 's'} left
            {/if}
          </span>
        </div>
      {/each}
    </div>
    <div class="progress-panel">
      <div class="cap">
        <span class="label">{caption}</span>
        <span class="count">{points}/{total} pts</span>
      </div>
      <div class="progress">
        {#each stacks as stack (stack.suit)}
          <div class="segment">
            <progress
              max={stack.maxPoints}
              value={Math.max(0, Math.min(stack.points, stack.maxPoints))}
              aria-label={stack.label}
              aria-valuetext="{stack.points} of {stack.maxPoints} points placed"
            ></progress>
            <span class="segment-label">{stack.glyph} {stack.points}/{stack.maxPoints} pts</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
  {#if hearts > totalHearts || queens > totalQueens}
    <span class="card-error">
      {#if hearts > totalHearts}
        {hearts - totalHearts} too many hearts.
      {/if}
      {#if queens > totalQueens}
        {queens - totalQueens} too many Queens.
      {/if}
    </span>
  {/if}
</div>

<style>
  .meter {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .meter.ready {
    border-color: var(--primary);
  }
  .meter.over {
    border-color: color-mix(in srgb, var(--bad) 60%, var(--border));
  }
  .cap {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .label {
    font-weight: 700;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  .meter.ready .label {
    color: var(--primary);
  }
  .meter.over .label {
    color: var(--bad);
  }
  .count {
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    white-space: nowrap;
  }
  .allocation {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .inventory {
    display: flex;
    flex-wrap: wrap;
    flex-shrink: 0;
    width: max-content;
    max-width: 55%;
    gap: 12px 24px;
    align-items: center;
  }
  .progress-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    gap: 8px;
  }
  .progress {
    display: flex;
    gap: 4px;
  }
  .segment {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    gap: 6px;
  }
  .segment-label {
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  progress {
    appearance: none;
    width: 100%;
    height: 8px;
    overflow: hidden;
    border: 1px solid var(--muted);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--muted);
  }
  progress::-webkit-progress-bar {
    background: var(--surface);
  }
  progress::-webkit-progress-value {
    background: var(--muted);
  }
  progress::-moz-progress-bar {
    background: var(--muted);
  }
  .meter.ready progress {
    color: var(--primary);
  }
  .meter.ready progress::-webkit-progress-value {
    background: var(--primary);
  }
  .meter.ready progress::-moz-progress-bar {
    background: var(--primary);
  }
  .pile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .cards {
    position: relative;
    width: var(--stack-width);
    height: 32px;
    flex: none;
    pointer-events: none;
  }
  .playing-card {
    position: absolute;
    inset: 0 auto auto 0;
    display: grid;
    place-items: center;
    width: 24px;
    height: 32px;
    border: 1px solid var(--muted);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 700;
    transform: translateX(var(--offset));
    transition:
      transform var(--dur-base, 180ms) var(--ease-standard, ease),
      opacity var(--dur-base, 180ms) var(--ease-standard, ease);
  }
  .playing-card.allocated {
    opacity: 0;
    transform: translate(var(--offset), -6px);
  }
  .remaining {
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .card-error {
    font-size: 0.8rem;
    color: var(--bad);
  }
  @container (max-width: 480px) {
    .inventory {
      flex-direction: column;
      align-items: flex-start;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .playing-card {
      transition: none;
    }
  }
  :global(html[data-motion='reduce']) .playing-card {
    transition: none;
  }
</style>
