<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { PALETTE } from '../../util';
  import { haptic } from '../../haptics';
  import { bumpOnChange, popIn } from '../../motion';
  import BagTossRow from './BagTossRow.svelte';
  import RaceToTarget from './RaceToTarget.svelte';
  import { sideDnd } from './drag';
  import {
    BAGS_PER_SIDE,
    bustRisk,
    cloneTeams,
    type CornholeInput,
    type CornholeTeam,
    isFourBagger,
    MAX_PER_SIDE,
    normalizeInput,
    readConfig,
    scoreCornhole,
    sideRaw,
    sideTotal,
    tossFlavor,
  } from './logic';

  let { input = $bindable(), ctx }: { input: CornholeInput; ctx: RoundContext } = $props();

  // Upgrade a legacy round (player-keyed `sides`, no team lineup) in place the moment it
  // opens for editing, so binding to teams/throws always has something to write to.
  $effect(() => {
    if (!Array.isArray(input.teams) || input.teams.length < 2) {
      const norm = normalizeInput(input, ctx.players);
      input.teams = norm.teams;
      input.throws = norm.throws;
    }
  });

  const n = $derived(ctx.roundIndex + 1);
  const cfg = $derived(readConfig(ctx.config));
  const pool = $derived(ctx.players);
  const playerById = $derived(new Map(pool.map((p) => [p.id, p])));

  const teams = $derived(input.teams ?? []);
  const throws = $derived(input.throws ?? {});
  const teamA = $derived(teams[0]);
  const teamB = $derived(teams[1]);

  const outcome = $derived(scoreCornhole(teams, throws, ctx.totals, cfg));
  const gainer = $derived(teams.find((t) => t.id === outcome.gainerTeamId) ?? null);

  function bag(id: string): { inHole: number; onBoard: number } {
    return throws[id] ?? { inHole: 0, onBoard: 0 };
  }
  function raw(id: string): number {
    return sideRaw(bag(id));
  }
  function four(id: string): boolean {
    return isFourBagger(bag(id));
  }
  function teamGain(t: CornholeTeam | undefined): number {
    const m = t?.memberIds?.[0];
    return m ? outcome.deltas[m] ?? 0 : 0;
  }

  // Who's reigning right now (before this frame). A tie has no leader — Crown Gold only
  // ever marks the side that's actually ahead.
  const leaderId = $derived.by(() => {
    const ta = sideTotal(teamA, ctx.totals);
    const tb = sideTotal(teamB, ctx.totals);
    if (ta > tb) return teamA?.id ?? null;
    if (tb > ta) return teamB?.id ?? null;
    return null;
  });

  const lanes = $derived(
    teams.map((t) => ({
      id: t.id,
      name: t.name,
      emoji: t.emoji,
      color: t.color,
      total: sideTotal(t, ctx.totals),
      gain: teamGain(t),
      isLeader: t.id === leaderId,
      danger: bustRisk(sideTotal(t, ctx.totals), cfg),
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
        teamA && teamB && four(teamA.id) !== four(teamB.id)
          ? four(teamA.id)
            ? teamA.name
            : teamB.name
          : null,
      bothFourBaggers: !!teamA && !!teamB && four(teamA.id) && four(teamB.id),
      seed: ctx.roundIndex,
    }),
  );

  // A stable key for the flavor beat, so the status line re-pops only when the narrated
  // result actually changes (not on every keystroke of the same result).
  const flavorKey = $derived(`${flavor.emoji}|${flavor.text}`);

  // ── Team management ────────────────────────────────────────────────────────
  let managing = $state(false);
  let selectedMember = $state<string | null>(null);

  const EMOJIS = ['🌽', '🎒', '🏆', '🔥', '⚡', '💥', '🦅', '🐺', '🦁', '🐝', '🚜', '🍺', '🌭', '⭐', '🎯', '👑'];

  function commit(next: CornholeTeam[]) {
    input.teams = next;
  }
  function updateTeam(id: string, patch: Partial<CornholeTeam>) {
    commit(teams.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }
  function cycleEmoji(t: CornholeTeam) {
    const i = EMOJIS.indexOf(t.emoji);
    updateTeam(t.id, { emoji: EMOJIS[(i + 1) % EMOJIS.length] ?? '🌽' });
  }
  /** Move a player onto a side, removing them from the other side first. */
  function moveMember(memberId: string | null, toTeamId: string | null) {
    if (!memberId || !toTeamId) {
      selectedMember = null;
      return;
    }
    const next = cloneTeams(teams).map((t) => ({
      ...t,
      memberIds: t.memberIds.filter((m) => m !== memberId),
    }));
    const dest = next.find((t) => t.id === toTeamId);
    if (dest) dest.memberIds = [...dest.memberIds, memberId];
    commit(next);
    selectedMember = null;
    haptic('tick');
  }
  function toggleSelect(memberId: string) {
    selectedMember = selectedMember === memberId ? null : memberId;
  }
  /** Drop-zone target -> moveMember. Zones report the side's team id. */
  function onDrop(playerId: string, target: string) {
    moveMember(playerId, target);
  }
  function overCap(t: CornholeTeam): boolean {
    return t.memberIds.length > MAX_PER_SIDE;
  }

  const assignedIds = $derived(new Set(teams.flatMap((t) => t.memberIds)));
  const benchIds = $derived(pool.map((p) => p.id).filter((id) => !assignedIds.has(id)));
  const selectedName = $derived(selectedMember ? playerById.get(selectedMember)?.name ?? '' : '');
</script>

<div class="stack" use:sideDnd={{ onMove: onDrop }}>
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
        <span class="cnet">{gainer.emoji} {gainer.name} keeps <strong>+{outcome.net}</strong></span>
      {:else}
        <span class="cnet muted">cancels to nothing</span>
      {/if}
    </div>
  </div>

  {#each teams as t, i (t.id)}
    {#if i === 1}<div class="vs" aria-hidden="true">vs</div>{/if}
    <div class="side" class:scoring={outcome.gainerTeamId === t.id} style={`--tc:${t.color}`}>
      <div class="row spread shead">
        <span class="row who" style="gap: 10px">
          <span class="temoji" style={`--tc:${t.color}`} aria-hidden="true">{t.emoji}</span>
          <span class="name">
            <span class="overline">Side {i === 0 ? 'A' : 'B'}</span>
            <strong>{t.name}</strong>
            <span class="roster">
              {#each t.memberIds as m (m)}
                {@const p = playerById.get(m)}
                {#if p}<Avatar name={p.name} color={p.color} size={18} />{/if}
              {/each}
            </span>
          </span>
        </span>
        <span class="frame">
          {#if four(t.id)}
            <span class="fourbag" use:popIn>💣 Four-bagger!</span>
          {/if}
          <span class="fpts">🌽 <strong>{raw(t.id)}</strong> pts</span>
        </span>
      </div>

      {#if input.throws?.[t.id]}
        <BagTossRow bind:bag={input.throws[t.id]} label={t.name} />
      {/if}
    </div>
  {/each}

  <div class="row spread foot">
    <p class="hint muted">
      Tap each bag — <strong>🕳️ Drano</strong> (+3), <strong>🫘 Woody</strong> (+1),
      <strong>🌱 Grass</strong> (0). {BAGS_PER_SIDE} a side; only the higher side scores the difference.
    </p>
    <button type="button" class="linklike" onclick={() => (managing = !managing)} aria-expanded={managing}>
      {managing ? '✕ Done' : '⚙ Sides'}
    </button>
  </div>

  <!-- ── Build the two sides ── -->
  {#if managing}
    <div class="manage stack">
      {#if selectedMember}
        <div class="movebar" aria-live="polite">
          <span class="mvlabel">Move <strong>{selectedName}</strong> to</span>
          <div class="mvtargets">
            {#each teams as t (t.id)}
              <button type="button" class="mvbtn" onclick={() => moveMember(selectedMember, t.id)}>
                <span aria-hidden="true">{t.emoji}</span> {t.name}
              </button>
            {/each}
            <button type="button" class="mvbtn ghost" onclick={() => (selectedMember = null)}>Cancel</button>
          </div>
        </div>
      {:else}
        <p class="draghint"><span aria-hidden="true">✋</span> Drag players between the two sides — or tap one to pick a side.</p>
      {/if}

      {#each teams as t, i (t.id)}
        <div class="tcard" data-drop={t.id} style={`--tc:${t.color}`}>
          <div class="tcard-head">
            <button type="button" class="temoji btn-emoji" style={`--tc:${t.color}`} onclick={() => cycleEmoji(t)} aria-label="Change side emoji" title="Tap to change emoji">{t.emoji}</button>
            <span class="overline side-tag">Side {i === 0 ? 'A' : 'B'}</span>
            <input class="tnameinput" value={t.name} oninput={(e) => updateTeam(t.id, { name: e.currentTarget.value })} aria-label={`Side ${i === 0 ? 'A' : 'B'} name`} maxlength="24" />
            <span class="tcount" class:over={overCap(t)}>{t.memberIds.length}/{MAX_PER_SIDE}</span>
          </div>

          <div class="palette" role="group" aria-label="Side colour">
            {#each PALETTE as c (c)}
              <button type="button" class="dot" class:sel={t.color === c} style={`background:${c}`} onclick={() => updateTeam(t.id, { color: c })} aria-label="Set side colour"></button>
            {/each}
          </div>

          <div class="chips dropzone">
            {#each t.memberIds as m (m)}
              {@const p = playerById.get(m)}
              {#if p}
                <button
                  type="button"
                  class="chip draggable"
                  class:sel={selectedMember === m}
                  data-player-id={m}
                  data-player-name={p.name}
                  data-player-color={p.color}
                  onclick={() => toggleSelect(m)}
                >
                  <span class="grip" aria-hidden="true">⠿</span>
                  <Avatar name={p.name} color={p.color} size={20} />
                  <span>{p.name}</span>
                </button>
              {/if}
            {/each}
            {#if t.memberIds.length === 0}
              <span class="muted xs emptyhint">Drop a player here</span>
            {/if}
          </div>
        </div>
      {/each}

      {#if benchIds.length}
        <div class="bench-area">
          <div class="section-lbl">🪑 Not on a side yet — everyone must play</div>
          <div class="chips">
            {#each benchIds as m (m)}
              {@const p = playerById.get(m)}
              {#if p}
                <button
                  type="button"
                  class="chip draggable"
                  class:sel={selectedMember === m}
                  data-player-id={m}
                  data-player-name={p.name}
                  data-player-color={p.color}
                  onclick={() => toggleSelect(m)}
                >
                  <span class="grip" aria-hidden="true">⠿</span>
                  <Avatar name={p.name} color={p.color} size={20} />
                  <span>{p.name}</span>
                </button>
              {/if}
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
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

  /* ── Side header team badge (mirrors the lane emoji) ── */
  .temoji {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    font-size: 1.05rem;
    background: color-mix(in srgb, var(--tc, var(--brand)) 22%, var(--surface-3));
    border: 1px solid color-mix(in srgb, var(--tc, var(--brand)) 45%, var(--border));
    flex: none;
  }
  .roster {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-top: 3px;
  }

  /* ── Footer / manage toggle ── */
  .foot {
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
  }
  .foot .hint {
    flex: 1 1 200px;
  }
  .linklike {
    background: none;
    border: 1px solid var(--border);
    color: var(--fg);
    font-weight: 700;
    font-size: 0.82rem;
    padding: 9px 12px;
    min-height: 46px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
  }
  .linklike[aria-expanded='true'] {
    background: var(--surface-3);
  }

  /* ── Team builder ── mirrors the volleyball roster idiom. */
  .manage {
    padding: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .draghint {
    margin: 0;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .movebar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .mvlabel {
    font-size: 0.85rem;
  }
  .mvtargets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .mvbtn {
    min-height: 46px;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    font-weight: 700;
    cursor: pointer;
  }
  .mvbtn.ghost {
    color: var(--muted);
  }

  .tcard {
    padding: 12px;
    background: var(--surface);
    border: 1px solid color-mix(in srgb, var(--tc, var(--brand)) 40%, var(--border));
    border-radius: var(--radius);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tcard.drop-hot {
    border-color: var(--tc, var(--brand));
    background: color-mix(in srgb, var(--tc, var(--brand)) 12%, var(--surface));
  }
  .tcard-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .btn-emoji {
    cursor: pointer;
  }
  .side-tag {
    flex: none;
  }
  .tnameinput {
    flex: 1 1 120px;
    min-width: 100px;
    min-height: 46px;
    padding: 8px 10px;
    font-weight: 800;
    font-size: 0.95rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg);
  }
  .tcount {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 0.8rem;
    color: var(--muted);
    flex: none;
  }
  .tcount.over {
    color: var(--bad);
  }
  .palette {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dot {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }
  .dot.sel {
    border-color: var(--fg);
    box-shadow: 0 0 0 2px var(--surface);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .dropzone {
    min-height: 52px;
    padding: 8px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    align-content: flex-start;
    align-items: center;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 6px 12px 6px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--fg);
    font-weight: 700;
    font-size: 0.88rem;
    cursor: grab;
    touch-action: none;
  }
  .chip.sel {
    border-color: var(--brand);
    background: color-mix(in srgb, var(--brand) 16%, var(--surface-2));
  }
  .grip {
    color: var(--muted);
    font-size: 0.9rem;
    cursor: grab;
  }
  .emptyhint {
    align-self: center;
  }
  .xs {
    font-size: 0.76rem;
  }
  .bench-area {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .section-lbl {
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .chip,
    .tcard {
      transition: none;
    }
    :global(.ch-drag-ghost) {
      transition: none;
    }
  }

  /* Floating drag ghost + grabbing cursor (global — appended to <body>). */
  :global(.ch-drag-ghost) {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1000;
    pointer-events: none;
    padding: 8px 14px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 0.85rem;
    color: #fff;
    background: color-mix(in srgb, var(--ghost-color, #7c5cff) 92%, #000);
    border: 1px solid color-mix(in srgb, #fff 30%, transparent);
    box-shadow: var(--shadow);
    transition: transform 0.04s linear;
  }
  :global(body.ch-dragging) {
    cursor: grabbing;
  }
</style>
