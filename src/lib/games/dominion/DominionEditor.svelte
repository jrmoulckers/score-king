<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { leaders } from '../../scoring';
  import { bumpOnChange, popIn } from '../../motion';
  import {
    DOMINION_HELP,
    emptyRow,
    gardensValue,
    scoreRow,
    type DominionInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: DominionInput; ctx: RoundContext } = $props();

  // Guarantee every seated player has a row, even one added after the sheet was created.
  $effect(() => {
    for (const p of ctx.players) {
      if (!input.values[p.id]) input.values[p.id] = emptyRow();
    }
  });

  let showHelp = $state(false);

  function total(id: string): number {
    return scoreRow(input.values[id]);
  }

  // Live totals + the app's shared "who's pulled ahead" rule, so the grandest estate wears
  // the crown (and only the crown's Gold) — nobody is crowned at an all-tied-at-zero table.
  const totals = $derived(Object.fromEntries(ctx.players.map((p) => [p.id, total(p.id)])));
  const leaderSet = $derived(
    leaders(
      totals,
      ctx.players.map((p) => p.id),
    ),
  );
</script>

<div class="stack">
  <div class="row spread">
    <span class="pill">🏰 Count your deck at game end</span>
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
    <pre class="help">{DOMINION_HELP}</pre>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const row = input.values[p.id]}
    {#if row}
      {@const isLeader = leaderSet.has(p.id)}
      {@const gValue = gardensValue(row.deckSize)}
      <div class="prow" class:leader={isLeader}>
        <div class="row spread phead">
          <span class="who">
            <Avatar name={p.name} color={p.color} />
            <strong>{p.name}</strong>
            {#if isLeader}
              <span class="crown" title="Grandest estate" aria-hidden="true" use:popIn>👑</span>
              <span class="sr-only">Grandest estate</span>
            {/if}
          </span>
          <span class="total" class:lead={isLeader}>
            <span class="totnum" use:bumpOnChange={total(p.id)}>{total(p.id)}</span><span
              class="unit">VP</span
            >
          </span>
        </div>

        <div class="grid">
          <div class="f">
            <span class="flabel"><span aria-hidden="true">🟩</span> Estates <span class="mult"
                >×1</span
              ></span
            >
            <Stepper bind:value={row.estates} min={0} label={`${p.name} Estates`} />
          </div>
          <div class="f">
            <span class="flabel"><span aria-hidden="true">🏠</span> Duchies <span class="mult"
                >×3</span
              ></span
            >
            <Stepper bind:value={row.duchies} min={0} label={`${p.name} Duchies`} />
          </div>
          <div class="f">
            <span class="flabel"><span aria-hidden="true">⭐</span> Provinces <span class="mult"
                >×6</span
              ></span
            >
            <Stepper bind:value={row.provinces} min={0} label={`${p.name} Provinces`} />
          </div>
          <div class="f">
            <span class="flabel"><span aria-hidden="true">💀</span> Curses <span class="mult"
                >×-1</span
              ></span
            >
            <Stepper bind:value={row.curses} min={0} label={`${p.name} Curses`} />
          </div>
        </div>

        <div class="gardens">
          <span class="glabel"><span aria-hidden="true">🌿</span> Gardens</span>
          <div class="gfields">
            <label class="gfield">
              <span class="gcap">Gardens owned</span>
              <Stepper bind:value={row.gardens} min={0} label={`${p.name} Gardens owned`} />
            </label>
            <label class="gfield">
              <span class="gcap">Deck size</span>
              <input
                class="pts sm"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                aria-label={`${p.name} deck size`}
                bind:value={row.deckSize}
              />
            </label>
            <span class="gsub">= {gValue} VP each</span>
          </div>
        </div>

        <div class="grid">
          <div class="f">
            <span class="flabel">Other VP</span>
            <input
              class="pts"
              type="number"
              step="1"
              inputmode="numeric"
              aria-label={`${p.name} Other VP`}
              bind:value={row.otherVP}
            />
          </div>
          <div class="f">
            <span class="flabel">Turns taken <span class="opt">(tie-break)</span></span>
            <input
              class="pts"
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              aria-label={`${p.name} turns taken`}
              bind:value={row.turns}
            />
          </div>
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
  /* The grandest estate: a restrained Crown-Gold ring around the leader's card — the crown
     and gold total already carry the meaning, so the ring stays a whisper, never a gold block. */
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

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
  }
  .f {
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
  .opt {
    font-weight: 400;
    font-style: italic;
  }
  .pts {
    width: 88px;
    height: 46px;
    text-align: center;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .pts.sm {
    width: 66px;
    height: 40px;
  }

  /* Gardens — a small self-contained panel since its VP depends on deck size, unlike every
     other category which is a flat multiplier. Collapsed into one quiet strip with a subtotal
     so it reads as a single idea instead of two near-identical fields. */
  .gardens {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .glabel {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--muted);
  }
  .gfields {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .gfield {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .gcap {
    white-space: nowrap;
  }
  .gsub {
    margin-left: auto;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
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
