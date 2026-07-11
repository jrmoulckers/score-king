<script lang="ts">
  /**
   * Rummikub's zero-sum heart made visible: the round **pot** — the total value of everyone's
   * leftover tiles — which the player who goes out scoops whole while the rest of the table
   * loses it. The number is the truth (tabular, always shown); the fill bar is decorative
   * reinforcement of "how big the pot is getting," and once someone is marked out the pot
   * visibly **swings to them** (→ name) in the semantic good accent. Pure per-game costume:
   * no Royal Violet (Save) and no Crown Gold (leader) — the swing is the calm "good" green,
   * co-signalled by 🎁/🏆, the arrow, and the winner's name so colour is never alone.
   *
   * Motion is a flourish: the fill glides, but drops to an instant set under reduced motion —
   * the pot value and destination read the same either way.
   */
  import { prefersReducedMotion } from '../../motion';

  let {
    total = 0,
    winnerName = null,
  }: { total?: number; winnerName?: string | null } = $props();

  const reduced = prefersReducedMotion();
  // A soft, capped scale so the bar reads as "small / building / fat pot" without pretending
  // to be a precise metric — the number carries the exact stakes.
  const fill = $derived(Math.max(0, Math.min(1, total / 90)));
  const claimed = $derived(!!winnerName && total > 0);
</script>

<div class="pot" class:claimed role="img"
  aria-label={winnerName
    ? `Pot of ${total}, going to ${winnerName}`
    : `Pot of ${total}, up for grabs`}>
  <div class="bar" class:reduced aria-hidden="true">
    <div class="fillbar" style="--fill: {fill}"></div>
  </div>
  <div class="face">
    <span class="left">
      <span class="gift">🎁</span>
      <strong class="amt">{total}</strong>
      <span class="lbl">in the pot</span>
    </span>
    {#if claimed}
      <span class="dest" aria-hidden="true">🏆 → {winnerName}</span>
    {:else}
      <span class="grab" aria-hidden="true">up for grabs</span>
    {/if}
  </div>
</div>

<style>
  .pot {
    position: relative;
    overflow: hidden;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px;
  }
  .bar {
    position: absolute;
    inset: 0;
    z-index: 0;
  }
  /* Decorative "how fat is the pot" fill, contained behind the text. Neutral while up for
     grabs; the parent .claimed swaps it to the good accent when the pot swings to a winner. */
  .fillbar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 100%;
    transform: scaleX(var(--fill, 0));
    transform-origin: left center;
    background: color-mix(in srgb, var(--muted) 22%, transparent);
    transition: transform 0.4s var(--ease-out), background var(--dur-base) var(--ease-standard);
  }
  .claimed .fillbar {
    background: color-mix(in srgb, var(--good) 26%, transparent);
  }
  .bar.reduced .fillbar {
    transition: none;
  }
  .face {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .left {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }
  .gift {
    font-size: 1rem;
  }
  .amt {
    font-size: 1.25rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .lbl {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .grab {
    font-size: 0.8rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .dest {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--good);
    white-space: nowrap;
    max-width: 55%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
