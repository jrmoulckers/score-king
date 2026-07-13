<script lang="ts">
  /**
   * Wyrmspan's signature "grow your hoard" gauge — a horizontal bar that fills left→right with a
   * player's running total and burrows deeper through the lair (Nest → Cavern → Treasure Vault →
   * Dragon's Hoard) as it grows. Pure per-game costume: it never touches the app chrome, never
   * uses Royal Violet (the one primary action lives on the play screen) or Crown Gold (reserved
   * for the leader), and always co-signals the lair with an emoji + label, never colour alone.
   *
   * Motion is a flourish, not a gate: the fill glides and a faint ember shimmer drifts across it,
   * but both are dropped under reduced motion — the bar still shows its final fill and lair
   * instantly. Mirrors Wingspan's FlockGauge and Finspan's OceanGauge so the trio feels of a piece.
   */
  import { hoardTier, hoardFill } from './logic';
  import { prefersReducedMotion } from '../../motion';

  let { total = 0 }: { total?: number } = $props();

  const tier = $derived(hoardTier(total));
  const fill = $derived(hoardFill(total));
  const reduced = prefersReducedMotion();
</script>

<div class="gauge" class:reduced>
  <div
    class="lair tier-{tier.key}"
    role="img"
    aria-label={`Lair: ${tier.label}, ${total} VP`}
  >
    <div class="fill" style="--fill: {fill}">
      <span class="ember" aria-hidden="true"></span>
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
  .lair {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 14px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    overflow: hidden;
    /* The lair tint is a contained decorative accent — clearly ember/gem, never the brand
       violet or the leader's gold. Each tier burrows the fill deeper toward the gem-lit hoard. */
    --g1: #fdba74;
    --g2: #fb923c;
  }
  .lair.tier-cavern {
    --g1: #fb923c;
    --g2: #f43f5e;
  }
  .lair.tier-vault {
    --g1: #f43f5e;
    --g2: #d946ef;
  }
  .lair.tier-hoard {
    --g1: #d946ef;
    --g2: #a855f7;
  }
  .fill {
    position: relative;
    height: 100%;
    width: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--g1), var(--g2));
    transform: scaleX(var(--fill, 0));
    transform-origin: left center;
    transition: transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  /* A drifting highlight so the bar reads as a glimmering hoard, not a bare progress bar. */
  .ember {
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
  .reduced .ember {
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
    .ember {
      animation: none;
    }
  }
</style>
