<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * The verdict on the town. When a winner is recorded a gothic reveal washes the
   * editor: Good breaks into a 🌅 dawn (the Demon has fallen) under a Win-Green
   * glow; Evil falls into a 🌑 blood-moon eclipse under a Loss-Coral wash. Pure
   * delight over a result already spelled out by the pressed Good/Evil button and
   * the banner copy, so motion is never the only signal — and never Crown Gold,
   * which belongs to the leader/winner tally alone. `pointer-events: none`,
   * replays on `token`, silent under reduced motion.
   */
  let { token = 0, team = 'good' }: { token?: number; team?: 'good' | 'evil' } = $props();

  const reduced = prefersReducedMotion();
  const COUNT = 12;
  // Longest run: spark delay (≤0.48s) + duration (≤1.3s) and the 1.8s evil wash.
  const LIFE_MS = 2000;

  // Play for the animation's lifetime only, then unmount — otherwise every
  // spark/orb keeps a `will-change` compositor layer alive forever, pinning the
  // GPU. Reduced motion never plays.
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

  const sparks = $derived(
    !playing
      ? []
      : Array.from({ length: COUNT }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      const good = ['✦', '✧', '⋆', '·'];
      const evil = ['🩸', '✦', '·', '⋆'];
      const glyphs = team === 'evil' ? evil : good;
      return {
        left: 24 + rand(1) * 52,
        bottom: 26 + rand(2) * 34,
        delay: 0.28 + rand(3) * 0.2,
        duration: 0.7 + rand(4) * 0.6,
        spread: (rand(5) - 0.5) * 150,
        rise: 24 + rand(6) * 52,
        size: 0.5 + rand(7) * 0.7,
        glyph: glyphs[Math.floor(rand(8) * glyphs.length)],
      };
    }),
  );
</script>

{#if playing}
  {#key token}
    <div class="verdict" class:evil={team === 'evil'} aria-hidden="true">
      <div class="wash"></div>
      <span class="orb">{team === 'evil' ? '🌑' : '🌅'}</span>
      <div class="sparks">
        {#each sparks as s, i (i)}
          <span
            class="spark"
            style="
              left: {s.left}%;
              bottom: {s.bottom}%;
              font-size: {s.size}rem;
              animation-delay: {s.delay}s;
              animation-duration: {s.duration}s;
              --spread: {s.spread}px;
              --rise: {s.rise}px;
            ">{s.glyph}</span>
        {/each}
      </div>
    </div>
  {/key}
{/if}

<style>
  .verdict {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    border-radius: 14px;
    z-index: 3;
  }
  .wash {
    position: absolute;
    inset: 0;
    opacity: 0;
    background: radial-gradient(120% 90% at 50% 60%, color-mix(in srgb, var(--good) 32%, transparent), transparent 70%);
    animation: verdict-wash 1.6s ease-out both;
  }
  .verdict.evil .wash {
    background: radial-gradient(120% 90% at 50% 55%, color-mix(in srgb, var(--bad) 40%, transparent), transparent 72%);
    animation-duration: 1.8s;
  }
  .orb {
    position: absolute;
    left: 50%;
    top: 46%;
    font-size: 2.3rem;
    line-height: 1;
    opacity: 0;
    transform: translate(-50%, -50%);
    will-change: transform, opacity;
    filter: drop-shadow(0 0 12px color-mix(in srgb, var(--good) 55%, transparent));
    animation: orb-beat 1.6s ease-out both;
  }
  .verdict.evil .orb {
    filter: drop-shadow(0 0 12px color-mix(in srgb, var(--bad) 55%, transparent));
  }
  .sparks {
    position: absolute;
    inset: 0;
  }
  .spark {
    position: absolute;
    line-height: 1;
    color: var(--text);
    opacity: 0;
    will-change: transform, opacity;
    animation-name: spark-fly;
    animation-timing-function: ease-out;
    animation-fill-mode: both;
  }
  @keyframes verdict-wash {
    0% { opacity: 0; }
    30% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes orb-beat {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
    30% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    58% { opacity: 1; transform: translate(-50%, -50%) scale(1.16); }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
  }
  @keyframes spark-fly {
    0% { opacity: 0; transform: translate(0, 0) scale(0.5); }
    30% { opacity: 1; }
    100% { opacity: 0; transform: translate(var(--spread), calc(var(--rise) * -1)) scale(1); }
  }
</style>
