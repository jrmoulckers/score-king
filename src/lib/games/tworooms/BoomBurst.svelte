<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * The full-screen payoff for Two Rooms' final Reveal — the "…and a Boom" moment.
   *
   *   kind='boom' → 💥 the Bomber caught the President: a radial debris blast from
   *                 centre with a hot flash (Red wins).
   *   kind='dove' → 🕊️ the President escaped: doves lift and feathers drift up
   *                 (Blue wins).
   *
   * Pure delight layered over an outcome already spelled out in words + emoji + the
   * winner chips, so motion is never the only signal. The overlay is `fixed`,
   * `pointer-events:none`, `aria-hidden`, replays whenever `token` changes, and
   * renders nothing at all under reduced motion (the reveal banner is the calm,
   * instant alternative). Modeled on the app's existing burst components
   * (KaboomBurst / CoinBurst / PhaseSky).
   */
  let { token = 0, kind = 'boom' }: { token?: number; kind?: 'boom' | 'dove' } = $props();

  const reduced = prefersReducedMotion();

  const pieces = $derived.by(() => {
    const boom = kind === 'boom';
    const count = boom ? 22 : 16;
    const glyphs = boom
      ? ['💥', '💥', '🔥', '💣', '✨', '💨', '⚡']
      : ['🕊️', '🕊️', '🪶', '✨', '☁️', '🕊️'];
    return Array.from({ length: count }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      if (boom) {
        // Radial scatter from screen centre — a real outward blast.
        const angle = (i / count) * Math.PI * 2 + (rand(0) - 0.5) * 0.6;
        const dist = 30 + rand(1) * 46; // vw/vh units
        return {
          dx: `${Math.cos(angle) * dist}vw`,
          dy: `${Math.sin(angle) * dist}vh`,
          startX: 50,
          startY: 50,
          delay: rand(2) * 0.1,
          duration: 0.7 + rand(3) * 0.5,
          spin: (rand(4) - 0.5) * 420,
          size: 1.4 + rand(5) * 1.9,
          glyph: glyphs[Math.floor(rand(6) * glyphs.length)],
        };
      }
      // Doves: lift from a low band and drift up-and-out across the screen.
      const drift = (rand(0) - 0.5) * 34;
      return {
        dx: `${drift}vw`,
        dy: `${-(58 + rand(1) * 34)}vh`,
        startX: 12 + rand(2) * 76,
        startY: 74 + rand(3) * 18,
        delay: rand(4) * 0.4,
        duration: 1.5 + rand(5) * 0.9,
        spin: (rand(6) - 0.5) * 40,
        size: 1.5 + rand(0) * 1.4,
        glyph: glyphs[Math.floor(rand(6) * glyphs.length)],
      };
    });
  });
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="boomwrap" class:dove={kind === 'dove'} aria-hidden="true">
      {#if kind === 'boom'}<div class="flash"></div>{/if}
      {#each pieces as p, i (i)}
        <span
          class="bit"
          style="
            left: {p.startX}%;
            top: {p.startY}%;
            font-size: {p.size}rem;
            animation-delay: {p.delay}s;
            animation-duration: {p.duration}s;
            --dx: {p.dx};
            --dy: {p.dy};
            --spin: {p.spin}deg;
          ">{p.glyph}</span>
      {/each}
    </div>
  {/key}
{/if}

<style>
  .boomwrap {
    position: fixed;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 60;
  }
  /* A hot flash for the boom — semantic loss coral, not Crown Gold. */
  .flash {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      60% 50% at 50% 50%,
      color-mix(in srgb, var(--bad) 55%, transparent),
      transparent 70%
    );
    opacity: 0;
    animation: boom-flash 0.5s ease-out both;
  }
  .bit {
    position: absolute;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    transform: translate(-50%, -50%);
    animation-name: boom-fly;
    animation-timing-function: cubic-bezier(0.16, 0.84, 0.44, 1);
    animation-iteration-count: 1;
    animation-fill-mode: both;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4));
  }
  .boomwrap.dove .bit {
    animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  @keyframes boom-flash {
    0% {
      opacity: 0;
    }
    20% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes boom-fly {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) rotate(0deg) scale(0.3);
    }
    16% {
      opacity: 1;
      transform: translate(calc(-50% + var(--dx) * 0.4), calc(-50% + var(--dy) * 0.4))
        rotate(calc(var(--spin) * 0.4)) scale(1.1);
    }
    100% {
      opacity: 0;
      transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--spin))
        scale(0.85);
    }
  }
</style>
