<script lang="ts">
  /**
   * Wingspan's signature "grow your flock" gauge — a horizontal bar that fills left→right with a
   * player's running total and climbs through the four habitats (Forest → Grassland → Wetland →
   * Oceania) as it grows. Pure per-game costume: it never touches the app chrome, never uses
   * Royal Violet (the one primary action lives on the play screen) or Crown Gold (reserved for
   * the leader), and always co-signals the habitat with an emoji + label, never colour alone.
   *
   * Motion is a flourish, not a gate: the fill glides and a faint breeze drifts across it, but
   * both are dropped under reduced motion — the bar still shows its final fill and habitat
   * instantly. Mirrors Finspan's OceanGauge so the two siblings feel of a piece.
   */
  import { habitatTier, flockFill } from './logic';
  import { prefersReducedMotion } from '../../motion';

  let { total = 0 }: { total?: number } = $props();

  const tier = $derived(habitatTier(total));
  const fill = $derived(flockFill(total));
  const reduced = prefersReducedMotion();
</script>

<div class="gauge" class:reduced>
  <div
    class="meter tier-{tier.key}"
    role="img"
    aria-label={`Flock habitat: ${tier.label}, ${total} points`}
  >
    <div class="fill" style="--fill: {fill}">
      <span class="breeze" aria-hidden="true"></span>
    </div>
  </div>
  <span class="tier" aria-hidden="true">
    <span class="temoji">{tier.emoji}</span>{tier.label}
  </span>
</div>

<style>
  .gauge {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .meter {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 14px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    overflow: hidden;
    /* The habitat tint is a contained decorative accent — clearly green/earth/teal, never the
       brand violet or the leader's gold. Each tier shifts the fill toward its habitat. */
    --h1: #4ade80;
    --h2: #22c55e;
  }
  .meter.tier-grassland {
    --h1: #a3e635;
    --h2: #ca8a04;
  }
  .meter.tier-wetland {
    --h1: #34d399;
    --h2: #0891b2;
  }
  .meter.tier-oceania {
    --h1: #22d3ee;
    --h2: #2563eb;
  }
  .fill {
    position: relative;
    height: 100%;
    width: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--h1), var(--h2));
    transform: scaleX(var(--fill, 0));
    transform-origin: left center;
    transition: transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  /* A drifting highlight so the bar reads as a living habitat, not a bare progress bar. */
  .breeze {
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
  .tier {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
  }
  .temoji {
    font-size: 0.85rem;
  }
  .reduced .fill {
    transition: none;
  }
  .reduced .breeze {
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
    .fill {
      transition: none;
    }
    .breeze {
      animation: none;
    }
  }
</style>
