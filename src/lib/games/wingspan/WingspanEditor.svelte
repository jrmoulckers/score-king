<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import FlockGauge from './FlockGauge.svelte';
  import { leaders } from '../../scoring';
  import { bumpOnChange, popIn, animateMotion } from '../../motion';
  import {
    LEFTOVER_CATEGORY,
    emptyRow,
    scoreRow,
    scoringCategories,
    tracksFood,
    type WingspanRow,
    type WingspanInput,
  } from './logic';
  import { wingspan } from './index';

  let { input = $bindable(), ctx }: { input: WingspanInput; ctx: RoundContext } = $props();

  const cats = $derived(scoringCategories(ctx.config));
  // The big point totals get a fast numeric field; the +1 token tallies keep the Stepper nudge.
  const pointCats = $derived(cats.filter((c) => c.entry === 'points'));
  const countCats = $derived(cats.filter((c) => c.entry === 'count'));
  const showFood = $derived(tracksFood(ctx.config));
  let showHelp = $state(false);

  // Keep the draft's shape in sync with the current players and config, so every field always
  // has a real number to bind to — even if a player joined, or Nectar toggled on, after this
  // scoresheet draft was first created. Mirrors the custom-game editor's self-healing draft.
  $effect(() => {
    if (!input.rows) input.rows = {};
    const base = emptyRow();
    for (const p of ctx.players) {
      let row = input.rows[p.id];
      if (!row) {
        input.rows[p.id] = emptyRow();
        continue;
      }
      for (const k of Object.keys(base) as (keyof WingspanRow)[]) {
        if (typeof row[k] !== 'number') row[k] = base[k];
      }
    }
  });

  function total(id: string): number {
    return scoreRow(input.rows?.[id]);
  }

  // Live totals + the app's shared "who's pulled ahead" rule, so the biggest flock wears the
  // crown (and only the crown's Gold) — and nobody is crowned at an all-tied-at-zero table.
  const totals = $derived(Object.fromEntries(ctx.players.map((p) => [p.id, total(p.id)])));
  const leaderSet = $derived(leaders(totals, ctx.players.map((p) => p.id)));
  // A genuine dead heat: two or more players share the lead. Time to settle it with food.
  const deadHeat = $derived(leaderSet.size > 1);

  /**
   * A one-shot "🥚→🐣 hatch!" bubble that floats up when a player's egg count ticks up — the
   * flock's most satisfying tally. Motion-only decoration, so under reduced motion
   * {@link animateMotion} resolves instantly and the bubble is removed with no movement.
   */
  function eggHatch(node: HTMLElement, value: number | undefined) {
    let prev = Number(value) || 0;
    return {
      update(next: number | undefined) {
        const v = Number(next) || 0;
        if (v > prev) {
          const b = document.createElement('span');
          b.className = 'burst';
          b.textContent = '🥚→🐣';
          b.setAttribute('aria-hidden', 'true');
          node.appendChild(b);
          animateMotion(
            b,
            { opacity: [0, 1, 0], transform: ['translateY(2px)', 'translateY(-14px)', 'translateY(-28px)'] },
            { duration: 0.7, ease: 'easeOut' },
          ).finished.finally(() => b.remove());
        }
        prev = v;
      },
    };
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="pill">Tally the flock · game end 🪶</span>
    <button
      type="button"
      class="btn small ghost"
      onclick={() => (showHelp = !showHelp)}
      aria-expanded={showHelp}
    >
      Scoring
    </button>
  </div>

  {#if showHelp}
    <pre class="help">{wingspan.help}</pre>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const row = input.rows?.[p.id]}
    {#if row}
      {@const isLeader = leaderSet.has(p.id)}
      <div class="prow" class:leader={isLeader}>
        <div class="row spread phead">
          <span class="who">
            <Avatar name={p.name} color={p.color} />
            <strong>{p.name}</strong>
            {#if isLeader}
              <span class="crown" title="In the lead" aria-hidden="true" use:popIn>👑</span>
              <span class="sr-only">In the lead</span>
            {/if}
          </span>
          <span class="total" class:lead={isLeader}>
            <span class="totnum" use:bumpOnChange={total(p.id)}>{total(p.id)}</span><span class="totlbl"
              >pts</span
            >
          </span>
        </div>

        <FlockGauge total={total(p.id)} />

        <div class="grid">
          {#each pointCats as c (c.key)}
            <label class="cell">
              <span class="clabel"><span class="cemoji" aria-hidden="true">{c.emoji}</span>{c.short}</span>
              <input
                class="pts"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                aria-label={`${p.name} ${c.label}`}
                bind:value={row[c.key]}
              />
            </label>
          {/each}
        </div>

        <div class="grid tokens">
          {#each countCats as c (c.key)}
            <div class="cell" use:eggHatch={c.key === 'eggs' ? row.eggs : undefined}>
              <span class="clabel"><span class="cemoji" aria-hidden="true">{c.emoji}</span>{c.short}</span>
              <Stepper bind:value={row[c.key]} min={0} max={999} label={`${p.name} ${c.label}`} />
            </div>
          {/each}
        </div>

        {#if showFood}
          <div class="tiebreak" class:heat={deadHeat && isLeader}>
            <div class="cell">
              <span class="clabel">
                <span class="cemoji" aria-hidden="true">{LEFTOVER_CATEGORY.emoji}</span>{LEFTOVER_CATEGORY.label}
              </span>
              <Stepper bind:value={row.leftover} min={0} max={999} label={`${p.name} ${LEFTOVER_CATEGORY.label}`} />
            </div>
            <span class="tienote">
              {#if deadHeat && isLeader}
                🍽️ Dead heat — most unused food wins
              {:else}
                Breaks ties · not scored
              {/if}
            </span>
          </div>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  /* The leading flock: a restrained Crown-Gold ring around the leader's card — the crown and
     gold total already carry the meaning, so the ring stays a whisper, never a gold block. */
  .prow.leader {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    background: color-mix(in srgb, var(--accent) 6%, var(--surface-2));
  }
  .phead {
    margin: 0;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .who strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .crown {
    flex: none;
    font-size: 1rem;
    line-height: 1;
  }
  .total {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    flex: none;
    font-weight: 800;
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .totnum {
    font-variant-numeric: tabular-nums;
  }
  /* Gold reserved for the leader/winner number, per the Crown-Gold rule. */
  .total.lead {
    color: var(--accent-ink);
  }
  .totlbl {
    font-size: 0.75rem;
    color: var(--muted);
    font-weight: 600;
  }
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 18px;
  }
  /* The +1 token tallies sit a touch quieter than the big point fields above them. */
  .grid.tokens {
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .clabel {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
  }
  .cemoji {
    font-size: 0.95rem;
  }
  .pts {
    width: 88px;
    height: 46px;
    text-align: center;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  /* The floating "🥚→🐣 hatch" beat. Positioned over its cell; pointer-inert so it never blocks
     the next tap. Motion-only — animateMotion drops it instantly under reduced motion. */
  .cell :global(.burst) {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--good);
    pointer-events: none;
    white-space: nowrap;
  }
  .tiebreak {
    display: flex;
    align-items: flex-end;
    gap: 14px;
    padding-top: 12px;
    border-top: 1px dashed var(--border);
  }
  .tienote {
    font-size: 0.75rem;
    color: var(--muted);
    padding-bottom: 12px;
  }
  /* When the leaders are actually tied, the food column becomes the decider — call it out in
     words + emoji (never colour alone) on the tied leaders' cards. */
  .tiebreak.heat .tienote {
    color: var(--text);
    font-weight: 700;
  }
  .help {
    white-space: pre-wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
    font-size: 0.85rem;
    margin: 0;
    font-family: inherit;
    color: var(--muted);
    line-height: 1.5;
  }
</style>
