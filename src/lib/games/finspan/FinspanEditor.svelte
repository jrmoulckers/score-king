<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import OceanGauge from './OceanGauge.svelte';
  import { leaders } from '../../scoring';
  import { bumpOnChange, popIn, animateMotion } from '../../motion';
  import {
    FINSPAN_CATEGORIES,
    FINSPAN_HELP,
    categoryPoints,
    emptyRow,
    scoreRow,
    weeklyTotal,
    type FinspanInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: FinspanInput; ctx: RoundContext } = $props();

  // Guarantee every seated player has a row, even one added after the sheet was created.
  $effect(() => {
    for (const p of ctx.players) {
      if (!input.values[p.id]) input.values[p.id] = emptyRow();
    }
  });

  let showHelp = $state(false);

  // The three weekly achievements collapse into one trio; the rest are cards in your ocean.
  const weekly = FINSPAN_CATEGORIES.filter((c) => c.group === 'weekly');
  const ocean = FINSPAN_CATEGORIES.filter((c) => c.group === 'ocean');

  function total(id: string): number {
    return scoreRow(input.values[id]);
  }

  // Live totals + the app's shared "who's pulled ahead" rule, so the biggest catch wears the
  // crown (and only the crown's Gold) — and nobody is crowned at an all-tied-at-zero table.
  const totals = $derived(Object.fromEntries(ctx.players.map((p) => [p.id, total(p.id)])));
  const leaderSet = $derived(leaders(totals, ctx.players.map((p) => p.id)));

  /**
   * A one-shot "＋6 🐠 school forms!" bubble that floats up when a schools count ticks up — the
   * game's most satisfying tally (three young shoal into a school worth six). Motion-only
   * decoration, so under reduced motion {@link animateMotion} resolves instantly and the bubble
   * is removed with no movement.
   */
  function schoolBurst(node: HTMLElement, value: number | undefined) {
    let prev = Number(value) || 0;
    return {
      update(next: number | undefined) {
        const v = Number(next) || 0;
        if (v > prev) {
          const b = document.createElement('span');
          b.className = 'burst';
          b.textContent = '＋6 🐠';
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
    <span class="pill">🌊 Your ocean · after week 4</span>
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
    <pre class="help">{FINSPAN_HELP}</pre>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const row = input.values[p.id]}
    {#if row}
      {@const isLeader = leaderSet.has(p.id)}
      <div class="prow" class:leader={isLeader}>
        <div class="row spread phead">
          <span class="who">
            <Avatar name={p.name} color={p.color} />
            <strong>{p.name}</strong>
            {#if isLeader}
              <span class="crown" title="Biggest catch" aria-hidden="true" use:popIn>👑</span>
              <span class="sr-only">Biggest catch</span>
            {/if}
          </span>
          <span class="total" class:lead={isLeader}>
            <span class="totnum" use:bumpOnChange={total(p.id)}>{total(p.id)}</span><span class="unit"
              >pts</span
            >
          </span>
        </div>

        <OceanGauge total={total(p.id)} />

        <div class="weekly">
          <span class="wlabel"><span aria-hidden="true">🏅</span> Weekly achievements</span>
          <div class="weeks">
            {#each weekly as c (c.key)}
              <label class="wk">
                <span class="wkcap">{c.label.replace('Week ', 'Wk ')}</span>
                <input
                  class="pts sm"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  aria-label={`${p.name} ${c.label}`}
                  bind:value={row[c.key]}
                />
              </label>
            {/each}
            <span class="wsub">= {weeklyTotal(row)}</span>
          </div>
        </div>

        <div class="grid">
          {#each ocean as c (c.key)}
            <div
              class="f"
              class:pcell={c.entry === 'points'}
              use:schoolBurst={c.key === 'schools' ? row.schools : undefined}
            >
              <span class="flabel">
                <span aria-hidden="true">{c.emoji}</span>
                {c.label}{#if c.per !== 1}<span class="mult">×{c.per}</span>{/if}
              </span>
              {#if c.entry === 'count'}
                <Stepper bind:value={row[c.key]} min={0} label={`${p.name} ${c.label}`} />
              {:else}
                <input
                  class="pts"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  aria-label={`${p.name} ${c.label}`}
                  bind:value={row[c.key]}
                />
              {/if}
              {#if c.per !== 1}
                <span class="contrib">= {categoryPoints(c, row[c.key])} pts</span>
              {/if}
            </div>
          {/each}
        </div>
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
  /* The biggest catch: a restrained Crown-Gold ring around the leader's card — the crown and
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
  /* Gold reserved for the leader/winner number, per the Crown-Gold rule. */
  .total.lead {
    color: var(--accent-ink);
  }
  .unit {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--muted);
  }

  /* Weekly achievements — the three banked weeks, collapsed into one quiet trio with a subtotal
     so they read as a single idea instead of three near-identical columns. */
  .weekly {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .wlabel {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--muted);
  }
  .weeks {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .wk {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .wkcap {
    white-space: nowrap;
  }
  .wsub {
    margin-left: auto;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
  }
  .f {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .flabel {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .mult {
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .pts {
    width: 88px;
    height: 46px;
    text-align: center;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .pts.sm {
    width: 58px;
    height: 40px;
  }
  .contrib {
    font-size: 0.72rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  /* The floating "＋6 🐠" school-forms beat. Positioned over its cell; pointer-inert so it never
     blocks the next tap. Motion-only — animateMotion drops it instantly under reduced motion. */
  .f :global(.burst) {
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
