<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * The dread beat: when the 0–0 double-blank penalty lands on a player, a "goose
   * egg" stamp slams down over their row. Pure delight over a sting that's already
   * spelled out in words + number (the 🥚 toggle reads "+50" and the row preview
   * jumps), so motion is never the only signal. `pointer-events: none`, replays
   * whenever `token` changes, and renders nothing under reduced motion.
   */
  let { token = 0, value = 0 }: { token?: number; value?: number } = $props();

  const reduced = prefersReducedMotion();
</script>

{#if !reduced && token > 0 && value > 0}
  {#key token}
    <div class="dread" aria-hidden="true">
      <span class="stamp">🥚 +{value}</span>
    </div>
  {/key}
{/if}

<style>
  .dread {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    overflow: hidden;
    z-index: 3;
  }
  .stamp {
    font-weight: 800;
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
    color: var(--bad);
    padding: 4px 14px;
    border: 2px solid var(--bad);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--bad) 14%, var(--surface));
    white-space: nowrap;
    opacity: 0;
    will-change: transform, opacity;
    transform: rotate(-9deg);
    animation: stamp-slam 1s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  }
  @keyframes stamp-slam {
    0% {
      opacity: 0;
      transform: rotate(-9deg) scale(2.1);
    }
    22% {
      opacity: 1;
      transform: rotate(-9deg) scale(0.92);
    }
    34% {
      transform: rotate(-9deg) scale(1.04);
    }
    46% {
      transform: rotate(-9deg) scale(1);
    }
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: rotate(-9deg) scale(1);
    }
  }
</style>
