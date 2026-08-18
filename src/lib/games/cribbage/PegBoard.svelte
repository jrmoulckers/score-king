<script lang="ts">
  import { pegView, skunkLine, doubleSkunkLine } from './logic';

  /**
   * Cribbage's costume: a stylized pegging board lane for one side. Two pegs sit
   * on a real board — the one you just moved and the one behind it — so that's
   * exactly what this shows: a back peg where the side stood before this deal,
   * and a front peg where this deal lands them.
   *
   * The lane is drawn in streets of five holes, the way a board is, but the
   * numbers and words always carry the meaning: the score, the holes still to
   * peg, and a named skunk marker. Colour is never the only signal. The fill uses
   * the neutral/primary tokens; Crown Gold appears solely on the 👑 for the side
   * actually leading, and on the finish flag once a side pegs out.
   *
   * Motion is a single eased slide of the front peg, already skipped wholesale by
   * the reduced-motion media query below — the peg still lands in the right hole,
   * it simply arrives instantly.
   */
  const {
    /** Where the side stood before this deal. */
    before,
    /** Points this deal adds. */
    delta,
    /** Holes to peg out (121 or 61). */
    target,
    /** True when this side currently leads the table — the only 👑 on the lane. */
    leading = false,
    /** Highlight the skunk line (turned off when the group doesn't call skunks). */
    showSkunkLine = true,
  }: {
    before: number;
    delta: number;
    target: number;
    leading?: boolean;
    showSkunkLine?: boolean;
  } = $props();

  const v = $derived(pegView(before, delta, target));
  const pct = (n: number) => (target > 0 ? Math.max(0, Math.min(100, (n / target) * 100)) : 0);

  const backPct = $derived(pct(v.before));
  const frontPct = $derived(pct(v.projected));
  const skunkPct = $derived(pct(skunkLine(target)));
  const doublePct = $derived(pct(doubleSkunkLine(target)));

  /** Street ticks, one per five holes — the board's own rhythm, capped for width. */
  const streets = $derived(
    target > 0 ? Array.from({ length: Math.min(Math.ceil(target / 5), 25) }, (_, i) => i) : [],
  );

  const signed = $derived(delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`);
</script>

{#if target > 0}
  <div class="board" class:out={v.pegsOut}>
    <div class="lane" aria-hidden="true">
      <div class="holes">
        {#each streets as s (s)}
          <span class="street"></span>
        {/each}
      </div>
      <span class="track back" style="transform: scaleX({backPct / 100})"></span>
      <span class="track front" style="transform: scaleX({frontPct / 100})"></span>
      {#if showSkunkLine && doublePct > 0 && doublePct < 100}
        <span class="mark double" style="left: {doublePct}%"></span>
      {/if}
      {#if showSkunkLine && skunkPct > 0 && skunkPct < 100}
        <span class="mark skunk" style="left: {skunkPct}%"></span>
      {/if}
      <span class="peg back-peg" style="left: {backPct}%"></span>
      <span class="peg front-peg" style="left: {frontPct}%"></span>
    </div>

    <div class="read">
      <span class="race">
        <span class="n">{v.before}</span>
        <span class="arrow" aria-hidden="true">→</span>
        <span class="n now">{v.projected}</span>
        <span class="of">/ {target}</span>
      </span>
      <span class="tag">
        {#if v.pegsOut}
          <span class="home">🏁 pegs out!</span>
        {:else}
          <span class="togo">{v.remaining} holes to go</span>
        {/if}
        <span class="swing">({signed})</span>
        {#if leading && !v.pegsOut}<span class="lead" title="Leading">👑</span>{/if}
      </span>
    </div>

    {#if showSkunkLine && !v.pegsOut && v.inSkunkRange}
      <p class="warn-line">🦨 still short of the skunk line ({skunkLine(target)})</p>
    {/if}
  </div>
{/if}

<style>
  .board {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lane {
    position: relative;
    height: 16px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  /* Streets of five holes — the board's own rhythm, purely decorative. */
  .holes {
    position: absolute;
    inset: 0;
    display: flex;
  }
  .street {
    flex: 1;
    border-right: 1px solid var(--border);
    opacity: 0.7;
  }
  .street:last-child {
    border-right: 0;
  }
  .track {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    transform-origin: left center;
    border-radius: 999px;
  }
  /* The settled score sits under a lighter projection of this deal's swing. */
  .track.front {
    background: color-mix(in srgb, var(--primary) 35%, transparent);
    transition: transform var(--dur-slow, 0.24s) var(--ease-out, ease);
  }
  .track.back {
    background: color-mix(in srgb, var(--primary) 70%, transparent);
  }
  .mark {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    transform: translateX(-1px);
  }
  .mark.skunk {
    background: var(--warn);
  }
  .mark.double {
    background: var(--bad);
  }
  .peg {
    position: absolute;
    top: 50%;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    border: 1px solid var(--surface);
  }
  .peg.back-peg {
    background: var(--muted);
  }
  .peg.front-peg {
    background: var(--primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 30%, transparent);
    transition: left var(--dur-slow, 0.24s) var(--ease-out, ease);
  }
  .board.out .peg.front-peg {
    background: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .read {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .race {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-variant-numeric: tabular-nums;
  }
  .n {
    font-weight: 700;
    color: var(--text);
  }
  .n.now {
    color: var(--primary);
  }
  .tag {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .home {
    color: var(--accent-ink);
    font-weight: 800;
  }
  .swing {
    color: var(--muted);
    font-weight: 500;
  }
  .warn-line {
    margin: 0;
    font-size: 0.8rem;
    color: var(--warn);
    font-variant-numeric: tabular-nums;
  }
  @media (prefers-reduced-motion: reduce) {
    .track.front,
    .peg.front-peg {
      transition: none;
    }
  }
</style>
