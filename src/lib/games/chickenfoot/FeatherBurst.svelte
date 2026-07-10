<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * A short flurry of feathers when a player empties their hand and goes out — the
   * triumphant moment of a Chicken Foot round. Pure delight layered over an outcome
   * that's already spelled out in words + number ("Went out — empty hand, 0"), so
   * motion is never the only signal. The overlay is `pointer-events: none`, replays
   * whenever `token` changes (a fresh go-out), and renders nothing at all under
   * reduced motion.
   */
  let { token = 0 }: { token?: number } = $props();

  const reduced = prefersReducedMotion();
  const COUNT = 9;

  // Deterministic pseudo-random, seeded by token so each burst looks a little
  // different but is stable across a single render (mirrors CoinBurst/MoonRise).
  const feathers = $derived(
    Array.from({ length: COUNT }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      const glyphs = ['🪶', '🪶', '🐔', '🪶', '✨'];
      return {
        left: 50 + (rand(1) - 0.5) * 88,
        delay: rand(2) * 0.12,
        duration: 0.7 + rand(3) * 0.5,
        rise: 24 + rand(4) * 34,
        drift: (rand(5) - 0.5) * 40,
        spin: (rand(6) - 0.5) * 260,
        size: 0.8 + rand(7) * 0.5,
        glyph: glyphs[Math.floor(rand(8) * glyphs.length)],
      };
    }),
  );
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="feathers" aria-hidden="true">
      {#each feathers as f, i (i)}
        <span
          class="feather"
          style="
            left: {f.left}%;
            font-size: {f.size}rem;
            animation-delay: {f.delay}s;
            animation-duration: {f.duration}s;
            --rise: {f.rise}px;
            --drift: {f.drift}px;
            --spin: {f.spin}deg;
          ">{f.glyph}</span>
      {/each}
    </div>
  {/key}
{/if}

<style>
  .feathers {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 0;
    pointer-events: none;
    overflow: visible;
    z-index: 2;
  }
  .feather {
    position: absolute;
    top: 0;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    animation-name: feather-fly;
    animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
    animation-iteration-count: 1;
    animation-fill-mode: both;
  }
  @keyframes feather-fly {
    0% {
      opacity: 0;
      transform: translate(0, 6px) rotate(0deg) scale(0.5);
    }
    20% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(var(--drift), calc(var(--rise) * -1)) rotate(var(--spin)) scale(1);
    }
  }
</style>
