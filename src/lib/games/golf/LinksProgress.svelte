<script lang="ts">
  /**
   * Golf's per-game "costume": a slim links ribbon of flags, one per hole, that
   * fills as the course is played and highlights the hole being entered. Front /
   * back-nine aware so a full 18 reads like a real card. Pure flavor — it lives
   * entirely inside the editor and never touches the shared chrome. The "Hole N of
   * M" text and the current-flag marker carry the meaning, so the fill is only
   * reinforcement and there's nothing essential to animate under reduced motion.
   */
  let { hole, holes }: { hole: number; holes: number } = $props();

  const flags = $derived(Array.from({ length: holes }, (_, i) => i + 1));
  // Only split into nines when there's a back nine to speak of.
  const nine = $derived(
    holes > 9 ? (hole <= 9 ? 'Front nine' : 'Back nine') : '',
  );
  const done = $derived(hole - 1);
</script>

<div class="links">
  <div class="cap">
    <span class="where">⛳ Hole {hole} <span class="of">of {holes}</span></span>
    {#if nine}<span class="nine">{nine}</span>{/if}
  </div>
  <div class="fairway" aria-hidden="true">
    {#each flags as f (f)}
      <span
        class="flag"
        class:played={f < hole}
        class:current={f === hole}
      >{f === hole ? '⛳' : f < hole ? '🚩' : '·'}</span>
    {/each}
  </div>
  <span class="sr-only">Hole {hole} of {holes}{nine ? `, ${nine}` : ''}, {done} played.</span>
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
</style>
