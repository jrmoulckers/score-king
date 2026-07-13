<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * The clocktower's heartbeat: each phase opens with a dusk↔dawn wash over the
   * editor. On a 🌙 night the sky cools, a moon rises and stars twinkle up; on a
   * ☀️ day the sky warms, the sun climbs and rays fan out. Pure atmosphere layered
   * over the phase header, which already names the phase in words + emoji, so the
   * sky is never the only signal. Mirrors Hearts' MoonRise: `pointer-events: none`,
   * replays whenever `token` changes (a new phase), and renders nothing at all
   * under reduced motion — the header is the calm, instant alternative.
   */
  let { token = 0, kind = 'night' }: { token?: number; kind?: 'night' | 'day' } = $props();

  const reduced = prefersReducedMotion();
  const COUNT = 14;
  // Longest glyph run: mote delay (≤0.4s) + duration (≤1.6s) plus a small margin.
  const LIFE_MS = 2100;

  // Play only for the animation's lifetime, then unmount. Leaving the overlay
  // mounted keeps every mote/orb's `will-change` compositor layer alive forever,
  // pinning the GPU and making the whole editor sluggish. Resetting to inert
  // once the run finishes releases those layers. Reduced motion never plays.
  let playing = $state(false);
  let seen = 0;
  $effect(() => {
    const t = token;
    if (reduced || t <= 0 || t === seen) return;
    seen = t;
    playing = true;
    const id = setTimeout(() => (playing = false), LIFE_MS);
    return () => clearTimeout(id);
  });

  // Deterministic pseudo-random seeded by token (mirrors MoonRise / CoinBurst).
  // Only derived while playing, so an unrelated editor change never rebuilds it.
  const motes = $derived(
    !playing
      ? []
      : Array.from({ length: COUNT }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      const night = ['✦', '✧', '⋆', '·', '✦'];
      const day = ['·', '✧', '⋆', '·'];
      const glyphs = kind === 'night' ? night : day;
      return {
        left: rand(1) * 100,
        bottom: rand(2) * 66,
        delay: rand(3) * 0.4,
        duration: 0.9 + rand(4) * 0.7,
        rise: 24 + rand(5) * 58,
        size: 0.5 + rand(6) * 0.65,
        glyph: glyphs[Math.floor(rand(7) * glyphs.length)],
      };
    }),
  );
</script>

{#if playing}
  {#key token}
    <div class="sky-wrap" class:day={kind === 'day'} aria-hidden="true">
      <div class="wash"></div>
      <div class="motes">
        {#each motes as m, i (i)}
          <span
            class="mote"
            style="
              left: {m.left}%;
              bottom: {m.bottom}%;
              font-size: {m.size}rem;
              animation-delay: {m.delay}s;
              animation-duration: {m.duration}s;
              --rise: {m.rise}px;
            ">{m.glyph}</span>
        {/each}
      </div>
      <span class="orb">{kind === 'night' ? '🌙' : '☀️'}</span>
    </div>
  {/key}
{/if}

<style>
  .sky-wrap {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    border-radius: 14px;
    z-index: 1;
  }
  .wash {
    position: absolute;
    inset: 0;
    opacity: 0;
    /* Night: a cool violet dusk. Day: a warm dawn — semantic warmth, never Crown Gold. */
    background:
      radial-gradient(120% 80% at 50% 118%, color-mix(in srgb, var(--primary) 30%, transparent), transparent 68%),
      linear-gradient(to top, color-mix(in srgb, var(--primary) 14%, transparent), transparent 55%);
    animation: sky-wash 1.5s ease-out both;
  }
  .sky-wrap.day .wash {
    background:
      radial-gradient(120% 80% at 50% 118%, color-mix(in srgb, var(--warn) 26%, transparent), transparent 68%),
      linear-gradient(to top, color-mix(in srgb, var(--warn) 12%, transparent), transparent 55%);
  }
  .motes {
    position: absolute;
    inset: 0;
  }
  .mote {
    position: absolute;
    line-height: 1;
    color: var(--text);
    opacity: 0;
    will-change: transform, opacity;
    animation-name: mote-rise;
    animation-timing-function: ease-out;
    animation-fill-mode: both;
  }
  .orb {
    position: absolute;
    left: 50%;
    bottom: 0;
    font-size: 2.2rem;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    filter: drop-shadow(0 0 12px color-mix(in srgb, var(--primary) 55%, transparent));
    animation: orb-rise 1.5s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  }
  .sky-wrap.day .orb {
    filter: drop-shadow(0 0 14px color-mix(in srgb, var(--warn) 60%, transparent));
  }
  @keyframes sky-wash {
    0% { opacity: 0; }
    28% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes mote-rise {
    0% { opacity: 0; transform: translateY(6px) scale(0.6); }
    30% { opacity: 0.9; }
    100% { opacity: 0; transform: translateY(calc(var(--rise) * -1)) scale(1); }
  }
  @keyframes orb-rise {
    0% { opacity: 0; transform: translate(-50%, 38px) scale(0.7); }
    35% { opacity: 1; transform: translate(-50%, -16px) scale(1.05); }
    75% { opacity: 0.9; transform: translate(-50%, -22px) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -28px) scale(1); }
  }
</style>
