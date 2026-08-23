<script lang="ts">
  import type { PassInfo } from './logic';

  /**
   * Hearts' pre-deal ritual, worn as a slim costume strip above the round editor:
   * a reminder of where the configured cards pass this hand. Pure flavor + table
   * aid — it never touches scoring. The glyph
   * co-signals the arrow, but the label and hint carry the real meaning, so it reads
   * fine for color-blind players and screen readers alike. Static (no animation),
   * so there's nothing to gate for reduced motion.
   */
  const { info, hand }: { info: PassInfo; hand: number } = $props();
</script>

<div class="pass" class:hold={info.direction === 'hold'}>
  <span class="badge" aria-hidden="true">{info.glyph}</span>
  <div class="body">
    <div class="cap">
      <span class="label">{info.label}</span>
      <span class="hand">Hand {hand}</span>
    </div>
    <span class="hint">{info.hint}</span>
  </div>
</div>

<style>
  .pass {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .badge {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: var(--surface-3);
    font-size: 1.15rem;
    line-height: 1;
  }
  /* A hold hand keeps its cards — quiet it down so the arrows read as the active state. */
  .pass.hold .badge {
    background: var(--surface);
    color: var(--muted);
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .cap {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .label {
    font-weight: 700;
    font-size: 0.9rem;
  }
  .hand {
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .hint {
    font-size: 0.76rem;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
