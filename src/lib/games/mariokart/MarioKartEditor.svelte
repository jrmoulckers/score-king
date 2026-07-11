<script lang="ts">
  import { flip } from 'svelte/animate';
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { ordinal } from '../../stats/format';
  import { prefersReducedMotion } from '../../motion';
  import {
    announcerLine,
    cupProgress,
    cupStandings,
    normalizeRacers,
    normalizeTable,
    pointsForPosition,
    raceComplete,
    tableMeta,
    type MarioKartInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: MarioKartInput; ctx: RoundContext } = $props();

  const table = $derived(normalizeTable(ctx.config.pointsTable));
  const racers = $derived(normalizeRacers(ctx.config.racers));
  const meta = $derived(tableMeta(table));

  // The Grand Prix context: which race this is, and the announcer's voice for it.
  const cup = $derived(cupProgress(ctx.roundIndex, ctx.config.racesPerCup));
  const announcer = $derived(announcerLine(ctx.roundIndex, ctx.config.racesPerCup));

  // Motion preference is read once (matches the rest of the app) so the row
  // reorder and the checkered flag get a calm, instant alternative.
  const reduced = prefersReducedMotion();
  const flipDur = $derived(reduced ? 0 : 220);

  let showPoints = $state(false);
  let showStandings = $state(true);

  function pos(id: string): number {
    return Math.floor(Number(input.positions[id]) || 0);
  }
  function pts(id: string): number {
    return pointsForPosition(table, pos(id), racers);
  }

  // This race's points per racer, recomputed as spots are assigned — feeds both
  // the per-row payout and the live cup projection.
  const raceDeltas = $derived.by(() => {
    const out: Record<string, number> = {};
    for (const p of ctx.players) out[p.id] = pts(p.id);
    return out;
  });

  // Entry rows always read top→bottom as the current finishing order: 1st on top,
  // unentered racers sink to the back. Steps are ±1 so a change is a gentle
  // neighbour swap, animated via flip (snap under reduced motion).
  const sortedPlayers = $derived.by(() => {
    const order = new Map(ctx.players.map((p, i) => [p.id, i]));
    return [...ctx.players].sort((a, b) => {
      const pa = pos(a.id) || Number.POSITIVE_INFINITY;
      const pb = pos(b.id) || Number.POSITIVE_INFINITY;
      return pa - pb || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    });
  });

  // The podium for THIS race — the single racer holding 1st / 2nd / 3rd (blank on
  // a clash or an unfilled spot), so the rostrum reads at a glance.
  const podium = $derived.by(() => {
    return [1, 2, 3].map((spot) => {
      const holders = ctx.players.filter((p) => pos(p.id) === spot);
      return { spot, player: holders.length === 1 ? holders[0] : null };
    });
  });

  // Cumulative cup standings with this race projected in, and the current leader.
  const standings = $derived(cupStandings(ctx.players, ctx.totals, raceDeltas));
  const hasBanked = $derived(Object.values(ctx.totals ?? {}).some((v) => Number(v) > 0));
  const complete = $derived(raceComplete(input, ctx.players, ctx.config));

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
  <!-- Cup progress: which race, how far through the cup, and the announcer's call. -->
  <div class="gp" role="group" aria-label={`Race ${cup.race}${cup.endless ? '' : ` of ${cup.total}`}`}>
    <div class="row spread gp-head">
      <span class="race-label tnum">
        🏁 Race <strong>{cup.race}</strong>{cup.endless ? ' ♾️' : ` of ${cup.total}`}
      </span>
      <span class="pill">{meta.emoji} {meta.label}</span>
    </div>
    {#if !cup.endless}
      <div class="pips" aria-hidden="true">
        {#each cup.pips as p, i (i)}
          <span class="pip {p}" class:final={cup.isFinal && p === 'current'}></span>
        {/each}
      </div>
    {/if}
    <p class="announcer">{announcer}</p>
  </div>

  <!-- This race's podium — the signature rostrum, updating as spots are assigned. -->
  <div class="podium" role="group" aria-label="This race's podium">
    {#each podium as slot (slot.spot)}
      <div class="stand s{slot.spot}">
        <span class="pmedal" aria-hidden="true">{medal(slot.spot)}</span>
        <span class="pname" class:empty={!slot.player}>
          {slot.player ? slot.player.name : '—'}
        </span>
        <span class="ppos tnum">{ordinal(slot.spot)}</span>
      </div>
    {/each}
  </div>

  <!-- Toolbar: reveal the payout table and (from race 2) the running cup board. -->
  <div class="row toolbar">
    {#if hasBanked}
      <button type="button" class="btn small ghost" aria-pressed={showStandings} onclick={() => (showStandings = !showStandings)}>
        {showStandings ? 'Hide cup' : '🏆 Cup standings'}
      </button>
    {/if}
    <button type="button" class="btn small ghost" aria-pressed={showPoints} onclick={() => (showPoints = !showPoints)}>
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

  {#if hasBanked && showStandings}
    <div class="board" role="table" aria-label="Cup standings, projected after this race">
      <div class="brow bhead" role="row">
        <span role="columnheader">Cup standings</span>
        <span class="bproj" role="columnheader">After race {cup.race}</span>
      </div>
      {#each standings as s, i (s.id)}
        {@const p = ctx.players.find((pl) => pl.id === s.id)}
        <div class="brow" class:leader={s.isLeader} role="row" animate:flip={{ duration: flipDur }}>
          <span class="bwho" role="cell">
            <span class="brank tnum">{i + 1}</span>
            {#if p}<Avatar name={p.name} color={p.color} size={22} />{/if}
            <span class="bname">{p?.name ?? '—'}</span>
            {#if s.isLeader}<span class="crown" aria-label="Cup leader">👑</span>{/if}
          </span>
          <span class="bproj tnum" role="cell">
            <span class="proj" class:lead={s.isLeader}>{s.projected}</span>
            {#if s.delta > 0}<span class="bdelta">+{s.delta}</span>{/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Finishing-order entry: the field sorts itself as you assign each spot. -->
  {#each sortedPlayers as p (p.id)}
    {@const finish = pos(p.id)}
    {@const clash = isClash(p.id)}
    <div class="prow" class:clash animate:flip={{ duration: flipDur }}>
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
        <Stepper bind:value={input.positions[p.id]} min={1} max={racers} label={p.name} />
        {#if clash}
          <span class="clash-tag" role="status">⚠ ties {ordinal(finish)}</span>
        {/if}
      </div>
    </div>
  {/each}

  <!-- Checkered flag: the race is a wrap once every spot is distinct and seated. -->
  {#if complete}
    <div class="flag" class:animate={!reduced} role="status">
      <span class="checker" aria-hidden="true"></span>
      <span class="flag-text">🏁 Race ready — take the flag!</span>
      <span class="checker" aria-hidden="true"></span>
    </div>
  {/if}
</div>

<style>
  /* ── Cup progress ─────────────────────────────────────────────────────────── */
  .gp {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-chip);
    padding: 12px;
  }
  .gp-head {
    align-items: center;
  }
  .race-label {
    font-size: 0.95rem;
    font-weight: 600;
  }
  .race-label strong {
    font-weight: 800;
  }
  .pips {
    display: flex;
    gap: 6px;
    margin: 10px 0 8px;
  }
  .pip {
    flex: 1 1 0;
    height: 6px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
  }
  .pip.done {
    background: var(--muted);
    border-color: var(--muted);
  }
  .pip.current {
    background: var(--primary);
    border-color: var(--primary);
  }
  /* The final race gets a gold pip — the cup is on the line (leader/winner gold). */
  .pip.current.final {
    background: var(--accent);
    border-color: var(--accent);
  }
  .announcer {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
  }

  /* ── Podium (this race) ───────────────────────────────────────────────────── */
  .podium {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    align-items: end;
    gap: 8px;
  }
  .stand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-chip);
    padding: 8px 6px;
    text-align: center;
    min-width: 0;
  }
  /* A real rostrum: the winner stands tallest, bronze lowest — order via padding. */
  .stand.s1 {
    padding-top: 12px;
    padding-bottom: 14px;
  }
  .stand.s2 {
    padding-top: 8px;
  }
  .stand.s3 {
    padding-top: 4px;
  }
  .pmedal {
    font-size: 1.35rem;
    line-height: 1;
  }
  .pname {
    font-weight: 700;
    font-size: 0.85rem;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pname.empty {
    color: var(--muted);
    font-weight: 600;
  }
  .ppos {
    font-size: 0.72rem;
    color: var(--muted);
    font-weight: 700;
  }

  /* ── Toolbar ──────────────────────────────────────────────────────────────── */
  .toolbar {
    justify-content: flex-end;
    gap: 8px;
  }

  /* ── Cup standings board ──────────────────────────────────────────────────── */
  .board {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .brow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 5px 6px;
    border-radius: var(--radius-sm);
  }
  .bhead {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    padding-bottom: 2px;
  }
  /* Restrained crown-gold wash on the projected leader — matches the scoreboard's
     leader treatment; the 👑 and gold number carry it, so the wash stays a hint. */
  .brow.leader {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .bwho {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .brank {
    min-width: 1.2em;
    font-weight: 800;
    color: var(--muted);
    text-align: right;
  }
  .bname {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .crown {
    font-size: 0.95rem;
  }
  .bproj {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    white-space: nowrap;
  }
  .proj {
    font-weight: 800;
    font-size: 1.05rem;
  }
  .proj.lead {
    color: var(--accent-ink);
  }
  .bdelta {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--good);
  }

  /* ── Entry rows ───────────────────────────────────────────────────────────── */
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-chip);
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

  /* ── Points reference ─────────────────────────────────────────────────────── */
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

  /* ── Checkered-flag finish ────────────────────────────────────────────────── */
  .flag {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .flag-text {
    font-weight: 700;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .checker {
    flex: 1 1 0;
    height: 12px;
    background-image:
      conic-gradient(var(--text) 90deg, transparent 0 180deg, var(--text) 0 270deg, transparent 0);
    background-size: 12px 12px;
    opacity: 0.7;
  }
  /* Wave the flag in once — the race is a wrap. Instant under reduced motion. */
  .flag.animate {
    animation: flag-in 0.4s var(--ease-out) both;
  }
  .flag.animate .checker {
    animation: flag-wave 1.1s ease-in-out infinite;
  }
  @keyframes flag-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes flag-wave {
    0%,
    100% {
      background-position: 0 0;
    }
    50% {
      background-position: 12px 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .flag.animate,
    .flag.animate .checker {
      animation: none;
    }
  }

  .tnum {
    font-variant-numeric: tabular-nums;
  }
</style>
