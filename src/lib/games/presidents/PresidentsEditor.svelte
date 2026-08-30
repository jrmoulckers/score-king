<script lang="ts">
  import { flip } from 'svelte/animate';
  import { SvelteMap } from 'svelte/reactivity';
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { prefersReducedMotion } from '../../motion';
  import { haptic } from '../../haptics';
  import {
    SCHEME_META,
    normalizeScheme,
    pointsForPosition,
    roundComplete,
    titleFor,
    type PresidentsInput,
  } from './logic';
  import { presidents } from './index';

  let { input = $bindable(), ctx }: { input: PresidentsInput; ctx: RoundContext } = $props();

  const scheme = $derived(normalizeScheme(ctx.config.scheme));
  const meta = $derived(SCHEME_META[scheme]);
  const n = $derived(ctx.players.length);

  // Motion preference is read once (matches the rest of the app) so the
  // ranking reorder gets a calm, instant alternative.
  const reduced = prefersReducedMotion();
  const flipDur = $derived(reduced ? 0 : 220);

  let showHelp = $state(false);
  let showPoints = $state(false);

  function pos(id: string): number {
    return Math.floor(Number(input.positions[id]) || 0);
  }
  function pts(id: string): number {
    return pointsForPosition(scheme, pos(id), n);
  }

  // Ranking rows always read top→bottom as the current finishing order: the
  // President on top, unranked players sink to the back. Steps are ±1 so a
  // change is a gentle neighbour swap, animated via flip (snap under reduced
  // motion).
  const sortedPlayers = $derived.by(() => {
    const order = new Map(ctx.players.map((p, i) => [p.id, i]));
    return [...ctx.players].sort((a, b) => {
      const pa = pos(a.id) || Number.POSITIVE_INFINITY;
      const pb = pos(b.id) || Number.POSITIVE_INFINITY;
      return pa - pb || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    });
  });

  const complete = $derived(roundComplete(input, ctx.players));

  // Two players can't share a finishing spot — flag any clash so it's fixable
  // at a glance.
  const clashes = $derived.by(() => {
    const seen = new SvelteMap<number, number>();
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

  function crownPresident(id: string) {
    if (pos(id) === 1) return;
    input.positions[id] = 1;
    haptic('win');
  }

  // Reference payout table for the active scheme, 1st → last.
  const payout = $derived.by(() => {
    const rows: { pos: number; title: ReturnType<typeof titleFor>; pts: number }[] = [];
    for (let i = 1; i <= n; i++) {
      rows.push({ pos: i, title: titleFor(i, n), pts: pointsForPosition(scheme, i, n) });
    }
    return rows;
  });
</script>

<div class="stack">
  <div class="row spread wrap">
    <span class="muted hint">Enter who finished where — first out is President.</span>
    <span class="row" style="gap: 8px">
      <button
        type="button"
        class="btn small ghost"
        aria-pressed={showPoints}
        onclick={() => (showPoints = !showPoints)}
      >
        {showPoints ? 'Hide points' : 'Points'}
      </button>
      <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
        {showHelp ? 'Hide rules' : 'How to play'}
      </button>
    </span>
  </div>

  {#if showHelp}
    <pre class="help">{presidents.help}</pre>
  {/if}

  {#if showPoints}
    <div class="points" role="note">
      <p class="blurb">{meta.blurb}</p>
      <div class="chips">
        {#each payout as row (row.pos)}
          <span class="chip">
            <span class="p">{row.title.emoji} {row.title.label}</span>
            <span class="v tnum">{row.pts > 0 ? '+' : ''}{row.pts}</span>
          </span>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Finishing-order entry: the table sorts itself as you assign each spot. -->
  {#each sortedPlayers as p (p.id)}
    {@const finish = pos(p.id)}
    {@const clash = isClash(p.id)}
    {@const title = titleFor(finish || 1, n)}
    <div
      class="prow"
      class:clash
      class:president={finish === 1 && !clash}
      animate:flip={{ duration: flipDur }}
    >
      <div class="row spread head">
        <span class="who">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        <span class="pts tnum" class:score-good={pts(p.id) > 0} class:score-bad={pts(p.id) < 0}>
          {pts(p.id) > 0 ? '+' : ''}{pts(p.id)}
        </span>
      </div>
      <div class="entry">
        <span class="rank tnum" aria-label={`Finished ${finish || '—'}: ${title.label}`}>
          <span class="badge" aria-hidden="true">{title.emoji}</span>
          {title.label}
        </span>
        <Stepper bind:value={input.positions[p.id]} min={1} max={n} label={p.name} />
        <button
          type="button"
          class="btn small ghost"
          disabled={finish === 1}
          onclick={() => crownPresident(p.id)}
          title="{p.name} was first out — crown them President"
        >
          👑 Crown
        </button>
        {#if clash}
          <span class="clash-tag" role="status">⚠ tied for {finish}</span>
        {/if}
      </div>
    </div>
  {/each}

  {#if complete}
    <div class="wrap-banner" role="status">
      <span class="ic" aria-hidden="true">🏁</span>
      <span>Round ready — every seat has a distinct finish.</span>
    </div>
  {/if}
</div>

<style>
  .hint {
    font-size: 0.85rem;
  }
  .help {
    white-space: pre-wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    font-size: 0.85rem;
    margin: 0;
    font-family: inherit;
    color: var(--muted);
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
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-chip);
    padding: 12px;
  }
  .prow.clash {
    border-color: color-mix(in srgb, var(--bad) 60%, var(--border));
  }
  /* The President's row gets a restrained crown-gold wash — leader treatment,
     never used for ordinary buttons or decoration. */
  .prow.president {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
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
  .wrap-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    font-weight: 700;
    font-size: 0.9rem;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
</style>
