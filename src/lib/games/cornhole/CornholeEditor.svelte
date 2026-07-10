<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { bumpOnChange, popIn } from '../../motion';
  import BagTossRow from './BagTossRow.svelte';
  import RaceToTarget from './RaceToTarget.svelte';
  import {
    BAGS_PER_SIDE,
    bustRisk,
    type CornholeInput,
    isFourBagger,
    readConfig,
    scoreCornhole,
    sideRaw,
    tossFlavor,
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
  function raw(id: string): number {
    return sideRaw(bag(id));
  }
  function totalBefore(id: string): number {
    return Number(ctx.totals[id]) || 0;
  }
  function four(id: string): boolean {
    return isFourBagger(bag(id));
  }

  // Who's reigning right now (before this frame). A tie has no leader — Crown Gold
  // only ever marks a side that's actually ahead.
  const leaderId = $derived.by(() => {
    const [aId, bId] = ids;
    const ta = totalBefore(aId);
    const tb = totalBefore(bId);
    if (ta > tb) return aId;
    if (tb > ta) return bId;
    return null;
  });

  const lanes = $derived(
    ctx.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      total: totalBefore(p.id),
      gain: outcome.deltas[p.id] ?? 0,
      isLeader: p.id === leaderId,
      danger: bustRisk(totalBefore(p.id), cfg),
    })),
  );

  const flavor = $derived(
    tossFlavor({
      gainerName: gainer?.name ?? null,
      net: outcome.net,
      aRaw: outcome.aRaw,
      bRaw: outcome.bRaw,
      busted: outcome.busted,
      fourBaggerName:
        four(ids[0]) !== four(ids[1])
          ? four(ids[0])
            ? ctx.players[0]!.name
            : ctx.players[1]!.name
          : null,
      bothFourBaggers: four(ids[0]) && four(ids[1]),
      seed: ctx.roundIndex,
    }),
  );

  // A stable key for the flavor beat, so the status line re-pops only when the
  // narrated result actually changes (not on every keystroke of the same result).
  const flavorKey = $derived(`${flavor.emoji}|${flavor.text}`);
</script>

<div class="stack">
  <RaceToTarget {lanes} target={cfg.target} />

  <div class="showdown" class:wash={!gainer} class:bust={outcome.busted}>
    <div class="row spread head">
      <span class="pill">Round {n}</span>
      <span class="pill">to {cfg.target}{cfg.winBy > 1 ? ` · by ${cfg.winBy}` : ''}{cfg.bust ? ' · bust' : ''}</span>
    </div>

    <div class="flavor {flavor.tone}" use:bumpOnChange={flavorKey}>
      <span class="fem" aria-hidden="true">{flavor.emoji}</span>
      <span>{flavor.text}</span>
    </div>

    <div class="cancel" aria-hidden="true">
      <span class="craw" class:beaten={outcome.aRaw < outcome.bRaw} class:tie={outcome.aRaw === outcome.bRaw}>{outcome.aRaw}</span>
      <span class="cvs">⟷</span>
      <span class="craw" class:beaten={outcome.bRaw < outcome.aRaw} class:tie={outcome.aRaw === outcome.bRaw}>{outcome.bRaw}</span>
      <span class="carrow">→</span>
      {#if gainer}
        <span class="cnet">{gainer.name} keeps <strong>+{outcome.net}</strong></span>
      {:else}
        <span class="cnet muted">cancels to nothing</span>
      {/if}
    </div>
  </div>

  {#each ctx.players as p, i (p.id)}
    {#if i === 1}<div class="vs" aria-hidden="true">vs</div>{/if}
    <div class="side" class:scoring={outcome.gainerId === p.id}>
      <div class="row spread shead">
        <span class="row who" style="gap: 8px">
          <Avatar name={p.name} color={p.color} />
          <span class="name">
            <span class="overline">{sideNoun} {i === 0 ? 'A' : 'B'}</span>
            <strong>{p.name}</strong>
          </span>
        </span>
        <span class="frame">
          {#if four(p.id)}
            <span class="fourbag" use:popIn>💣 Four-bagger!</span>
          {/if}
          <span class="fpts">🌽 <strong>{raw(p.id)}</strong> pts</span>
        </span>
      </div>

      <BagTossRow bind:bag={input.sides[p.id]} label={p.name} />
    </div>
  {/each}

  <p class="hint muted">
    Tap each bag to place it — <strong>🕳️ Drano</strong> (+3), <strong>🫘 Woody</strong> (+1),
    or <strong>🌱 Grass</strong> (0). {BAGS_PER_SIDE} bags a side; only the higher side scores the difference.
  </p>
</div>

<style>
  .head {
    flex-wrap: wrap;
    gap: 8px;
  }

  /* ── Cancellation showdown ── the frame's story in one glance. */
  .showdown {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .showdown.wash {
    border-color: color-mix(in srgb, var(--muted) 35%, var(--border));
  }
  .showdown.bust {
    border-color: color-mix(in srgb, var(--bad) 45%, var(--border));
  }
  .flavor {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .flavor .fem {
    font-size: 1.2rem;
  }
  .flavor.good {
    color: var(--good);
  }
  .flavor.bad {
    color: var(--bad);
  }
  .flavor.muted {
    color: var(--muted);
  }
  .cancel {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-variant-numeric: tabular-nums;
  }
  .craw {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 30px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    font-weight: 800;
  }
  /* The lower side is cancelled out — struck through and dimmed, so the "only the
     difference survives" rule is visible, not just asserted. */
  .craw.beaten {
    opacity: 0.5;
    text-decoration: line-through;
    text-decoration-thickness: 2px;
  }
  .craw.tie {
    opacity: 0.6;
  }
  .cvs {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .carrow {
    color: var(--muted);
  }
  .cnet {
    font-weight: 700;
  }
  .cnet strong {
    font-weight: 800;
  }

  /* ── Per-side entry ── */
  .side {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
  }
  /* The side that would score this frame lifts one step up the surface ramp. */
  .side.scoring {
    background: var(--surface-3);
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
  }
  .shead {
    margin-bottom: 12px;
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
  .frame {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-variant-numeric: tabular-nums;
  }
  .fpts {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .fpts strong {
    font-weight: 800;
  }
  .fourbag {
    font-size: 0.78rem;
    font-weight: 800;
    color: var(--good);
    white-space: nowrap;
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
  .hint {
    font-size: 0.8rem;
    margin: 2px 2px 0;
    line-height: 1.5;
  }
</style>
