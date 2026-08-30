<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { bumpOnChange } from '../../motion';
  import { haptic } from '../../haptics';
  import { catan } from './index';
  import {
    AWARD_POINTS,
    MAX_CITIES,
    MAX_DEV_VP,
    MAX_SETTLEMENTS,
    readConfig,
    vpFor,
    type CatanInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: CatanInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));

  function before(id: string): number {
    return Number(ctx.totals[id]) || 0;
  }
  function projected(id: string): number {
    return vpFor(input, id);
  }
  function delta(id: string): number {
    return projected(id) - before(id);
  }
  function signed(n: number): string {
    return n > 0 ? `+${n}` : `${n}`;
  }
  function reached(id: string): boolean {
    return projected(id) >= cfg.targetVP;
  }

  function setAward(kind: 'longestRoad' | 'largestArmy', id: string) {
    input[kind] = input[kind] === id ? null : id;
    haptic('tick');
  }

  let showHelp = $state(false);
</script>

<div class="stack">
  <div class="row spread wrap head">
    <span class="pill">🎯 First to {cfg.targetVP} VP</span>
    <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
      How VP work
    </button>
  </div>

  {#if showHelp}
    <pre class="help">{catan.help}</pre>
  {/if}

  {#snippet awardPicker(
    kind: 'longestRoad' | 'largestArmy',
    title: string,
    emoji: string,
    hint: string,
  )}
    <section class="award">
      <div class="row spread wrap">
        <h3 class="ttl">{emoji} {title}</h3>
        <span class="pts">+{AWARD_POINTS} VP</span>
      </div>
      <p class="hint">{hint}</p>
      <div class="chips" role="radiogroup" aria-label={title}>
        {#each ctx.players as p (p.id)}
          {@const on = input[kind] === p.id}
          <button
            type="button"
            role="radio"
            aria-checked={on}
            class="chip"
            class:on
            onclick={() => setAward(kind, p.id)}
          >
            <Avatar name={p.name} color={p.color} size={22} />
            <span class="cname">{p.name}</span>
          </button>
        {/each}
      </div>
    </section>
  {/snippet}

  {@render awardPicker(
    'longestRoad',
    'Longest Road',
    '🛣️',
    'Whoever holds the longest continuous road (5+ segments). Tap a chip again to clear it.',
  )}
  {@render awardPicker(
    'largestArmy',
    'Largest Army',
    '⚔️',
    'Whoever has played the most Knight cards (3+ minimum). Tap a chip again to clear it.',
  )}

  <section class="board">
    <h3 class="ttl">🏠🏰 Settlements & cities</h3>
    {#each ctx.players as p (p.id)}
      <div class="prow" class:won={reached(p.id)}>
        <div class="row spread top">
          <span class="row who">
            <Avatar name={p.name} color={p.color} />
            <strong class="ellipsis">{p.name}</strong>
          </span>
          <span class="tally">
            <span class="cur">{before(p.id)}</span>
            <span class="arrow" aria-hidden="true">→</span>
            <span class="proj" use:bumpOnChange={projected(p.id)}>{projected(p.id)}</span>
            {#if delta(p.id) !== 0}
              <span class="dchip" class:good={delta(p.id) > 0} class:bad={delta(p.id) < 0}>
                {signed(delta(p.id))}
              </span>
            {/if}
            {#if reached(p.id)}
              <span class="crown" aria-hidden="true">👑</span>
            {/if}
          </span>
        </div>

        <div class="fields">
          <label class="f">
            <span class="flabel">🏠 Settlements</span>
            <Stepper
              bind:value={input.settlements[p.id]}
              min={0}
              max={MAX_SETTLEMENTS}
              label={`${p.name} settlements`}
            />
          </label>
          <label class="f">
            <span class="flabel">🏰 Cities</span>
            <Stepper
              bind:value={input.cities[p.id]}
              min={0}
              max={MAX_CITIES}
              label={`${p.name} cities`}
            />
          </label>
          <label class="f">
            <span class="flabel">🃏 VP cards</span>
            <Stepper
              bind:value={input.devVP[p.id]}
              min={0}
              max={MAX_DEV_VP}
              label={`${p.name} victory point cards`}
            />
          </label>
        </div>
        {#if reached(p.id)}
          <p class="win-note">👑 {p.name} has reached {cfg.targetVP} VP — the game ends here.</p>
        {/if}
      </div>
    {/each}
  </section>
</div>

<style>
  .head {
    align-items: center;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    font-size: 0.85rem;
    font-weight: 700;
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
  .award,
  .board {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ttl {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }
  .pts {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--dur-base) var(--ease-standard);
  }
  .chip:hover {
    background: var(--surface-3);
  }
  /* A claimed award reads as a selection, not the screen's primary action: a
     filled/bordered state plus the explicit "holds it" glyph, never colour alone. */
  .chip.on {
    background: var(--surface-3);
    border-color: var(--primary);
    box-shadow: inset 3px 0 0 var(--primary);
  }
  .chip:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .cname {
    white-space: nowrap;
  }
  .prow {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  /* The winning seat is framed in Crown Gold — the one moment gold marks a
     player rather than a plain leader tint. */
  .prow.won {
    border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .who {
    gap: 8px;
    align-items: center;
    min-width: 0;
  }
  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tally {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    flex: none;
  }
  .tally .cur,
  .tally .arrow {
    color: var(--muted);
  }
  .tally .proj {
    font-weight: 800;
    font-size: 1.2rem;
  }
  .dchip {
    font-size: 0.78rem;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--muted);
  }
  .dchip.good {
    color: var(--good);
    background: color-mix(in srgb, var(--good) 18%, var(--surface-3));
  }
  .dchip.bad {
    color: var(--bad);
    background: color-mix(in srgb, var(--bad) 18%, var(--surface-3));
  }
  .crown {
    font-size: 1.1rem;
    line-height: 1;
  }
  .fields {
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
  .win-note {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--accent-ink);
  }
</style>
