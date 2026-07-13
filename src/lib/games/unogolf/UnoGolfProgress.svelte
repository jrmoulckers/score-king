<script lang="ts">
  import { bumpOnChange } from '../../motion';

  /**
   * Uno Golf's per-game "costume" header, format-aware:
   *  - Fixed holes → a slim links ribbon of flags, one per hole, that fills as the
   *    course is played and highlights the hole being entered (front/back-nine aware,
   *    modelled on Golf's LinksProgress).
   *  - Play-to-target → a race-to-the-cap meter: the fill tracks the highest total
   *    creeping toward the cap that ends the game, and the 👑 marks whoever's actually
   *    winning (the LOWEST total, since low wins). Modelled on Uno's race meter.
   *
   * Pure flavour — it lives inside the editor and never touches the shared chrome. The
   * "Hole N of M" / leader text carries the meaning, so the fill is reinforcement only
   * and there's nothing essential to animate under reduced motion.
   */
  let {
    format,
    hole,
    holes,
    target,
    leaderName = null,
    leaderTotal = 0,
    maxTotal = 0,
  }: {
    format: 'holes' | 'target';
    hole: number;
    holes: number;
    target: number;
    leaderName?: string | null;
    leaderTotal?: number;
    maxTotal?: number;
  } = $props();

  const flags = $derived(Array.from({ length: holes }, (_, i) => i + 1));
  const nine = $derived(holes > 9 ? (hole <= 9 ? 'Front nine' : 'Back nine') : '');
  const done = $derived(hole - 1);
  const pct = $derived(target > 0 ? Math.min(100, Math.round((maxTotal / target) * 100)) : 0);
</script>

<div class="links">
  <div class="cap">
    <span class="where">⛳ Hole {hole}{#if format === 'holes'} <span class="of">of {holes}</span>{/if}</span>
    {#if format === 'holes' && nine}
      <span class="nine">{nine}</span>
    {:else if format === 'target'}
      <span class="nine">to {target}</span>
    {/if}
  </div>

  {#if format === 'holes'}
    <div class="fairway" aria-hidden="true">
      {#each flags as f (f)}
        <span class="flag" class:played={f < hole} class:current={f === hole}
          >{f === hole ? '⛳' : f < hole ? '🚩' : '·'}</span>
      {/each}
    </div>
    <span class="sr-only">Hole {hole} of {holes}{nine ? `, ${nine}` : ''}, {done} played.</span>
  {:else}
    <div class="racetop">
      {#if leaderName}
        <span class="lead">👑 <strong class="ellipsis">{leaderName}</strong>
          <span class="tnum leadnum" use:bumpOnChange={leaderTotal}>{leaderTotal}</span>
          <span class="sub">out front</span>
        </span>
      {:else}
        <span class="sub">Nobody's pulled ahead yet</span>
      {/if}
    </div>
    <div class="track"><div class="fill" style="width: {pct}%"></div></div>
    <span class="sr-only">
      Racing to {target}. {leaderName ? `${leaderName} leads with ${leaderTotal}.` : 'No leader yet.'}
    </span>
  {/if}
</div>

<style>
  .links {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 14px;
  }
  .cap {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .where {
    font-weight: 700;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  .of {
    color: var(--muted);
    font-weight: 600;
  }
  .nine {
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .fairway {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 6px;
    align-items: center;
  }
  .flag {
    font-size: 0.92rem;
    line-height: 1;
    opacity: 0.5;
    filter: grayscale(0.6);
  }
  .flag.played {
    opacity: 1;
    filter: none;
  }
  .flag.current {
    opacity: 1;
    filter: none;
    transform: scale(1.25);
  }

  .racetop {
    display: flex;
    align-items: baseline;
    min-width: 0;
  }
  .lead {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    font-weight: 700;
  }
  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  /* The leader's number is the one sanctioned Crown-Gold moment here. */
  .leadnum {
    color: var(--accent-ink);
  }
  .sub {
    font-weight: 500;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
  .track {
    height: 6px;
    border-radius: 999px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 999px;
    background: var(--muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .flag.current {
      transform: none;
    }
  }
</style>
