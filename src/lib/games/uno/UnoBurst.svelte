<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * The shout-"Uno!" payoff. A quick scatter of cards + confetti when a player empties
   * their hand to end a round, layered over an outcome already spelled out in words + chip
   * ("🎉 Went out", the gold row wash), so motion is never the only signal. The overlay is
   * `pointer-events: none`, replays whenever `token` changes, and renders nothing at all
   * under reduced motion. Modeled on the app's existing burst components (KaboomBurst /
   * CoinBurst).
   *
   * `scoop` makes it a bigger, coin-flecked blast for standard mode — the going-out player
   * literally scoops the pot — while golf uses the plain (no-scoop) confetti pop.
   */
  let { token = 0, scoop = false }: { token?: number; scoop?: boolean } = $props();

  const reduced = prefersReducedMotion();

  const pieces = $derived.by(() => {
    const count = scoop ? 16 : 11;
    // Uno's four colors carry the theme; glyphs (not hue) are what actually read.
    const glyphs = scoop
      ? ['🃏', '💰', '✨', '🔴', '🟡', '🟢', '🔵', '🎉']
      : ['🎉', '🃏', '✨', '🔴', '🟡', '🟢', '🔵'];
    return Array.from({ length: count }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      const angle = (i / count) * Math.PI * 2 + (rand(0) - 0.5) * 0.7;
      const dist = (scoop ? 48 : 34) + rand(1) * (scoop ? 42 : 28);
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - (scoop ? 18 : 10), // bias upward a touch
        delay: rand(2) * 0.08,
        duration: (scoop ? 0.85 : 0.6) + rand(3) * 0.4,
        spin: (rand(4) - 0.5) * 320,
        size: (scoop ? 1.0 : 0.85) + rand(5) * 0.55,
        glyph: glyphs[Math.floor(rand(6) * glyphs.length)],
      };
    });
  });
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="unoburst" class:scoop aria-hidden="true">
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
  .unoburst {
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
    animation-name: uno-fly;
    animation-timing-function: cubic-bezier(0.16, 0.84, 0.44, 1);
    animation-iteration-count: 1;
    animation-fill-mode: both;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
  }
  @keyframes uno-fly {
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
