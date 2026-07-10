<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * The red-numbers moment: when a player's hole dips under par, a brief flourish
   * of feathers lifts off the row. Pure delight layered over a swing that's already
   * spelled out by the 🐦/🦅 verdict chip and the negative number, so motion is
   * never the only signal. The overlay is `pointer-events: none`, replays whenever
   * `token` changes (a fresh birdie), and renders nothing at all under reduced
   * motion — the verdict chip is the calm, instant alternative shown either way.
   * `eagle` deepens the burst a touch for the rarer, deeper-red hole.
   */
  let { token = 0, eagle = false }: { token?: number; eagle?: boolean } = $props();

  const reduced = prefersReducedMotion();
  const COUNT = $derived(eagle ? 12 : 8);

  // Deterministic pseudo-random, seeded by token so each birdie looks a little
  // different but is stable across a single render (mirrors MoonRise / CoinBurst).
  const feathers = $derived(
    Array.from({ length: COUNT }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      const glyphs = eagle ? ['🪶', '🦅', '✦', '🪶'] : ['🪶', '🐦', '✦', '🪶'];
      return {
        left: 8 + rand(1) * 84,
        delay: rand(2) * 0.18,
        duration: 0.85 + rand(3) * 0.6,
        drift: (rand(4) - 0.5) * 70,
        rise: 26 + rand(5) * 46,
        size: 0.6 + rand(6) * 0.6,
        glyph: glyphs[Math.floor(rand(7) * glyphs.length)],
      };
    }),
  );
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="burst" aria-hidden="true">
      {#each feathers as f, i (i)}
        <span
          class="feather"
          style="
            left: {f.left}%;
            font-size: {f.size}rem;
            animation-delay: {f.delay}s;
            animation-duration: {f.duration}s;
            --drift: {f.drift}px;
            --rise: {f.rise}px;
          ">{f.glyph}</span>
      {/each}
    </div>
  {/key}
{/if}

<style>
  .burst {
    position: absolute;
    inset: 0;
    overflow: visible;
    pointer-events: none;
    z-index: 2;
  }
  .feather {
    position: absolute;
    bottom: 30%;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    animation-name: feather-rise;
    animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
    animation-fill-mode: both;
  }
  @keyframes feather-rise {
    0% {
      opacity: 0;
      transform: translate(0, 8px) rotate(-8deg) scale(0.6);
    }
    25% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(var(--drift), calc(var(--rise) * -1)) rotate(10deg) scale(1);
    }
  }
</style>
