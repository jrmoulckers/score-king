<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * Codenames' most dramatic beat: the losing team touches the 💀 assassin and the
   * game ends instantly. This overlay dramatizes that single tap — the black
   * assassin card flips up dead-centre, a dark wash blows the losing team's cover,
   * and shards scatter. Pure delight layered over a result that's already spelled
   * out by the ending toggle + the winner panel (so motion is never the only
   * signal). The overlay is `pointer-events: none`, replays whenever `token`
   * changes, and renders nothing at all under reduced motion — the toggle and
   * banner are the calm, instant alternative.
   */
  let { token = 0 }: { token?: number } = $props();

  const reduced = prefersReducedMotion();
  const SHARD_COUNT = 12;

  // Deterministic pseudo-random seeded by token (mirrors the Avalon reveal).
  const shards = $derived(
    Array.from({ length: SHARD_COUNT }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      const glyphs = ['💀', '✕', '·', '▪', '✦'];
      return {
        left: 28 + rand(1) * 44,
        top: 34 + rand(2) * 26,
        delay: 0.34 + rand(3) * 0.2,
        duration: 0.5 + rand(4) * 0.5,
        spread: (rand(5) - 0.5) * 150,
        rise: 16 + rand(6) * 46,
        size: 0.5 + rand(7) * 0.8,
        glyph: glyphs[Math.floor(rand(8) * glyphs.length)],
      };
    }),
  );
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="reveal" aria-hidden="true">
      <div class="wash"></div>
      <span class="card">💀</span>
      <div class="shards">
        {#each shards as s, i (i)}
          <span
            class="shard"
            style="
              left: {s.left}%;
              top: {s.top}%;
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
    /* The assassin steals the game — a dark, ominous scrim. Never Crown Gold. */
    background:
      radial-gradient(120% 90% at 50% 46%, rgba(0, 0, 0, 0.72), transparent 70%);
    animation: wash 1.6s ease-out both;
  }
  .card {
    position: absolute;
    left: 50%;
    top: 44%;
    font-size: 2.6rem;
    line-height: 1;
    opacity: 0;
    transform: translate(-50%, -50%);
    will-change: transform, opacity;
    filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.6));
    animation: card-flip 1.1s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  }
  .shards {
    position: absolute;
    inset: 0;
  }
  .shard {
    position: absolute;
    line-height: 1;
    color: var(--text);
    opacity: 0;
    will-change: transform, opacity;
    animation-name: shard-fly;
    animation-timing-function: ease-out;
    animation-fill-mode: both;
  }

  @keyframes wash {
    0% { opacity: 0; }
    28% { opacity: 1; }
    100% { opacity: 0; }
  }
  /* The black card snaps up out of the grid, spins on its face, then settles. */
  @keyframes card-flip {
    0% { opacity: 0; transform: translate(-50%, -50%) rotateY(90deg) scale(0.6); }
    30% { opacity: 1; transform: translate(-50%, -50%) rotateY(0deg) scale(1.08); }
    58% { opacity: 1; transform: translate(-50%, -50%) rotateY(0deg) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -50%) rotateY(0deg) scale(1.16); }
  }
  @keyframes shard-fly {
    0% { opacity: 0; transform: translate(0, 0) scale(0.5); }
    30% { opacity: 1; }
    100% { opacity: 0; transform: translate(var(--spread), calc(var(--rise) * -1)) scale(1); }
  }
</style>
