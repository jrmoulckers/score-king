<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import GolfGrid from './GolfGrid.svelte';
  import LinksProgress from './LinksProgress.svelte';
  import BirdieBurst from './BirdieBurst.svelte';
  import {
    computeGrid,
    gridShape,
    holeCeiling,
    holeFloor,
    holeVerdict,
    readConfig,
    rulesetLines,
    type CardCode,
    type GolfInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: GolfInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));
  const n = $derived(ctx.roundIndex + 1);
  const floor = $derived(holeFloor(cfg));
  const ceil = $derived(holeCeiling(cfg));
  const gridSize = $derived(gridShape(cfg.grid).cols * gridShape(cfg.grid).rows);
  let showRules = $state(false);

  // Per-player: is the tap-the-grid helper open, and a token that fires the birdie
  // burst each time that player crosses (down) into the red on this hole.
  let openGrid = $state<Record<string, boolean>>({});
  let birdieToken = $state<Record<string, number>>({});
  let eagleFlag = $state<Record<string, boolean>>({});
  const wasUnder: Record<string, boolean> = {};
  let ready = false;

  function scoreOf(id: string): number {
    return Math.trunc(Number(input.scores[id]) || 0);
  }
  function projected(id: string): number {
    return (ctx.totals[id] ?? 0) + scoreOf(id);
  }

  // Watch each player's hole score; when it drops under par (0 → negative) fire a
  // birdie burst. Primed on first run so re-opening a red hole to edit doesn't
  // celebrate on mount — only a fresh dip into the red does.
  $effect(() => {
    for (const p of ctx.players) {
      const under = scoreOf(p.id) < 0;
      if (ready && under && !wasUnder[p.id]) {
        birdieToken[p.id] = (birdieToken[p.id] ?? 0) + 1;
        eagleFlag[p.id] = holeVerdict(scoreOf(p.id), cfg).kind === 'eagle';
        haptic('win');
      }
      wasUnder[p.id] = under;
    }
    ready = true;
  });

  // Data hygiene: a *closed* grid that no longer sums to its player's score was
  // overtaken by a manual stepper edit, so drop it — the two entry modes never
  // save a grid that misrepresents the hole. An open grid owns its score and is
  // left alone (it writes the score as cards are tapped).
  $effect(() => {
    const grids = input.grids;
    if (!grids) return;
    for (const id of Object.keys(grids)) {
      if (openGrid[id]) continue;
      const cells = grids[id];
      if (cells && computeGrid(cells, cfg).total !== scoreOf(id)) delete grids[id];
    }
  });

  function ensureGrid(id: string) {
    if (!input.grids) input.grids = {};
    if (!input.grids[id] || input.grids[id].length !== gridSize) {
      input.grids[id] = new Array(gridSize).fill(null) as (CardCode | null)[];
    }
  }
  function toggleGrid(id: string) {
    const next = !openGrid[id];
    openGrid[id] = next;
    if (next) {
      ensureGrid(id);
      // Resume the laid-out grid only if it still matches the score; otherwise the
      // score was hand-edited since, so start the felt fresh.
      if (computeGrid(input.grids![id], cfg).total !== scoreOf(id)) {
        input.grids![id] = new Array(gridSize).fill(null) as (CardCode | null)[];
      }
    }
  }
  function applyGridScore(id: string, total: number) {
    input.scores[id] = total;
  }
</script>

<div class="stack">
  <LinksProgress hole={n} holes={cfg.holes} />

  <div class="row spread">
    <span class="muted hint">Fewest points wins — cancel columns, chase the red numbers.</span>
    <button type="button" class="btn small ghost" onclick={() => (showRules = !showRules)}>
      Card values
    </button>
  </div>

  {#if showRules}
    <div class="help">
      {#each rulesetLines(cfg) as line}<div>{line}</div>{/each}
    </div>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const v = holeVerdict(scoreOf(p.id), cfg)}
    <div class="prow">
      <BirdieBurst token={birdieToken[p.id] ?? 0} eagle={eagleFlag[p.id] ?? false} />
      <div class="row spread">
        <span class="row" style="gap: 8px; min-width: 0">
          <Avatar name={p.name} color={p.color} />
          <strong class="pname">{p.name}</strong>
        </span>
        <Stepper bind:value={input.scores[p.id]} min={floor} max={ceil} label={p.name} />
      </div>

      <div class="row spread foot">
        <span
          class="tag"
          class:good={v.kind === 'birdie' || v.kind === 'eagle' || v.kind === 'clean'}
          class:rough={v.kind === 'rough'}
        >
          {#if v.label}{v.emoji} {v.label}{:else}&nbsp;{/if}
        </span>
        <span class="running">
          <span class="lbl">total</span>
          <span class="num">{projected(p.id)}</span>
        </span>
      </div>

      <button
        type="button"
        class="btn small ghost grid-toggle"
        aria-expanded={!!openGrid[p.id]}
        onclick={() => toggleGrid(p.id)}
      >
        {openGrid[p.id] ? '▾ Hide grid' : '⛳ Tap the grid'}
      </button>

      {#if openGrid[p.id]}
        {#key cfg.grid}
          <GolfGrid
            {cfg}
            bind:cells={input.grids![p.id]}
            onscore={(t) => applyGridScore(p.id, t)}
            label={p.name}
          />
        {/key}
      {/if}
    </div>
  {/each}
</div>

<style>
  .hint {
    font-size: 0.85rem;
  }
  .prow {
    position: relative;
    z-index: 0;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 12px;
  }
  .pname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .foot {
    margin-top: 8px;
  }
  .tag {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--muted);
  }
  /* Under-par (birdie/eagle) and a clean sheet read in semantic green; a blown-up
     hole reads in caution amber. Colour is always paired with the emoji + word. */
  .tag.good {
    color: var(--good);
  }
  .tag.rough {
    color: var(--warn);
  }
  .running {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
  }
  .lbl {
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .num {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .grid-toggle {
    margin-top: 10px;
  }
  .help {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
