<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * The "sank it" payoff — Uno Golf's marquee beat. When a player empties their hand
   * and drops the ball in the cup, a golf ball rolls home over a quick scatter of Uno
   * confetti. It's layered over an outcome already spelled out in words + chip ("⛳
   * Sank it", the green row wash, the 0), so motion is never the only signal. The
   * overlay is `pointer-events: none`, replays whenever `token` changes, and renders
   * nothing at all under reduced motion — matching the app's UnoBurst / BirdieBurst.
   */
  let { token = 0 }: { token?: number } = $props();

  const reduced = prefersReducedMotion();

  const pieces = $derived.by(() => {
    const count = 12;
    // Uno's four colours + a golf flag carry the theme; the glyph (not hue) reads.
    const glyphs = ['🎉', '⛳', '✨', '🔴', '🟡', '🟢', '🔵', '🏌️'];
    return Array.from({ length: count }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      const angle = (i / count) * Math.PI * 2 + (rand(0) - 0.5) * 0.7;
      const dist = 40 + rand(1) * 34;
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 14, // bias upward a touch
        delay: 0.12 + rand(2) * 0.1, // let the ball drop first
        duration: 0.7 + rand(3) * 0.4,
        spin: (rand(4) - 0.5) * 320,
        size: 0.85 + rand(5) * 0.5,
        glyph: glyphs[Math.floor(rand(6) * glyphs.length)],
      };
    });
  });
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="sinkburst" aria-hidden="true">
      <!-- The ball rolls in and drops into the cup, then the confetti pops. -->
      <span class="ball">⛳</span>
      {#each pieces as p, i (i)}
        <span
          class="bit"
          style="
            font-size: {p.size}rem;
            animation-delay: {p.delay}s;
            animation-duration: {p.duration}s;
            --dx: {p.dx}px;
            --dy: {p.dy}px;
            --spin: {p.spin}deg;
          ">{p.glyph}</span>
      {/each}
    </div>
  {/key}
{/if}

<style>
  .sinkburst {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    overflow: visible;
    z-index: 3;
  }
  .ball {
    position: absolute;
    line-height: 1;
    font-size: 1.5rem;
    opacity: 0;
    will-change: transform, opacity;
    animation: ball-sink 0.5s cubic-bezier(0.4, 0, 0.6, 1) both;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4));
  }
  @keyframes ball-sink {
    0% {
      opacity: 0;
      transform: translate(-64px, -8px) rotate(-90deg) scale(0.9);
    }
    35% {
      opacity: 1;
      transform: translate(-10px, -2px) rotate(-20deg) scale(1);
    }
    70% {
      opacity: 1;
      transform: translate(0, 0) rotate(0deg) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(0, 8px) rotate(0deg) scale(0.5);
    }
  }
  .bit {
    position: absolute;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    animation-name: sink-fly;
    animation-timing-function: cubic-bezier(0.16, 0.84, 0.44, 1);
    animation-iteration-count: 1;
    animation-fill-mode: both;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
  }
  @keyframes sink-fly {
    0% {
      opacity: 0;
      transform: translate(0, 0) rotate(0deg) scale(0.3);
    }
    20% {
      opacity: 1;
      transform: translate(calc(var(--dx) * 0.5), calc(var(--dy) * 0.5)) rotate(calc(var(--spin) * 0.5)) scale(1.15);
    }
    100% {
      opacity: 0;
      transform: translate(var(--dx), var(--dy)) rotate(var(--spin)) scale(0.9);
    }
  }
</style>
