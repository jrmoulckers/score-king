<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * Avalon's signature beat: when Good completes three quests, the Assassin gets one shot at
   * Merlin. This overlay dramatizes that single guess — a dagger sweeps across the stage and
   * strikes. On a `found` hit the strike lands blood-red and Evil steals the game; on a miss
   * the blade glances off a shield and Good holds. Pure delight layered over a result that is
   * already spelled out in the banner text + the winning-team tally, so motion is never the
   * only signal. The overlay is `pointer-events: none`, replays whenever `token` changes, and
   * renders nothing at all under reduced motion — the banner is the calm, instant alternative.
   */
  let { token = 0, found = false }: { token?: number; found?: boolean } = $props();

  const reduced = prefersReducedMotion();
  const SPARK_COUNT = 10;

  // Deterministic pseudo-random seeded by token (mirrors CoinBurst / MoonRise).
  const sparks = $derived(
    Array.from({ length: SPARK_COUNT }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      const hitGlyphs = found ? ['🩸', '✦', '✧', '·'] : ['✦', '✧', '⋆', '·'];
      return {
        left: 30 + rand(1) * 40,
        bottom: 30 + rand(2) * 30,
        delay: 0.42 + rand(3) * 0.18,
        duration: 0.5 + rand(4) * 0.5,
        spread: (rand(5) - 0.5) * 120,
        rise: 20 + rand(6) * 44,
        size: 0.5 + rand(7) * 0.7,
        glyph: hitGlyphs[Math.floor(rand(8) * hitGlyphs.length)],
      };
    }),
  );
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="reveal" class:found aria-hidden="true">
      <div class="wash"></div>
      <span class="target">{found ? '🧙' : '🛡️'}</span>
      <span class="dagger">🗡️</span>
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
  .reveal {
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
    /* Miss → a calm violet/good glow; hit → the Loss-Coral steal. Never Crown Gold. */
    background:
      radial-gradient(120% 90% at 50% 60%, color-mix(in srgb, var(--good) 30%, transparent), transparent 70%);
    animation: wash 1.5s ease-out both;
  }
  .reveal.found .wash {
    background:
      radial-gradient(120% 90% at 50% 55%, color-mix(in srgb, var(--bad) 40%, transparent), transparent 72%);
    animation-duration: 1.7s;
  }
  .target {
    position: absolute;
    left: 50%;
    top: 46%;
    font-size: 2rem;
    line-height: 1;
    opacity: 0;
    transform: translate(-50%, -50%);
    will-change: transform, opacity;
    animation: target-beat 1.5s ease-out both;
  }
  .dagger {
    position: absolute;
    top: 44%;
    font-size: 2.1rem;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
    animation: dagger-sweep 0.85s cubic-bezier(0.4, 0, 0.2, 1) both;
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

  @keyframes wash {
    0% { opacity: 0; }
    32% { opacity: 1; }
    100% { opacity: 0; }
  }
  /* Blade sweeps in from the left, pauses at the target, then drives through on the strike. */
  @keyframes dagger-sweep {
    0% { opacity: 0; left: -12%; transform: rotate(-20deg) scale(0.9); }
    35% { opacity: 1; left: 42%; transform: rotate(-8deg) scale(1); }
    58% { left: 46%; transform: rotate(-8deg) scale(1.08); }
    100% { opacity: 0; left: 52%; transform: rotate(6deg) scale(1.18); }
  }
  @keyframes target-beat {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
    30% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    58% { opacity: 1; transform: translate(-50%, -50%) scale(1.14); }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
  }
  @keyframes spark-fly {
    0% { opacity: 0; transform: translate(0, 0) scale(0.5); }
    30% { opacity: 1; }
    100% { opacity: 0; transform: translate(var(--spread), calc(var(--rise) * -1)) scale(1); }
  }
</style>
