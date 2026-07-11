<script lang="ts">
  import { haptic } from '../../haptics';
  import { animateMotion } from '../../motion';
  import { tileInk, TILE_FACE } from './tiles';

  /**
   * Fast, thematic leftover entry: tap the numbered tiles a player was caught holding and each
   * tap adds that tile's face value to their rack total — far quicker than nudging a step-by-one
   * stepper up to 40+. A 🃏 key adds a stranded joker (the big penalty), and Clear wipes the
   * rack. The colourful ivory tiles are Rummikub's costume; every key shows its number, so
   * colour never carries meaning alone. Keys are ≥46px for one-handed, dim-light use and fire a
   * light haptic tick per tap. The precise steppers remain alongside for fine corrections.
   */
  let {
    tiles = $bindable(0),
    jokers = $bindable(0),
    jokerValue = 30,
    maxJokers = 2,
    onjoker,
    label = '',
  }: {
    tiles?: number;
    jokers?: number;
    jokerValue?: number;
    maxJokers?: number;
    onjoker?: () => void;
    label?: string;
  } = $props();

  const values = Array.from({ length: 13 }, (_, i) => i + 1);
  let readoutEl: HTMLSpanElement | undefined = $state();

  function bump() {
    if (readoutEl) animateMotion(readoutEl, { scale: [1, 1.14, 1] }, { duration: 0.16, ease: 'easeOut' });
  }

  function addTile(n: number) {
    tiles = Math.max(0, (Number(tiles) || 0) + n);
    haptic('tick');
    bump();
  }

  function addJoker() {
    if ((Number(jokers) || 0) >= maxJokers) return;
    jokers = (Number(jokers) || 0) + 1;
    haptic('tick');
    bump();
    onjoker?.();
  }

  function clear() {
    if (!(Number(tiles) > 0) && !(Number(jokers) > 0)) return;
    tiles = 0;
    jokers = 0;
    haptic('tick');
    bump();
  }
</script>

<div class="keypad">
  <div class="pad" role="group" aria-label={label ? `Add leftover tiles for ${label}` : 'Add leftover tiles'}>
    {#each values as n (n)}
      <button
        type="button"
        class="key tile"
        style="--ink: {tileInk(n)}; --face: {TILE_FACE}"
        onclick={() => addTile(n)}
        aria-label={`Add a ${n} tile`}
      >{n}</button>
    {/each}
    <button
      type="button"
      class="key joker"
      onclick={addJoker}
      disabled={(Number(jokers) || 0) >= maxJokers}
      aria-label={`Add a stranded joker, worth ${jokerValue}`}
    >🃏</button>
  </div>

  <div class="foot">
    <span class="readout" aria-hidden="true">
      🧮 <strong bind:this={readoutEl} class="sum">{tiles}</strong>{#if jokers > 0}<span class="jk"> + 🃏×{jokers}</span>{/if}
    </span>
    <button
      type="button"
      class="clear"
      onclick={clear}
      disabled={!(Number(tiles) > 0) && !(Number(jokers) > 0)}
    >Clear rack</button>
  </div>
</div>

<style>
  .keypad {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pad {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;
  }
  .key {
    min-height: 46px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-weight: 800;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: transform var(--dur-press) var(--ease-standard), filter var(--dur-base) var(--ease-standard);
  }
  /* Ivory tile face with a coloured numeral — the physical Rummikub tile as a key. */
  .key.tile {
    background: var(--face);
    color: var(--ink);
    border-color: color-mix(in srgb, var(--ink) 30%, transparent);
  }
  .key.joker {
    background: var(--surface-3);
    color: var(--text);
    font-size: 1.15rem;
  }
  .key:active {
    transform: scale(0.92);
  }
  .key:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .key:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .readout {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .sum {
    display: inline-block;
    color: var(--text);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .jk {
    color: var(--muted);
  }
  .clear {
    min-height: 46px;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--muted);
    font-weight: 600;
    cursor: pointer;
    transition: transform var(--dur-press) var(--ease-standard), background var(--dur-base) var(--ease-standard);
  }
  .clear:active {
    transform: scale(0.94);
  }
  .clear:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  @media (prefers-reduced-motion: reduce) {
    .key,
    .clear {
      transition: none;
    }
  }
</style>
