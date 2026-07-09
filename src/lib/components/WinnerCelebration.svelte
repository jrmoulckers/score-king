<script lang="ts">
  import { prefersReducedMotion } from '../motion';

  /**
   * A one-shot confetti burst for the winner moment. Pure delight layered over a
   * banner that already announces the win in words + 🏆 (so motion is never the
   * only signal). It renders nothing at all under reduced motion, plays exactly
   * once, and is `pointer-events: none` so it never blocks the Play again / Share
   * actions underneath. Gold leads the mix — a win is the one place Crown Gold
   * gets to celebrate.
   */
  let {
    /** How many pieces to scatter. Kept modest so it reads as a flourish, not a screen-filler. */
    count = 16,
  }: { count?: number } = $props();

  const reduced = prefersReducedMotion();

  // A small, deterministic scatter so every win feels lively but never chaotic.
  const pieces = $derived(
    Array.from({ length: count }, (_, i) => {
      const rand = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
      const palette = ['var(--accent)', 'var(--accent)', 'var(--primary)', 'var(--good)', 'var(--bad)'];
      return {
        left: 6 + rand(1) * 88, // vw-ish %, kept off the edges
        delay: rand(2) * 0.25,
        duration: 1.1 + rand(3) * 0.8,
        drift: (rand(4) - 0.5) * 90, // px horizontal drift
        spin: 180 + rand(5) * 540,
        size: 7 + rand(6) * 7,
        color: palette[Math.floor(rand(7) * palette.length)],
        round: rand(8) > 0.6,
      };
    }),
  );
</script>

{#if !reduced}
  <div class="confetti" aria-hidden="true">
    {#each pieces as p, i (i)}
      <span
        class="piece"
        class:round={p.round}
        style="
          left: {p.left}%;
          width: {p.size}px;
          height: {p.size * 0.6}px;
          background: {p.color};
          animation-delay: {p.delay}s;
          animation-duration: {p.duration}s;
          --drift: {p.drift}px;
          --spin: {p.spin}deg;
        "
      ></span>
    {/each}
  </div>
{/if}

<style>
  .confetti {
    position: absolute;
    inset: -8px 0 auto 0;
    height: 0;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
  }
  .piece {
    position: absolute;
    top: 0;
    border-radius: 2px;
    opacity: 0;
    will-change: transform, opacity;
    animation-name: confetti-fall;
    animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
    animation-iteration-count: 1;
    animation-fill-mode: both;
  }
  .piece.round {
    border-radius: 50%;
  }
  @keyframes confetti-fall {
    0% {
      opacity: 0;
      transform: translate(0, -6px) rotate(0deg) scale(0.6);
    }
    12% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(var(--drift), 120px) rotate(var(--spin)) scale(1);
    }
  }
</style>
