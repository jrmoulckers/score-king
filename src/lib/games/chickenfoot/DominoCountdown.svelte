<script lang="ts">
  import { onMount } from 'svelte';
  import { animateMotion, prefersReducedMotion } from '../../motion';
  import { doubleLabel, roundFlavor } from './logic';
  import DominoFace from './DominoFace.svelte';

  /**
   * Chicken Foot's per-game costume: a countdown strip of every double from the
   * starting double down to the dreaded double-blank, with a 🐔 that walks toward
   * the goose egg as the rounds tick by. Pure barnyard flavor — it lives entirely
   * inside the game editor and never touches the shared chrome.
   *
   * Deliberately violet-free and gold-free: Royal Violet stays on the shell's one
   * Save action and Crown Gold on the leader, so this strip is built only from the
   * surface ramp plus muted/semantic tints. The round number, double label and
   * flavor name carry the meaning in text, so the walking chicken is decoration
   * only and is skipped under reduced motion (it simply appears on the current tile).
   */
  let { start, current, round, total }: {
    start: number;
    current: number;
    round: number;
    total: number;
  } = $props();

  // Doubles from the starting double down to 0 (the blank). Higher doubles are
  // already played; the current one is "here"; lower doubles are still to come.
  const doubles = $derived(Array.from({ length: start + 1 }, (_, i) => start - i));
  const flavor = $derived(roundFlavor(current));
  const isBlank = $derived(current <= 0);
  // Chicken sits centered over the current tile: (index + 0.5) / count across.
  const idx = $derived(Math.max(0, start - current));
  const chickPct = $derived(doubles.length > 0 ? ((idx + 0.5) / doubles.length) * 100 : 0);

  let chick: HTMLSpanElement | undefined = $state();

  onMount(() => {
    if (!chick || prefersReducedMotion()) return;
    // Strut in from the previous double with a little head-bob; the final blank
    // round gets a bigger, more anxious flap — the goose egg looms.
    const from = doubles.length > 0 ? Math.max(0, ((idx - 0.5) / doubles.length) * 100) : 0;
    animateMotion(
      chick,
      isBlank
        ? { left: [`${from}%`, `${chickPct}%`], rotate: [-10, 10, -6, 0], scale: [0.9, 1.2, 1] }
        : { left: [`${from}%`, `${chickPct}%`], rotate: [-7, 5, 0] },
      { duration: isBlank ? 0.85 : 0.55, ease: 'easeOut' },
    );
  });
</script>

<div class="countdown" class:blank={isBlank}>
  <div class="head">
    <DominoFace a={current} size="lg" label={`${doubleLabel(current)} — this round's chicken foot`} />
    <div class="cap">
      <span class="round">Round {round} of {total}</span>
      <span class="name">{isBlank ? '🥚 ' : '🐔 '}{doubleLabel(current)} · {flavor}</span>
      <span class="sub muted">
        {isBlank ? 'the dreaded goose egg — mind the penalty' : 'counting the doubles down to the 🥚'}
      </span>
    </div>
  </div>
  <div class="track-wrap" aria-hidden="true">
    <div class="track">
      {#each doubles as d (d)}
        <span
          class="tile"
          class:done={d > current}
          class:here={d === current}
          class:egg={d === 0}
        >{d}</span>
      {/each}
    </div>
    <span class="chick" bind:this={chick} style="left: {chickPct}%">{isBlank ? '🐥' : '🐔'}</span>
  </div>
</div>

<style>
  .countdown {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  /* The blank round foreshadows the goose egg with a restrained loss-coral edge —
     co-signalled by the 🥚 and the "Goose Egg" name, never colour alone. */
  .countdown.blank {
    border-color: color-mix(in srgb, var(--bad) 45%, var(--border));
  }
  .cap {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .round {
    font-size: 0.78rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .name {
    font-weight: 700;
    font-size: 1rem;
  }
  .sub {
    font-size: 0.78rem;
  }
  .track-wrap {
    position: relative;
    padding-top: 20px; /* headroom for the walking chicken */
  }
  .track {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 3px;
  }
  .tile {
    flex: 1 1 0;
    min-width: 0;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--muted);
    font-weight: 800;
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }
  /* Already-played doubles: filled in, quietly settled. */
  .tile.done {
    background: var(--surface-3);
    color: var(--text);
    opacity: 0.6;
  }
  /* The double being played right now: raised and bold, marked by the chicken above. */
  .tile.here {
    background: var(--surface-3);
    color: var(--text);
    border-color: var(--text);
    transform: scale(1.12);
  }
  /* The goose egg waiting at the end — dashed and ominous. */
  .tile.egg {
    border-style: dashed;
    border-color: color-mix(in srgb, var(--bad) 40%, var(--border));
  }
  .tile.egg.here {
    background: color-mix(in srgb, var(--bad) 12%, var(--surface-3));
    border-color: var(--bad);
    color: var(--text);
  }
  .chick {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-size: 1.15rem;
    line-height: 1;
    pointer-events: none;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35));
  }
</style>
