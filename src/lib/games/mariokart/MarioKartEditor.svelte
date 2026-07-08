<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { ordinal } from '../../stats/format';
  import {
    pointsForPosition,
    normalizeRacers,
    normalizeTable,
    tableMeta,
    type MarioKartInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: MarioKartInput; ctx: RoundContext } = $props();

  const table = $derived(normalizeTable(ctx.config.pointsTable));
  const racers = $derived(normalizeRacers(ctx.config.racers));
  const meta = $derived(tableMeta(table));

  let showPoints = $state(false);

  function pos(id: string): number {
    return Math.floor(Number(input.positions[id]) || 0);
  }
  function pts(id: string): number {
    return pointsForPosition(table, pos(id), racers);
  }

  // Two racers can't share a spot — flag any clash so it's fixable at a glance.
  const clashes = $derived.by(() => {
    const seen = new Map<number, number>();
    for (const p of ctx.players) {
      const v = pos(p.id);
      if (v > 0) seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    return seen;
  });
  function isClash(id: string): boolean {
    const v = pos(id);
    return v > 0 && (clashes.get(v) ?? 0) > 1;
  }

  function medal(p: number): string {
    return p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : '';
  }
  function rankLabel(p: number): string {
    return p >= 1 ? ordinal(p) : '—';
  }

  // Active table payout, for the "Points" reference: 1st → field-back.
  const payout = $derived.by(() => {
    const depth = table === 'party' ? racers : Math.min(racers, 24);
    const rows: { pos: number; pts: number }[] = [];
    for (let i = 1; i <= depth; i++) {
      const value = pointsForPosition(table, i, racers);
      if (table !== 'party' && value === 0) break;
      rows.push({ pos: i, pts: value });
    }
    return rows;
  });
</script>

<div class="stack">
  <div class="row spread">
    <span class="pill">{meta.emoji} {meta.label}</span>
    <button type="button" class="btn small ghost" onclick={() => (showPoints = !showPoints)}>
      {showPoints ? 'Hide points' : 'Points'}
    </button>
  </div>

  {#if showPoints}
    <div class="points" role="note">
      <p class="blurb">{meta.blurb}</p>
      <div class="chips">
        {#each payout as row (row.pos)}
          <span class="chip">
            <span class="p">{medal(row.pos)}{ordinal(row.pos)}</span>
            <span class="v tnum">{row.pts}</span>
          </span>
        {/each}
      </div>
    </div>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const finish = pos(p.id)}
    {@const clash = isClash(p.id)}
    <div class="prow" class:clash>
      <div class="row spread head">
        <span class="who">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        <span class="pts tnum" class:score-good={pts(p.id) > 0} class:zero={pts(p.id) === 0}>
          {pts(p.id) > 0 ? '+' : ''}{pts(p.id)}
        </span>
      </div>
      <div class="entry">
        <span class="rank tnum" aria-label={`Finished ${rankLabel(finish)}`}>
          {#if medal(finish)}<span class="badge" aria-hidden="true">{medal(finish)}</span>{/if}
          {rankLabel(finish)}
        </span>
        <Stepper bind:value={input.positions[p.id]} min={1} max={racers} />
        {#if clash}
          <span class="clash-tag" role="status">⚠ ties {ordinal(finish)}</span>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
  }
  .prow.clash {
    border-color: color-mix(in srgb, var(--bad) 60%, var(--border));
  }
  .head {
    margin-bottom: 10px;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .who strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pts {
    font-weight: 800;
    font-size: 1.05rem;
  }
  .pts.zero {
    color: var(--muted);
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .rank {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 52px;
    font-weight: 700;
    color: var(--text);
  }
  .badge {
    font-size: 1.1rem;
  }
  .clash-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--bad);
  }
  .points {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
  }
  .blurb {
    margin: 0 0 10px;
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.45;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 9px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    font-size: 0.82rem;
  }
  .chip .v {
    font-weight: 800;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
</style>
