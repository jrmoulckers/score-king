<script lang="ts">
  import Avatar from '../../components/Avatar.svelte';

  /**
   * The race to the target — two lanes climbing side-by-side so the whole game is
   * glanceable in one look: who's ahead, by how much, how far each side has to go,
   * and (with bust on) who's edging into the danger zone where a big frame tumbles
   * them back to 15.
   *
   * Crown Gold appears on exactly one thing here — the current leader's number and
   * 👑 — honoring the Crown Gold Rule; everything else is built from the surface
   * ramp and semantic tints. The lead is co-signalled by the 👑 and the number, so
   * it never rides on color alone. The projected band previews this frame's swing.
   */
  interface Lane {
    id: string;
    name: string;
    color: string;
    total: number;
    /** Projected point change from the frame being entered (may be negative on a bust). */
    gain: number;
    isLeader: boolean;
    danger: boolean;
  }

  let { lanes, target }: { lanes: Lane[]; target: number } = $props();

  const pct = (v: number) => Math.max(0, Math.min(100, (v / Math.max(1, target)) * 100));

  function togo(total: number): number {
    return Math.max(0, target - total);
  }
</script>

<div class="race" role="group" aria-label={`Race to ${target}`}>
  <div class="cap">
    <span class="overline">Race to {target}</span>
  </div>
  {#each lanes as l (l.id)}
    {@const projected = l.total + l.gain}
    {@const dropping = projected < l.total}
    <div class="lane" class:leader={l.isLeader} class:danger={l.danger}>
      <div class="lhead">
        <span class="who">
          <Avatar name={l.name} color={l.color} size={22} />
          <span class="nm">{l.name}</span>
        </span>
        <span class="score" class:lead={l.isLeader}>
          {#if l.isLeader}<span class="crown" aria-hidden="true">👑</span>{/if}
          <span class="val">{l.total}</span>
        </span>
      </div>
      <div class="track">
        <div class="fill" style="transform: scaleX({pct(Math.min(l.total, projected)) / 100})"></div>
        {#if l.gain > 0}
          <div
            class="ghost gain"
            style="left: {pct(l.total)}%; width: {pct(Math.min(projected, target)) - pct(l.total)}%"
          ></div>
        {:else if dropping}
          <div
            class="ghost drop"
            style="left: {pct(projected)}%; width: {pct(l.total) - pct(projected)}%"
          ></div>
        {/if}
        {#if l.danger}<span class="dangerEdge" aria-hidden="true"></span>{/if}
      </div>
      <div class="lfoot">
        {#if l.total >= target}
          <span class="good">🌽 at {target} — one clean frame closes it</span>
        {:else}
          <span class="muted"><strong class="num">{togo(l.total)}</strong> to go</span>
        {/if}
        {#if l.danger}<span class="warn">· 💥 bust zone</span>{/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .race {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .cap {
    display: flex;
    justify-content: center;
  }
  .overline {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .lane {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  /* Leader gets a restrained Crown Gold wash + edge — the same scarce gold as the
     winner row, and only ever on the side that's actually reigning. */
  .lane.leader {
    background: color-mix(in srgb, var(--accent) 9%, var(--surface));
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  }
  /* Bust danger reads through the 💥 + "bust zone" words; the coral edge is a hint. */
  .lane.danger {
    border-color: color-mix(in srgb, var(--bad) 40%, var(--border));
  }
  .lhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .nm {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .score {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
  }
  .score .val {
    font-size: 1.15rem;
  }
  .score.lead .val {
    color: var(--accent-ink);
  }
  .crown {
    font-size: 0.9rem;
  }
  .track {
    position: relative;
    height: 10px;
    border-radius: 999px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    width: 100%;
    height: 100%;
    border-radius: 999px;
    transform-origin: left center;
    background: color-mix(in srgb, var(--text) 55%, var(--surface-3));
    transition: transform var(--dur-base) var(--ease-standard);
  }
  .lane.leader .fill {
    background: color-mix(in srgb, var(--accent) 60%, var(--surface-3));
  }
  .ghost {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 999px;
  }
  /* Previewed gain this frame — a lighter segment reaching ahead of the current fill. */
  .ghost.gain {
    background: repeating-linear-gradient(
      45deg,
      color-mix(in srgb, var(--good) 55%, transparent),
      color-mix(in srgb, var(--good) 55%, transparent) 4px,
      transparent 4px,
      transparent 8px
    );
  }
  /* Previewed bust drop — the coral band the score would recede across. */
  .ghost.drop {
    background: repeating-linear-gradient(
      45deg,
      color-mix(in srgb, var(--bad) 55%, transparent),
      color-mix(in srgb, var(--bad) 55%, transparent) 4px,
      transparent 4px,
      transparent 8px
    );
  }
  .dangerEdge {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 6px;
    background: var(--bad);
    opacity: 0.7;
  }
  .lfoot {
    display: flex;
    gap: 6px;
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
  }
  .lfoot .num {
    font-weight: 800;
    color: var(--text);
  }
  .lfoot .good {
    color: var(--good);
    font-weight: 600;
  }
  .lfoot .warn {
    color: var(--bad);
    font-weight: 600;
  }
</style>
