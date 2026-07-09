<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * A short treasure pop layered over a player's bounty control. Pure delight on
   * top of a bounty total that's already shown in words + number, so motion is
   * never the only signal. Renders nothing under reduced motion, is
   * `pointer-events: none`, and replays whenever `token` changes (a new capture)
   * — a small cascade for a big haul, a couple of coins for a modest one.
   */
  let {
    /** Bump this to replay the burst (e.g. the running bounty total). */
    token = 0,
    /** Bigger, more coins for a significant capture. */
    big = false,
  }: { token?: number; big?: boolean } = $props();

  const reduced = prefersReducedMotion();
  const count = $derived(big ? 10 : 5);

  const coins = $derived(
    Array.from({ length: count }, (_, i) => {
      const rand = (n: number) => ((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
      const glyphs = ['🪙', '🪙', '💰', '✨'];
      return {
        left: 50 + (rand(1) - 0.5) * (big ? 120 : 70),
        delay: rand(2) * 0.12,
        duration: 0.7 + rand(3) * 0.5,
        rise: 26 + rand(4) * (big ? 40 : 22),
        drift: (rand(5) - 0.5) * 30,
        spin: (rand(6) - 0.5) * 220,
        size: 0.85 + rand(7) * (big ? 0.7 : 0.4),
        glyph: glyphs[Math.floor(rand(8) * glyphs.length)],
      };
    }),
  );
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="coins" aria-hidden="true">
      {#each coins as c, i (i)}
        <span
          class="coin"
          style="
            left: {c.left}%;
            font-size: {c.size}rem;
            animation-delay: {c.delay}s;
            animation-duration: {c.duration}s;
            --rise: {c.rise}px;
            --drift: {c.drift}px;
            --spin: {c.spin}deg;
          ">{c.glyph}</span>
      {/each}
    </div>
  {/key}
{/if}

<style>
  .coins {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 0;
    pointer-events: none;
    overflow: visible;
    z-index: 2;
  }
  .coin {
    position: absolute;
    bottom: 0;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    animation-name: coin-pop;
    animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
    animation-iteration-count: 1;
    animation-fill-mode: both;
  }
  @keyframes coin-pop {
    0% {
      opacity: 0;
      transform: translate(0, 4px) rotate(0deg) scale(0.5);
    }
    18% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(var(--drift), calc(var(--rise) * -1)) rotate(var(--spin)) scale(1);
    }
  }
</style>
