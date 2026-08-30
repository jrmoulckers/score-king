<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { bumpOnChange } from '../../motion';
  import { haptic } from '../../haptics';
  import { azul } from './index';
  import {
    MAX_FLOOR_TILES,
    MAX_LINES,
    bonusTotal,
    emptyBonus,
    emptyEntry,
    entryDelta,
    floorPenalty,
    roundTotal,
    type AzulBonus,
    type AzulEntry,
    type AzulInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: AzulInput; ctx: RoundContext } = $props();

  const entryFor = (id: string): AzulEntry => {
    if (!input.entries[id]) input.entries[id] = emptyEntry();
    return input.entries[id];
  };
  const bonusFor = (id: string): AzulBonus => {
    if (!input.bonuses[id]) input.bonuses[id] = emptyBonus();
    return input.bonuses[id];
  };

  const previews = $derived(
    Object.fromEntries(ctx.players.map((p) => [p.id, roundTotal(input, p.id)])),
  );
  const projected = $derived(
    Object.fromEntries(
      ctx.players.map((p) => [
        p.id,
        Math.max(0, (ctx.totals[p.id] ?? 0) + (previews[p.id] ?? 0)),
      ]),
    ),
  );

  let showHelp = $state(false);

  function toggleFinal() {
    input.final = !input.final;
    haptic('tick');
  }

  const dirty = $derived(
    input.final ||
      ctx.players.some((p) => {
        const e = input.entries[p.id];
        return !!e && (e.scored > 0 || e.floorTiles > 0);
      }),
  );

  function clearRound() {
    for (const p of ctx.players) {
      input.entries[p.id] = emptyEntry();
      input.bonuses[p.id] = emptyBonus();
    }
    input.final = false;
    haptic('undo');
  }

  const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');
</script>

<div class="stack">
  <section class="head-card">
    <div class="row spread wrap head">
      <h3 class="ttl">🧱 Round {ctx.roundIndex + 1}</h3>
      <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
        How to score
      </button>
    </div>

    <button type="button" class="final-toggle" class:on={input.final} onclick={toggleFinal}>
      <span class="fmark" aria-hidden="true">{input.final ? '✓' : '🏁'}</span>
      <span class="ftext">
        <strong>Final round</strong>
        <span class="fsub">Someone completed a horizontal row — count end-game bonuses below</span
        >
      </span>
    </button>

    {#if showHelp}
      <pre class="help">{azul.help}</pre>
    {/if}
  </section>

  {#each ctx.players as p (p.id)}
    {@const entry = entryFor(p.id)}
    {@const bonus = bonusFor(p.id)}
    {@const wall = entryDelta(entry)}
    <section class="prow">
      <div class="phead row spread wrap">
        <span class="who row" style="gap: 8px; align-items: center">
          <Avatar name={p.name} color={p.color} />
          <strong class="pname">{p.name}</strong>
        </span>
        <span class="proj" use:bumpOnChange={previews[p.id]}
          >{signed(previews[p.id] ?? 0)}</span
        >
      </div>

      <div class="pile">
        <div class="prow2 row spread wrap">
          <span class="plabel">🧩 Wall points scored</span>
          <Stepper bind:value={entry.scored} min={0} max={40} label={`${p.name} wall points`} />
        </div>
        <div class="prow2 row spread wrap">
          <span class="plabel">🕳️ Floor tiles</span>
          <Stepper
            bind:value={entry.floorTiles}
            min={0}
            max={MAX_FLOOR_TILES}
            label={`${p.name} floor tiles`}
          />
        </div>
        <p class="tally">
          {entry.scored} scored − {floorPenalty(entry.floorTiles)} floor —
          <strong>{signed(wall)}</strong>
        </p>
      </div>

      {#if input.final}
        <div class="pile bonus">
          <div class="prow2 row spread wrap">
            <span class="plabel">🏆 End-game bonus</span>
            <span class="ptotal">+{bonusTotal(bonus)}</span>
          </div>
          <div class="counts">
            <label class="f">
              <span class="flabel">Complete rows <span class="fhint">×2</span></span>
              <Stepper
                bind:value={bonus.rows}
                min={0}
                max={MAX_LINES}
                label={`${p.name} complete rows`}
              />
            </label>
            <label class="f">
              <span class="flabel">Complete columns <span class="fhint">×7</span></span>
              <Stepper
                bind:value={bonus.columns}
                min={0}
                max={MAX_LINES}
                label={`${p.name} complete columns`}
              />
            </label>
            <label class="f">
              <span class="flabel">Complete colors <span class="fhint">×10</span></span>
              <Stepper
                bind:value={bonus.colors}
                min={0}
                max={MAX_LINES}
                label={`${p.name} complete colors`}
              />
            </label>
          </div>
        </div>
      {/if}

      <p class="ptotal2">
        Projected total: <strong use:bumpOnChange={projected[p.id]}>{projected[p.id] ?? 0}</strong>
      </p>
    </section>
  {/each}

  {#if dirty}
    <div class="row foot">
      <button type="button" class="btn small ghost" onclick={clearRound}>Clear this round</button>
    </div>
  {/if}
</div>

<style>
  .head-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    align-items: center;
  }
  .ttl {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }
  /* Marking the final round is a selection, not the primary action — filled,
     bordered state with an explicit checkmark, never colour alone. */
  .final-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 8px 12px;
    text-align: left;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  .final-toggle.on {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, var(--surface));
  }
  .final-toggle:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .fmark {
    font-size: 1.25rem;
    line-height: 1;
  }
  .ftext {
    display: flex;
    flex-direction: column;
  }
  .fsub {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .phead {
    align-items: center;
  }
  .pname {
    font-weight: 700;
  }
  .proj {
    font-weight: 800;
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .pile {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pile.bonus {
    border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
  }
  .prow2 {
    align-items: center;
  }
  .plabel {
    font-weight: 700;
  }
  .ptotal {
    font-weight: 800;
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
  }
  .counts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .flabel {
    font-size: 0.9rem;
    color: var(--muted);
  }
  .fhint {
    font-size: 0.8rem;
  }
  .tally {
    margin: 0;
    font-size: 0.9rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .tally strong {
    color: var(--text);
  }
  .ptotal2 {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .ptotal2 strong {
    color: var(--text);
  }
  .foot {
    justify-content: flex-end;
  }
  .help {
    white-space: pre-wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
    font-size: 0.9rem;
    margin: 0;
    font-family: inherit;
    color: var(--muted);
  }
</style>
