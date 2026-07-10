<script lang="ts">
  import type { ID } from '../../types';

  /**
   * Fluff's per-game costume: a rack of dice-**cups**, one per player, that visibly
   * dwindles as the table gets whittled down to a single survivor. Each cup shows its
   * remaining dice as tinted pip-dice; a cup that empties tips over to 💀; the last cup
   * standing is crowned 👑. It's the thematic "stage" the tracker was missing — the
   * tension of a shrinking table, read at a glance. Lives entirely inside the Fluff
   * editor and never touches the shared chrome.
   *
   * Design guardrails: no Royal Violet (that stays on the shell's one Save action) and
   * Crown Gold appears only on the lone survivor — the leader/winner rule. Depth comes
   * from the surface ramp plus muted/semantic tints. Every state is co-signalled by a
   * glyph + count + name (🥤 / number / 💀 / 👑), never colour alone, and the caption
   * spells out the counts, so the rack degrades gracefully and needs no motion to read.
   */
  type Seat = {
    id: ID;
    name: string;
    color: string;
    remaining: number;
    start: number;
    state: 'alive' | 'brink' | 'out' | 'winner';
  };

  let {
    seats,
    cupsLeft,
    diceInPlay,
    wild = true,
    palificoName = null,
    winnerName = null,
  }: {
    seats: Seat[];
    cupsLeft: number;
    diceInPlay: number;
    wild?: boolean;
    palificoName?: string | null;
    winnerName?: string | null;
  } = $props();
</script>

<div class="stage" class:won={!!winnerName}>
  <div class="caption">
    {#if winnerName}
      <span class="win">🎲👑 {winnerName} — last cup standing!</span>
    {:else}
      <span class="count">
        <span class="num">{cupsLeft}</span>
        {cupsLeft === 1 ? 'cup' : 'cups'} still shaking ·
        <span class="num">{diceInPlay}</span>
        {diceInPlay === 1 ? 'die' : 'dice'} on the table
      </span>
      <span class="sub muted">
        {#if palificoName}
          🎯 Palifico — {palificoName} is on their last die
        {:else}
          {wild ? '⚀ ones are wild — bluff hard' : '⚀ ones are tame this round'}
        {/if}
      </span>
    {/if}
  </div>

  <div class="rack" aria-hidden="true">
    {#each seats as s (s.id)}
      <span
        class="cup"
        class:out={s.state === 'out'}
        class:winner={s.state === 'winner'}
        class:brink={s.state === 'brink'}
        style="--pc: {s.color}"
        title={s.name}
      >
        <span class="glyph">{s.state === 'out' ? '💀' : s.state === 'winner' ? '👑' : '🥤'}</span>
        <span class="pips">
          {#each Array.from({ length: s.start }) as _, i (i)}
            <span class="pip" class:filled={i < s.remaining}></span>
          {/each}
        </span>
        <span class="tally num">{s.state === 'out' ? 'OUT' : s.remaining}</span>
        <span class="who">{s.name}</span>
      </span>
    {/each}
  </div>
</div>

<style>
  .stage {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  /* The win beat borrows the scoreboard's restrained Crown Gold edge — the 👑 and the
     gold caption carry it, so gold stays a hint, never a block. */
  .stage.won {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
  }
  .caption {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .count {
    font-weight: 700;
    font-size: 0.98rem;
  }
  .win {
    font-weight: 800;
    font-size: 1.02rem;
    color: var(--accent-ink);
  }
  .sub {
    font-size: 0.78rem;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .rack {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cup {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 62px;
    padding: 6px 4px 5px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    /* A quiet tint of the player's palette colour so cups stay distinguishable,
       reinforced by the name label — never colour alone. */
    border: 1px solid color-mix(in srgb, var(--pc) 45%, var(--border));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--pc) 12%, transparent);
    line-height: 1;
  }
  .glyph {
    font-size: 1.1rem;
  }
  .pips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 2px;
    min-height: 9px;
  }
  .pip {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--pc) 55%, var(--border));
    opacity: 0.35;
  }
  .pip.filled {
    background: color-mix(in srgb, var(--pc) 78%, var(--text));
    border-color: color-mix(in srgb, var(--pc) 78%, var(--text));
    opacity: 1;
  }
  .tally {
    font-weight: 800;
    font-size: 0.82rem;
  }
  .who {
    max-width: 100%;
    font-size: 0.66rem;
    font-weight: 600;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Eliminated: dimmed and desaturated, carried by the 💀 glyph + "OUT". Not coral —
     being out isn't an error, just out. */
  .cup.out {
    opacity: 0.5;
    border-style: dashed;
    filter: grayscale(0.4);
  }
  .cup.out .tally {
    font-size: 0.66rem;
    color: var(--muted);
  }
  /* On the brink — one die left. An amber edge, always co-signalled by the count (1)
     and a shortened cup, so it reads for colour-blind players too. */
  .cup.brink {
    border-color: color-mix(in srgb, var(--warn) 60%, var(--border));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--warn) 16%, transparent);
  }
  .cup.brink .tally {
    color: var(--warn);
  }
  .cup.winner {
    border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 26%, transparent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  }
  .cup.winner .tally {
    color: var(--accent-ink);
  }
</style>
