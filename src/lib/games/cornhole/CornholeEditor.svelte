<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import {
    BAGS_PER_SIDE,
    IN_HOLE_POINTS,
    ON_BOARD_POINTS,
    readConfig,
    scoreCornhole,
    sideRaw,
    type CornholeInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: CornholeInput; ctx: RoundContext } = $props();

  const n = $derived(ctx.roundIndex + 1);
  const cfg = $derived(readConfig(ctx.config));
  const sideNoun = $derived(cfg.format === '2v2' ? 'Team' : 'Side');
  const ids = $derived(ctx.players.map((p) => p.id) as [string, string]);
  const outcome = $derived(scoreCornhole([ids[0], ids[1]], input, ctx.totals, cfg));
  const gainer = $derived(ctx.players.find((p) => p.id === outcome.gainerId) ?? null);

  function bag(id: string): { inHole: number; onBoard: number } {
    return input.sides[id] ?? { inHole: 0, onBoard: 0 };
  }
  function used(id: string): number {
    const t = bag(id);
    return (Number(t.inHole) || 0) + (Number(t.onBoard) || 0);
  }
  function left(id: string): number {
    return Math.max(0, BAGS_PER_SIDE - used(id));
  }
  function raw(id: string): number {
    return sideRaw(bag(id));
  }
  function totalBefore(id: string): number {
    return Number(ctx.totals[id]) || 0;
  }
  function projected(id: string): number {
    return totalBefore(id) + (outcome.deltas[id] ?? 0);
  }
</script>

<div class="stack">
  <div class="row spread head">
    <span class="row" style="gap: 8px">
      <span class="pill">Round {n}</span>
      <span class="pill">to {cfg.target}{cfg.winBy > 1 ? ` · by ${cfg.winBy}` : ''}</span>
    </span>
    {#if gainer}
      <span class="row result" style="gap: 8px">
        <span class="score-good net">🌽 {gainer.name} +{outcome.net}</span>
        {#if outcome.busted}<span class="pill bust">💥 Bust → 15</span>{/if}
      </span>
    {:else}
      <span class="muted result">🌽 Wash — no one scores</span>
    {/if}
  </div>

  {#each ctx.players as p, i (p.id)}
    {#if i === 1}<div class="vs" aria-hidden="true">vs</div>{/if}
    <div class="side" class:scoring={outcome.gainerId === p.id}>
      <div class="row spread" style="margin-bottom: 12px">
        <span class="row who" style="gap: 8px">
          <Avatar name={p.name} color={p.color} />
          <span class="name">
            <span class="overline">{sideNoun} {i === 0 ? 'A' : 'B'}</span>
            <strong>{p.name}</strong>
          </span>
        </span>
        <span class="tally">
          <span class="cur">{totalBefore(p.id)}</span>
          <span class="arrow" aria-hidden="true">→</span>
          <span
            class="proj"
            class:score-good={projected(p.id) > totalBefore(p.id)}
            class:score-bad={projected(p.id) < totalBefore(p.id)}
          >{projected(p.id)}{#if outcome.busted && outcome.gainerId === p.id}<span class="burst" aria-hidden="true"> 💥</span>{/if}</span>
        </span>
      </div>

      <div class="fields">
        <label class="f">
          <span class="flabel">In the hole <span class="x">×{IN_HOLE_POINTS}</span></span>
          <Stepper bind:value={input.sides[p.id].inHole} min={0} max={BAGS_PER_SIDE - (Number(bag(p.id).onBoard) || 0)} />
        </label>
        <label class="f">
          <span class="flabel">On the board <span class="x">×{ON_BOARD_POINTS}</span></span>
          <Stepper bind:value={input.sides[p.id].onBoard} min={0} max={BAGS_PER_SIDE - (Number(bag(p.id).inHole) || 0)} />
        </label>
      </div>

      <div class="row spread meta">
        <span class="pts">🌽 {raw(p.id)} pts this round</span>
        <span class="left" class:score-bad={used(p.id) > BAGS_PER_SIDE}>
          {left(p.id)} {left(p.id) === 1 ? 'bag' : 'bags'} left
        </span>
      </div>
    </div>
  {/each}
</div>

<style>
  .head {
    flex-wrap: wrap;
    gap: 8px;
  }
  .result {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .net {
    font-weight: 800;
  }
  .bust {
    color: var(--bad);
    border-color: color-mix(in srgb, var(--bad) 55%, var(--border));
  }
  .side {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
  }
  /* The side that would score this round lifts one step up the surface ramp — depth, not a stripe. */
  .side.scoring {
    background: var(--surface-3);
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
  }
  .name {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .overline {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .tally {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .tally .cur {
    color: var(--muted);
  }
  .tally .arrow {
    color: var(--muted);
  }
  .tally .proj {
    font-weight: 800;
    font-size: 1.15rem;
  }
  .fields {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .flabel {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .flabel .x {
    font-weight: 700;
    color: var(--text);
  }
  .meta {
    margin-top: 12px;
    font-size: 0.82rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .vs {
    align-self: center;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin: -4px 0;
  }
</style>
