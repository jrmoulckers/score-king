<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * The toll of the bell: when the town executes a nominee, a single bell swings
   * over the block and a skull drops beneath a somber Loss-Coral wash. A localized
   * beat, not a full-screen takeover — the execution is already spelled out by the
   * pressed "Executed" state + the history line, so motion is never the only
   * signal. `pointer-events: none`, replays whenever `token` changes, and renders
   * nothing under reduced motion.
   */
  let { token = 0 }: { token?: number } = $props();

  const reduced = prefersReducedMotion();
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="toll" aria-hidden="true">
      <div class="wash"></div>
      <span class="bell">🔔</span>
      <span class="skull">💀</span>
    </div>
  {/key}
{/if}

<style>
  .toll {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    border-radius: 14px;
    z-index: 2;
    display: grid;
    place-items: center;
  }
  .wash {
    position: absolute;
    inset: 0;
    opacity: 0;
    background: radial-gradient(90% 120% at 50% 40%, color-mix(in srgb, var(--bad) 30%, transparent), transparent 70%);
    animation: toll-wash 1.1s ease-out both;
  }
  .bell {
    position: absolute;
    top: 8%;
    font-size: 1.9rem;
    line-height: 1;
    opacity: 0;
    transform-origin: 50% 0;
    will-change: transform, opacity;
    animation: bell-swing 1.1s ease-out both;
  }
  .skull {
    position: absolute;
    top: 34%;
    font-size: 1.8rem;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.5));
    animation: skull-drop 1.1s cubic-bezier(0.4, 0, 0.2, 1) both;
  }
  @keyframes toll-wash {
    0% { opacity: 0; }
    30% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes bell-swing {
    0% { opacity: 0; transform: rotate(-26deg); }
    22% { opacity: 1; transform: rotate(22deg); }
    44% { transform: rotate(-16deg); }
    64% { transform: rotate(12deg); }
    82% { transform: rotate(-6deg); }
    100% { opacity: 0; transform: rotate(0deg); }
  }
  @keyframes skull-drop {
    0% { opacity: 0; transform: translateY(-14px) scale(0.7); }
    38% { opacity: 1; transform: translateY(0) scale(1.12); }
    70% { opacity: 1; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(10px) scale(1); }
  }
</style>
