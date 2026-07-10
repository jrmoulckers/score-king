<script lang="ts">
  import type { ID } from '../../types';

  /**
   * Exploding Kittens' per-game costume: a compact strip of kitten faces, one per
   * player, that visibly go 🐱 → 💥 as the deck thins toward a single survivor. It's
   * the thematic "stage" the game was missing — the tension of the table shrinking to
   * one, read at a glance. Lives entirely inside the game editor and never touches the
   * shared chrome.
   *
   * Design guardrails: no Royal Violet (that stays on the shell's one Save action) and
   * Crown Gold appears only on the lone survivor — the leader/winner rule. Depth comes
   * from the surface ramp plus muted/semantic tints. Every state is co-signalled by a
   * glyph + text (💥 / rank number / struck name / 👑), never colour alone, and the
   * live caption spells out the count, so the strip is decoration that degrades
   * gracefully and needs no motion to be understood.
   */
  type Seat = {
    id: ID;
    name: string;
    color: string;
    state: 'alive' | 'out' | 'survivor';
    outRank: number; // 1-based explosion order, 0 for alive/survivor
  };

  let {
    seats,
    aliveCount,
    survivorName = null,
    imploding = false,
  }: {
    seats: Seat[];
    aliveCount: number;
    survivorName?: string | null;
    imploding?: boolean;
  } = $props();
</script>

<div class="stage" class:won={!!survivorName}>
  <div class="caption">
    {#if survivorName}
      <span class="win">🐱👑 {survivorName} — last kitten standing!</span>
    {:else}
      <span class="count"><span class="num">{aliveCount}</span> {aliveCount === 1 ? 'kitten' : 'kittens'} still clawing</span>
      <span class="sub muted">{imploding ? '☠️ one of them can’t be defused…' : 'draw til someone goes 💥'}</span>
    {/if}
  </div>

  <div class="strip" aria-hidden="true">
    {#each seats as s (s.id)}
      <span
        class="face"
        class:out={s.state === 'out'}
        class:survivor={s.state === 'survivor'}
        style="--pc: {s.color}"
        title={s.name}
      >
        <span class="glyph">{s.state === 'out' ? '💥' : s.state === 'survivor' ? '👑' : '🐱'}</span>
        {#if s.state === 'out'}
          <span class="rank num">{s.outRank}</span>
        {/if}
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
    font-size: 1rem;
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
  .strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .face {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    /* A quiet tint of the player's palette colour so seats stay distinguishable,
       reinforced by the title/name — never colour alone. */
    border: 1px solid color-mix(in srgb, var(--pc) 45%, var(--border));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--pc) 14%, transparent);
    font-size: 1.15rem;
    line-height: 1;
  }
  /* Exploded: dimmed and desaturated, carried by the 💥 glyph + rank number. Not
     coral — being out isn't an error, just out. */
  .face.out {
    opacity: 0.5;
    border-style: dashed;
    filter: grayscale(0.4);
  }
  .face.survivor {
    border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 26%, transparent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  }
  .glyph {
    display: block;
  }
  .rank {
    position: absolute;
    right: -3px;
    bottom: -3px;
    min-width: 15px;
    height: 15px;
    padding: 0 3px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.6rem;
    font-weight: 800;
  }
</style>
