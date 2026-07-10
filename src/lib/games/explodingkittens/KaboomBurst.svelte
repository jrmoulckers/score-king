<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * A short 💥 blast when a kitten explodes — the chaotic payoff Exploding Kittens
   * begs for. Pure delight layered over an outcome already spelled out in words +
   * chip ("💥 1st out", struck-through name), so motion is never the only signal.
   * The overlay is `pointer-events: none`, replays whenever `token` changes (a fresh
   * boom), and renders nothing at all under reduced motion. Modeled on the app's
   * existing burst components (FeatherBurst / CoinBurst).
   *
   * A bigger `crown` blast is used for the last-kitten-standing moment: same engine,
   * more pieces and a gold-and-sparkle glyph set for the win.
   */
  let { token = 0, crown = false }: { token?: number; crown?: boolean } = $props();

  const reduced = prefersReducedMotion();

  const pieces = $derived.by(() => {
    const count = crown ? 14 : 10;
    const glyphs = crown ? ['🎉', '✨', '🐱', '👑', '💫', '🎊'] : ['💥', '💥', '🙀', '💨', '✨'];
    return Array.from({ length: count }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      // Radial scatter from the center of the row so a boom actually bursts outward.
      const angle = (i / count) * Math.PI * 2 + (rand(0) - 0.5) * 0.7;
      const dist = (crown ? 46 : 34) + rand(1) * (crown ? 40 : 30);
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - (crown ? 16 : 8), // bias upward a touch
        delay: rand(2) * 0.08,
        duration: (crown ? 0.85 : 0.6) + rand(3) * 0.4,
        spin: (rand(4) - 0.5) * 320,
        size: (crown ? 1.0 : 0.85) + rand(5) * 0.6,
        glyph: glyphs[Math.floor(rand(6) * glyphs.length)],
      };
    });
  });
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="kaboom" class:crown aria-hidden="true">
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
  .kaboom {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    overflow: visible;
    z-index: 3;
  }
  .bit {
    position: absolute;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    animation-name: kaboom-fly;
    animation-timing-function: cubic-bezier(0.16, 0.84, 0.44, 1);
    animation-iteration-count: 1;
    animation-fill-mode: both;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
  }
  @keyframes kaboom-fly {
    0% {
      opacity: 0;
      transform: translate(0, 0) rotate(0deg) scale(0.3);
    }
    18% {
      opacity: 1;
      transform: translate(calc(var(--dx) * 0.5), calc(var(--dy) * 0.5)) rotate(calc(var(--spin) * 0.5)) scale(1.15);
    }
    100% {
      opacity: 0;
      transform: translate(var(--dx), var(--dy)) rotate(var(--spin)) scale(0.9);
    }
  }
</style>
