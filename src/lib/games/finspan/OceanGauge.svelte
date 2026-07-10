<script lang="ts">
  /**
   * Finspan's signature "fill your ocean" gauge — a horizontal tank that fills left→right with
   * a researcher's running total and sinks through the three depth zones (Sunlight → Twilight →
   * Midnight) as it grows. Pure per-game costume: it never touches the app chrome, never uses
   * Royal Violet (the one primary action lives in the play screen) or Crown Gold (reserved for
   * the leader), and always co-signals depth with an emoji + zone word, never colour alone.
   *
   * Motion is a flourish, not a gate: the fill glides and a faint waterline drifts, but both are
   * dropped under reduced motion — the tank still shows its final fill and zone instantly.
   */
  import { depthZone, tankFill } from './logic';
  import { prefersReducedMotion } from '../../motion';

  let { total = 0 }: { total?: number } = $props();

  const zone = $derived(depthZone(total));
  const fill = $derived(tankFill(total));
  const reduced = prefersReducedMotion();
</script>

<div class="gauge" class:reduced>
  <div class="tank zone-{zone.key}" role="img" aria-label={`Ocean depth: ${zone.label} zone, ${total} points`}>
    <div class="water" style="--fill: {fill}">
      <span class="waterline" aria-hidden="true"></span>
    </div>
  </div>
  <span class="zone" aria-hidden="true">
    <span class="zemoji">{zone.emoji}</span>{zone.label}
  </span>
</div>

<style>
  .gauge {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .tank {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 14px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    overflow: hidden;
    /* The ocean tint is a contained decorative accent — clearly teal/blue, never the brand
       violet or the leader's gold. Each zone deepens the water. */
    --w1: #7dd3fc;
    --w2: #38bdf8;
  }
  .tank.zone-twilight {
    --w1: #22d3ee;
    --w2: #3b82f6;
  }
  .tank.zone-midnight {
    --w1: #3b82f6;
    --w2: #1e40af;
  }
  .water {
    position: relative;
    height: 100%;
    width: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--w1), var(--w2));
    transform: scaleX(var(--fill, 0));
    transform-origin: left center;
    transition: transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  /* A drifting highlight so the water reads as water, not a progress bar. */
  .waterline {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, #ffffff 34%, transparent) 45%,
      transparent 70%
    );
    background-size: 220% 100%;
    animation: drift 2.6s linear infinite;
  }
  .zone {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
  }
  .zemoji {
    font-size: 0.85rem;
  }
  .reduced .water {
    transition: none;
  }
  .reduced .waterline {
    animation: none;
    background-position: 0 0;
  }
  @keyframes drift {
    from {
      background-position: 120% 0;
    }
    to {
      background-position: -120% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .water {
      transition: none;
    }
    .waterline {
      animation: none;
    }
  }
</style>
