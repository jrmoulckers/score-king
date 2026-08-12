<script lang="ts">
  import { HEARTS_TOTAL, QUEEN_POINTS } from './logic';

  /**
   * Hearts' per-game "costume": a slim ribbon at the top of the round editor that
   * reads the hand's 26 penalty points as a waxing moon — the 13 hearts (1 pt each)
   * plus the Queen of Spades (13 pts). As points get handed out the moon fills
   * (🌑 → 🌕); the count and the "left to place" copy carry the real meaning, so
   * the glyph is reinforcement, never the only signal. When one player is holding
   * every heart *and* the Queen, the ribbon flips to its charged "Set for a moon
   * shot" state. Pure flavor — it lives entirely inside the editor and never
   * touches the shared chrome. No animation, so nothing to gate for reduced motion.
   */
  const { points = 0, moonReady = false }: { points?: number; moonReady?: boolean } = $props();

  // 26 penalty points ride on every hand: 13 hearts + the 13-point Queen.
  const TOTAL = HEARTS_TOTAL + QUEEN_POINTS;
  const left = $derived(Math.max(0, TOTAL - points));
  const over = $derived(points > TOTAL);

  // Map penalty points (0..26) onto the eight lunar glyphs, waxing to full.
  const PHASES = ['🌑', '🌒', '🌒', '🌓', '🌓', '🌔', '🌔', '🌕'];
  const phase = $derived(
    moonReady || points >= TOTAL
      ? '🌕'
      : PHASES[Math.min(PHASES.length - 1, Math.round((points / TOTAL) * (PHASES.length - 1)))],
  );

  const pct = $derived(Math.min(100, (points / TOTAL) * 100));

  const caption = $derived(
    moonReady
      ? 'Set for a moon shot'
      : over
        ? `${points - TOTAL} too many points`
        : left === 0
          ? 'All 26 points placed'
          : `${left} point${left === 1 ? '' : 's'} left to place`,
  );
</script>

<div class="meter" class:ready={moonReady} class:over>
  <span class="moon" aria-hidden="true">{phase}</span>
  <div class="body">
    <div class="cap">
      <span class="label">{caption}</span>
      <span class="count">{points}/{TOTAL} pts</span>
    </div>
    <div class="track" aria-hidden="true">
      <div class="fill" style="transform: scaleX({pct / 100})"></div>
    </div>
  </div>
</div>

<style>
  .meter {
    display: flex;
    align-items: center;
    gap: 12px;
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
  .moon {
    font-size: 1.5rem;
    line-height: 1;
    flex: none;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
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
    white-space: nowrap;
  }
  .track {
    height: 6px;
    border-radius: 999px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    width: 100%;
    transform-origin: left center;
    border-radius: 999px;
    background: var(--primary);
    transition: transform var(--dur-base, 180ms) var(--ease-standard, ease);
  }
  .meter.over .fill {
    background: var(--bad);
  }
  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
