<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * The big moment: when a player shoots the moon, a brief moonrise washes the
   * whole editor and a starfield sweeps up behind the rows. Pure delight layered
   * over a swing that's already spelled out in words + numbers (the banner and the
   * flipped preview), so motion is never the only signal. The overlay is
   * `pointer-events: none`, replays whenever `token` changes (a fresh moon), and
   * renders nothing at all under reduced motion — the banner and preview swing are
   * the calm, instant alternative shown by the editor either way.
   */
  let { token = 0 }: { token?: number } = $props();

  const reduced = prefersReducedMotion();
  const STAR_COUNT = 16;

  // Deterministic pseudo-random, seeded by token so each moon looks a little
  // different but is stable across a single render (mirrors CoinBurst).
  const stars = $derived(
    Array.from({ length: STAR_COUNT }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      const glyphs = ['✦', '✧', '⋆', '·', '✦'];
      return {
        left: rand(1) * 100,
        bottom: rand(2) * 70,
        delay: rand(3) * 0.4,
        duration: 0.9 + rand(4) * 0.7,
        rise: 30 + rand(5) * 60,
        size: 0.55 + rand(6) * 0.7,
        glyph: glyphs[Math.floor(rand(7) * glyphs.length)],
      };
    }),
  );
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="moonrise" aria-hidden="true">
      <div class="sky"></div>
      <div class="stars">
        {#each stars as s, i (i)}
          <span
            class="star"
            style="
              left: {s.left}%;
              bottom: {s.bottom}%;
              font-size: {s.size}rem;
              animation-delay: {s.delay}s;
              animation-duration: {s.duration}s;
              --rise: {s.rise}px;
            ">{s.glyph}</span>
        {/each}
      </div>
      <span class="moon">🌕</span>
    </div>
  {/key}
{/if}

<style>
  .moonrise {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    border-radius: 14px;
    z-index: 1;
  }
  .sky {
    position: absolute;
    inset: 0;
    opacity: 0;
    background:
      radial-gradient(120% 80% at 50% 120%, color-mix(in srgb, var(--primary) 34%, transparent), transparent 70%),
      linear-gradient(to top, color-mix(in srgb, var(--primary) 16%, transparent), transparent 55%);
    animation: sky-wash 1.5s ease-out both;
  }
  .stars {
    position: absolute;
    inset: 0;
  }
  .star {
    position: absolute;
    line-height: 1;
    color: var(--text);
    opacity: 0;
    will-change: transform, opacity;
    animation-name: twinkle-rise;
    animation-timing-function: ease-out;
    animation-fill-mode: both;
  }
  .moon {
    position: absolute;
    left: 50%;
    bottom: 0;
    font-size: 2.4rem;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    filter: drop-shadow(0 0 12px color-mix(in srgb, var(--primary) 60%, transparent));
    animation: moon-rise 1.5s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  }
  @keyframes sky-wash {
    0% { opacity: 0; }
    28% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes twinkle-rise {
    0% { opacity: 0; transform: translateY(6px) scale(0.6); }
    30% { opacity: 0.9; }
    100% { opacity: 0; transform: translateY(calc(var(--rise) * -1)) scale(1); }
  }
  @keyframes moon-rise {
    0% { opacity: 0; transform: translate(-50%, 40px) scale(0.7); }
    35% { opacity: 1; transform: translate(-50%, -18px) scale(1.05); }
    75% { opacity: 0.9; transform: translate(-50%, -24px) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -30px) scale(1); }
  }
</style>
