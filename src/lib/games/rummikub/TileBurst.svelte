<script lang="ts">
  import { prefersReducedMotion } from '../../motion';
  import { tileInk, TILE_FACE } from './tiles';

  /**
   * The triumphant "Rummikub!" moment — a short flurry of colourful numbered tiles flung up
   * off a player's row the instant they're marked out (their rack emptied onto the table).
   * Pure delight layered over an outcome already spelled out in words + number ("🏆 Rummikub!"
   * and the +pot), so motion is never the only signal. The overlay is `pointer-events: none`,
   * replays whenever `token` changes (a fresh go-out), and renders nothing under reduced motion
   * (mirrors CoinBurst / FeatherBurst).
   */
  let { token = 0 }: { token?: number } = $props();

  const reduced = prefersReducedMotion();
  const COUNT = 10;

  // Deterministic pseudo-random, seeded by token so each burst looks a little different but is
  // stable across a single render (mirrors CoinBurst/MoonRise/FeatherBurst).
  const bits = $derived(
    Array.from({ length: COUNT }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      const isSparkle = rand(9) > 0.72;
      const num = 1 + Math.floor(rand(0) * 13);
      return {
        sparkle: isSparkle,
        num,
        left: 50 + (rand(1) - 0.5) * 96,
        delay: rand(2) * 0.12,
        duration: 0.72 + rand(3) * 0.5,
        rise: 26 + rand(4) * 40,
        drift: (rand(5) - 0.5) * 44,
        spin: (rand(6) - 0.5) * 300,
        size: 0.85 + rand(7) * 0.5,
      };
    }),
  );
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="burst" aria-hidden="true">
      {#each bits as b, i (i)}
        {#if b.sparkle}
          <span
            class="fly spark"
            style="
              left: {b.left}%;
              font-size: {b.size}rem;
              animation-delay: {b.delay}s;
              animation-duration: {b.duration}s;
              --rise: {b.rise}px;
              --drift: {b.drift}px;
              --spin: {b.spin}deg;
            ">✨</span>
        {:else}
          <span
            class="fly tile"
            style="
              left: {b.left}%;
              transform-origin: center;
              font-size: {b.size}rem;
              animation-delay: {b.delay}s;
              animation-duration: {b.duration}s;
              --ink: {tileInk(b.num)};
              --face: {TILE_FACE};
              --rise: {b.rise}px;
              --drift: {b.drift}px;
              --spin: {b.spin}deg;
            ">{b.num}</span>
        {/if}
      {/each}
    </div>
  {/key}
{/if}

<style>
  .burst {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 0;
    pointer-events: none;
    overflow: visible;
    z-index: 3;
  }
  .fly {
    position: absolute;
    top: 0;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    animation-name: tile-fly;
    animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
    animation-iteration-count: 1;
    animation-fill-mode: both;
  }
  /* A mini ivory tile with a coloured numeral — the same physical tile as the rack. */
  .fly.tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5em;
    height: 2em;
    border-radius: var(--radius-sm);
    background: var(--face);
    color: var(--ink);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    border: 1px solid color-mix(in srgb, var(--ink) 30%, transparent);
  }
  @keyframes tile-fly {
    0% {
      opacity: 0;
      transform: translate(0, 8px) rotate(0deg) scale(0.5);
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
