<script lang="ts">
  /**
   * Rummikub's costume header: a rack ledge with the round's progress seated on it as tiles —
   * played rounds face-up (ivory, coloured numeral), the current round raised on the rack, and
   * upcoming rounds still face-down. In target mode (no fixed round count) it shows the target
   * readout with the current round's tile. Pure per-game flavour: it lives entirely inside the
   * editor, never touches the shared chrome, and uses neither Royal Violet nor Crown Gold. The
   * "Round N" text and the raised current tile carry the meaning, so there is nothing essential
   * to animate — it renders identically under reduced motion.
   */
  import { tileInk, TILE_FACE } from './tiles';

  let {
    round,
    total = null,
    target = null,
  }: { round: number; total?: number | null; target?: number | null } = $props();

  // Show a real tile per round only when the count is small enough to read as a rack;
  // otherwise fall back to a single current tile + text so it never overflows.
  const asTiles = $derived(total != null && total > 0 && total <= 14);
  const tiles = $derived(
    asTiles ? Array.from({ length: total as number }, (_, i) => i + 1) : [],
  );
  const label = $derived(
    total != null ? `Round ${round} of ${total}` : `Round ${round}`,
  );
</script>

<div class="rack" role="img" aria-label={`${label}${target != null ? `, playing to ${target}` : ''}`}>
  <div class="shelf">
    {#if asTiles}
      <div class="tiles" aria-hidden="true">
        {#each tiles as n (n)}
          <span
            class="tile"
            class:played={n < round}
            class:current={n === round}
            class:upcoming={n > round}
            style={n <= round ? `--ink: ${tileInk(n)}; --face: ${TILE_FACE}` : ''}
          >{n <= round ? n : ''}</span>
        {/each}
      </div>
    {:else}
      <span class="tile current solo" aria-hidden="true" style={`--ink: ${tileInk(round)}; --face: ${TILE_FACE}`}>{round}</span>
    {/if}
  </div>
  <div class="ledge" aria-hidden="true"></div>
  <div class="cap">
    <span class="where">🔢 {label}</span>
    {#if target != null}<span class="goal">🎯 to {target}</span>{/if}
  </div>
</div>

<style>
  .rack {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 12px 10px;
  }
  .shelf {
    min-height: 40px;
    display: flex;
    align-items: flex-end;
  }
  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: flex-end;
  }
  /* A physical ivory tile with a coloured numeral — the classic Rummikub look. The number is
     always present on a face-up tile, so colour never carries meaning alone. */
  .tile {
    width: 22px;
    height: 30px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .tile.played,
  .tile.current {
    background: var(--face);
    color: var(--ink);
    border-color: color-mix(in srgb, var(--ink) 30%, transparent);
  }
  .tile.current {
    transform: translateY(-6px);
    box-shadow: var(--shadow);
    outline: 2px solid color-mix(in srgb, var(--ink) 55%, transparent);
    outline-offset: 1px;
  }
  .tile.solo {
    width: 26px;
    height: 34px;
    font-size: 0.95rem;
    transform: none;
  }
  /* Face-down (upcoming) tiles: the back of a tile, quiet on the rack. */
  .tile.upcoming {
    background: var(--surface-3);
    color: transparent;
  }
  /* The rack ledge the tiles sit on — a quiet shelf edge built from the surface ramp. */
  .ledge {
    height: 6px;
    margin-top: 2px;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    border: 1px solid var(--border);
  }
  .cap {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-top: 8px;
  }
  .where {
    font-weight: 700;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  .goal {
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
