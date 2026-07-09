<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { PALETTE } from '../../util';
  import type { VolleyballInput } from './logic';
  import {
    cloneTeams,
    foldStandings,
    makeTeam,
    readConfig,
    setWinner,
    type Team,
    unassigned,
  } from './logic';
  import { rosterDnd } from './drag';

  let { input = $bindable(), ctx }: { input: VolleyballInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));
  const pool = $derived(ctx.players);
  const playerById = $derived(new Map(pool.map((p) => [p.id, p])));

  // Recorded sets so far (this round is not among them) → live team standings.
  const priorSets = $derived(
    [...ctx.rounds]
      .sort((a, b) => a.index - b.index)
      .map((r) => r.input as VolleyballInput)
      .filter((i) => i && Array.isArray(i.teams)),
  );
  const standings = $derived(foldStandings(input.teams ?? [], priorSets, cfg));
  const leaderId = $derived(standings[0]?.setsWon > 0 ? standings[0].team.id : null);
  const setNumber = $derived(ctx.roundIndex + 1);

  const home = $derived(input.teams?.find((t) => t.id === input.home));
  const away = $derived(input.teams?.find((t) => t.id === input.away));
  const ptsHome = $derived(Number(input.points?.home) || 0);
  const ptsAway = $derived(Number(input.points?.away) || 0);
  const target = $derived(cfg.pointsPerSet);
  const result = $derived(setWinner(ptsHome, ptsAway, target, cfg.winBy2, cfg.hardCap));

  const benchIds = $derived(unassigned(input.teams ?? [], pool.map((p) => p.id)));

  // ── Score entry ──────────────────────────────────────────────────────────
  function bump(slot: 'home' | 'away', delta: number) {
    const next = Math.max(0, (Number(input.points?.[slot]) || 0) + delta);
    input.points = { ...input.points, [slot]: next };
  }
  function onType(slot: 'home' | 'away', value: string) {
    const n = Math.floor(Number(value));
    input.points = { ...input.points, [slot]: Number.isFinite(n) && n > 0 ? n : 0 };
  }
  function swapSides() {
    const h = input.home;
    input.home = input.away;
    input.away = h;
    input.points = { home: ptsAway, away: ptsHome };
  }

  /** Would one more point here win the set? */
  function isSetPoint(slot: 'home' | 'away'): boolean {
    if (result) return false;
    const na = slot === 'home' ? ptsHome + 1 : ptsHome;
    const nb = slot === 'away' ? ptsAway + 1 : ptsAway;
    const side = slot === 'home' ? 'a' : 'b';
    return setWinner(na, nb, target, cfg.winBy2, cfg.hardCap) === side;
  }
  const spHome = $derived(isSetPoint('home'));
  const spAway = $derived(isSetPoint('away'));
  const deuce = $derived(!result && cfg.winBy2 && ptsHome >= target - 1 && ptsAway >= target - 1);

  const status = $derived.by(() => {
    if (result) {
      const w = result === 'a' ? home : away;
      const hi = Math.max(ptsHome, ptsAway);
      const lo = Math.min(ptsHome, ptsAway);
      return { emoji: '✅', text: `${w?.name ?? 'Winner'} take the set ${hi}–${lo}`, tone: 'good' };
    }
    if (spHome || spAway) {
      const t = spHome ? home : away;
      return { emoji: '🎯', text: `Set point — ${t?.name ?? ''}`, tone: 'warn' };
    }
    if (deuce) return { emoji: '🔁', text: 'Deuce — must win by two', tone: 'muted' };
    return { emoji: '🏐', text: `Rally to ${target}${cfg.winBy2 ? ', win by two' : ''}`, tone: 'muted' };
  });

  // ── Team management ──────────────────────────────────────────────────────
  let managing = $state(false);
  let picking = $state<'home' | 'away' | null>(null);
  let selectedMember = $state<string | null>(null);

  const EMOJIS = ['🦈', '🦅', '🐉', '🐺', '🦁', '🐯', '🦂', '🐍', '🔥', '⚡', '🌊', '🏐', '🚀', '👑', '💥', '🌟'];

  function commit(teams: Team[]) {
    input.teams = teams;
  }
  function updateTeam(id: string, patch: Partial<Team>) {
    commit((input.teams ?? []).map((t) => (t.id === id ? { ...t, ...patch, memberIds: patch.memberIds ?? t.memberIds } : t)));
  }
  function cycleEmoji(t: Team) {
    const i = EMOJIS.indexOf(t.emoji);
    updateTeam(t.id, { emoji: EMOJIS[(i + 1) % EMOJIS.length] });
  }
  function addTeam() {
    const teams = cloneTeams(input.teams ?? []);
    teams.push(makeTeam(teams.length));
    commit(teams);
  }
  function removeTeam(id: string) {
    if ((input.teams?.length ?? 0) <= 2) return;
    commit((input.teams ?? []).filter((t) => t.id !== id));
    if (input.home === id) input.home = (input.teams?.find((t) => t.id !== id && t.id !== input.away)?.id) ?? '';
    if (input.away === id) input.away = (input.teams?.find((t) => t.id !== id && t.id !== input.home)?.id) ?? '';
  }
  /** Move a member to a team, or to the bench (toTeamId = null). Clears the selection. */
  function moveMember(memberId: string | null, toTeamId: string | null) {
    if (!memberId) return;
    const teams = (input.teams ?? []).map((t) => ({
      ...t,
      memberIds: t.memberIds.filter((m) => m !== memberId),
    }));
    if (toTeamId) {
      const t = teams.find((x) => x.id === toTeamId);
      if (t) t.memberIds = [...t.memberIds, memberId];
    }
    commit(teams);
    selectedMember = null;
  }
  function toggleSelect(memberId: string) {
    selectedMember = selectedMember === memberId ? null : memberId;
  }

  /** Drop-zone target -> moveMember. The bench zone reports the string "bench". */
  function onDrop(playerId: string, target: string) {
    moveMember(playerId, target === 'bench' ? null : target);
  }

  function overCap(t: Team): boolean {
    return cfg.teamSize > 0 && t.memberIds.length > cfg.teamSize;
  }

  const selectedName = $derived(selectedMember ? playerById.get(selectedMember)?.name ?? '' : '');
</script>

<div class="stack" use:rosterDnd={{ onMove: onDrop }}>
  <!-- ── Standings board ── -->
  <div class="board" role="table" aria-label="Team standings">
    {#each standings as s (s.team.id)}
      {@const lead = s.team.id === leaderId}
      <div class="trow" class:lead role="row">
        <span class="tident">
          <span class="temoji" style={`--tc:${s.team.color}`}>{s.team.emoji}</span>
          <span class="tmeta">
            <span class="tname">{s.team.name}</span>
            <span class="troster">
              {#each s.team.memberIds.slice(0, 6) as m (m)}
                {@const p = playerById.get(m)}
                {#if p}<Avatar name={p.name} color={p.color} size={16} />{/if}
              {/each}
              {#if s.team.memberIds.length === 0}<span class="muted xs">no players yet</span>{/if}
            </span>
          </span>
        </span>
        <span class="tsets">
          {#if lead}<span class="crown" aria-hidden="true">👑</span>{/if}
          <span class="setn tnum" class:goldnum={lead}>{s.setsWon}</span>
          <span class="setl">{s.setsWon === 1 ? 'set' : 'sets'}</span>
        </span>
      </div>
    {/each}
  </div>

  <!-- ── This set ── -->
  <div class="row spread meta">
    <span class="pill">🏐 Set {setNumber} · to {target}</span>
    <button type="button" class="linklike" onclick={() => (managing = !managing)} aria-expanded={managing}>
      {managing ? '✕ Done editing' : '⚙ Manage teams'}
    </button>
  </div>

  <p class="status" class:good={status.tone === 'good'} class:warn={status.tone === 'warn'} aria-live="polite">
    <span aria-hidden="true">{status.emoji}</span>
    <span>{status.text}</span>
  </p>

  <div class="match">
    {#each [{ slot: 'home' as const, team: home, pts: ptsHome, sp: spHome }, { slot: 'away' as const, team: away, pts: ptsAway, sp: spAway }] as s (s.slot)}
      <div class="side" class:won={(s.slot === 'home' ? result === 'a' : result === 'b')} data-drop={s.team?.id ?? undefined} style={`--tc:${s.team?.color ?? 'var(--primary)'}`}>
        <button
          type="button"
          class="sidehead"
          onclick={() => (picking = picking === s.slot ? null : s.slot)}
          aria-label={`Choose the ${s.slot} team (currently ${s.team?.name ?? 'none'})`}
        >
          <span class="temoji sm" style={`--tc:${s.team?.color ?? '#7c5cff'}`}>{s.team?.emoji ?? '🏐'}</span>
          <span class="pickname">{s.team?.name ?? 'Pick team'}</span>
          {#if (input.teams?.length ?? 0) > 2}<span class="caret" aria-hidden="true">▾</span>{/if}
        </button>

        {#if picking === s.slot && (input.teams?.length ?? 0) > 2}
          <div class="picklist" role="listbox">
            {#each input.teams as t (t.id)}
              {@const taken = t.id === (s.slot === 'home' ? input.away : input.home)}
              <button
                type="button"
                class="pickopt"
                class:on={t.id === s.team?.id}
                disabled={taken}
                onclick={() => {
                  if (s.slot === 'home') input.home = t.id; else input.away = t.id;
                  picking = null;
                }}
              >
                <span class="temoji xs" style={`--tc:${t.color}`}>{t.emoji}</span>
                <span>{t.name}</span>
                {#if taken}<span class="muted xs">playing</span>{/if}
              </button>
            {/each}
          </div>
        {/if}

        <label class="scorewrap">
          <span class="sr-only">{s.team?.name} points this set</span>
          <input
            class="score"
            class:score-good={s.slot === 'home' ? result === 'a' : result === 'b'}
            type="number"
            inputmode="numeric"
            min="0"
            value={s.pts}
            oninput={(e) => onType(s.slot, e.currentTarget.value)}
          />
        </label>

        <div class="ctrls">
          <button type="button" class="minus" onclick={() => bump(s.slot, -1)} disabled={s.pts <= 0} aria-label={`Take a point back from ${s.team?.name}`}>−1</button>
          <button type="button" class="plus" class:pt={s.sp} onclick={() => bump(s.slot, 1)} aria-label={`Add a point for ${s.team?.name}`}>
            <span class="big">+1</span>
            {#if s.sp}<span class="ptlabel">set pt</span>{/if}
          </button>
        </div>
      </div>
    {/each}
  </div>

  <button type="button" class="swap" onclick={swapSides} aria-label="Swap which side is home and away">⇄ Swap sides</button>

  <!-- ── Manage teams ── -->
  {#if managing}
    <div class="manage stack">
      {#if selectedMember}
        <div class="movebar" aria-live="polite">
          <span class="mvlabel">Move <strong>{selectedName}</strong> to</span>
          <div class="mvtargets">
            {#each input.teams as t (t.id)}
              <button type="button" class="mvbtn" onclick={() => moveMember(selectedMember, t.id)}>
                <span aria-hidden="true">{t.emoji}</span> {t.name}
              </button>
            {/each}
            <button type="button" class="mvbtn bench" onclick={() => moveMember(selectedMember, null)}>🪑 Bench</button>
            <button type="button" class="mvbtn ghost" onclick={() => (selectedMember = null)}>Cancel</button>
          </div>
        </div>
      {:else}
        <p class="draghint"><span aria-hidden="true">✋</span> Drag players between teams and the bench — or tap one to pick a spot.</p>
      {/if}

      {#each input.teams as t (t.id)}
        <div class="tcard" data-drop={t.id} style={`--tc:${t.color}`}>
          <div class="tcard-head">
            <button type="button" class="temoji btn-emoji" style={`--tc:${t.color}`} onclick={() => cycleEmoji(t)} aria-label="Change team emoji" title="Tap to change emoji">{t.emoji}</button>
            <input class="tnameinput" value={t.name} oninput={(e) => updateTeam(t.id, { name: e.currentTarget.value })} aria-label="Team name" />
            <span class="tcount" class:over={overCap(t)}>
              {t.memberIds.length}{cfg.teamSize > 0 ? `/${cfg.teamSize}` : ''}
            </span>
            {#if (input.teams?.length ?? 0) > 2}
              <button type="button" class="iconx" onclick={() => removeTeam(t.id)} aria-label={`Remove ${t.name}`}>🗑</button>
            {/if}
          </div>

          <div class="palette" role="group" aria-label="Team colour">
            {#each PALETTE as c (c)}
              <button type="button" class="dot" class:sel={t.color === c} style={`background:${c}`} onclick={() => updateTeam(t.id, { color: c })} aria-label="Set team colour"></button>
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
              <span class="muted xs emptyhint">Drop players here</span>
            {/if}
          </div>
        </div>
      {/each}

      <button type="button" class="addteam" onclick={addTeam} disabled={(input.teams?.length ?? 0) >= 8}>＋ Add team</button>

      <div class="bench-area" data-drop="bench">
        <div class="section-lbl">🪑 Bench</div>
        <div class="chips dropzone">
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
          {#if benchIds.length === 0}<span class="muted xs emptyhint">Everyone's on a team</span>{/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .meta {
    align-items: center;
  }
  .linklike {
    background: none;
    border: none;
    color: var(--muted);
    font: inherit;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 6px 2px;
    min-height: 40px;
  }
  .linklike:hover {
    color: var(--text);
  }

  /* ── Standings board ── */
  .board {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .trow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .trow.lead {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, var(--surface-2));
  }
  .tident {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .temoji {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex: none;
    font-size: 1.1rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--tc, var(--primary)) 20%, var(--surface-3));
    border: 1px solid color-mix(in srgb, var(--tc, var(--primary)) 45%, var(--border));
  }
  .temoji.sm {
    width: 28px;
    height: 28px;
    font-size: 1rem;
  }
  .temoji.xs {
    width: 22px;
    height: 22px;
    font-size: 0.85rem;
    border-radius: var(--radius-sm);
  }
  .tmeta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .tname {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .troster {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .tsets {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    flex: none;
  }
  .crown {
    font-size: 0.9rem;
    align-self: center;
  }
  .setn {
    font-size: 1.5rem;
    font-weight: 800;
  }
  .goldnum {
    color: var(--accent-ink);
  }
  .setl {
    font-size: 0.7rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }

  /* ── Status ── */
  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 0;
    padding: 10px 12px;
    text-align: center;
    font-weight: 700;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .status.good {
    color: var(--good);
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
    background: color-mix(in srgb, var(--good) 12%, var(--surface-2));
  }
  .status.warn {
    color: var(--warn);
    border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
    background: color-mix(in srgb, var(--warn) 12%, var(--surface-2));
  }

  /* ── Match (two contesting sides) ── */
  .match {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    position: relative;
  }
  .side.won {
    border-color: color-mix(in srgb, var(--good) 55%, var(--border));
  }
  .sidehead {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 4px 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }
  .sidehead:hover {
    border-color: var(--primary);
  }
  .pickname {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .caret {
    color: var(--muted);
    flex: none;
  }
  .picklist {
    position: absolute;
    z-index: 5;
    top: 54px;
    left: 6px;
    right: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
  }
  .pickopt {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    min-height: 40px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }
  .pickopt:hover {
    background: var(--surface-2);
  }
  .pickopt.on {
    background: color-mix(in srgb, var(--primary) 20%, var(--surface-2));
  }
  .pickopt:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .scorewrap {
    display: block;
    margin: 0;
  }
  .score {
    width: 100%;
    height: 84px;
    padding: 0 8px;
    text-align: center;
    font-size: 3rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    appearance: textfield;
    -moz-appearance: textfield;
  }
  .score::-webkit-outer-spin-button,
  .score::-webkit-inner-spin-button {
    -webkit-appearance: none;
    appearance: none;
    margin: 0;
  }

  .ctrls {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }
  .minus,
  .plus {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    transition:
      transform 0.05s ease,
      background 0.15s ease,
      border-color 0.15s ease;
  }
  .minus {
    flex: none;
    width: 56px;
    min-height: 56px;
    font-size: 1.2rem;
  }
  .minus:hover {
    background: var(--surface-2);
  }
  .minus:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .plus {
    flex: 1;
    min-height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    background: var(--surface-3);
  }
  .plus:hover {
    border-color: var(--primary);
  }
  .plus:active {
    transform: translateY(1px);
  }
  .plus .big {
    font-size: 1.35rem;
  }
  .plus.pt {
    border-color: color-mix(in srgb, var(--warn) 55%, var(--border));
  }
  .ptlabel {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--warn);
  }

  .swap {
    align-self: center;
    background: none;
    border: none;
    color: var(--muted);
    font: inherit;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 8px 12px;
    min-height: 40px;
  }
  .swap:hover {
    color: var(--text);
  }

  /* ── Manage teams ── */
  .manage {
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    gap: 12px;
  }
  .movebar {
    position: sticky;
    top: 6px;
    z-index: 4;
    padding: 10px;
    background: var(--surface-3);
    border: 1px solid color-mix(in srgb, var(--primary) 40%, var(--border));
    border-radius: var(--radius-sm);
  }
  .mvlabel {
    display: block;
    margin-bottom: 8px;
    font-size: 0.9rem;
  }
  .mvtargets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .mvbtn {
    min-height: 40px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .mvbtn:hover {
    border-color: var(--primary);
  }
  .mvbtn.bench {
    background: var(--surface-2);
  }
  .mvbtn.ghost {
    color: var(--muted);
    border-style: dashed;
  }

  .tcard {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .tcard-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .btn-emoji {
    cursor: pointer;
  }
  .tnameinput {
    flex: 1;
    min-width: 0;
    height: 40px;
    padding: 0 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font: inherit;
    font-weight: 700;
  }
  .tcount {
    flex: none;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .tcount.over {
    color: var(--warn);
  }
  .iconx {
    flex: none;
    width: 40px;
    height: 40px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    font-size: 0.9rem;
  }
  .iconx:hover {
    border-color: var(--bad);
  }

  .palette {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }
  .dot.sel {
    border-color: var(--text);
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
    padding: 5px 10px 5px 5px;
    min-height: 40px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    font-size: 0.85rem;
  }
  .chip.sel {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 18%, var(--surface));
  }
  .chip.draggable {
    touch-action: none;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    transition:
      transform 0.12s ease,
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
  }
  .chip.draggable:active {
    cursor: grabbing;
  }
  .chip.draggable:hover {
    border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
  }
  .grip {
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1;
    letter-spacing: -0.15em;
    padding-left: 2px;
    opacity: 0.7;
  }

  .draghint {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 0.82rem;
    color: var(--muted);
  }

  /* Drop zones: the chip trays inside team cards / bench, and live match sides. */
  .dropzone {
    min-height: 46px;
    align-content: flex-start;
    padding: 4px;
    margin: -4px;
    border-radius: var(--radius-sm);
    transition: background 0.15s ease;
  }
  .emptyhint {
    align-self: center;
    padding: 6px 2px;
  }
  .tcard {
    border-color: color-mix(in srgb, var(--tc, var(--primary)) 40%, var(--border));
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.12s ease;
  }
  /* A team card / bench / match side lit up as the active drop target. */
  :global(.tcard.drop-hot),
  :global(.bench-area.drop-hot),
  :global(.side.drop-hot) {
    border-color: color-mix(in srgb, var(--tc, var(--primary)) 70%, var(--border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--tc, var(--primary)) 55%, transparent);
  }
  :global(.tcard.drop-hot) .dropzone,
  :global(.bench-area.drop-hot) .dropzone {
    background: color-mix(in srgb, var(--tc, var(--primary)) 12%, transparent);
  }

  /* Floating drag ghost — appended to <body>, so styled globally. */
  :global(.vb-drag-ghost) {
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
  :global(body.vb-dragging) {
    cursor: grabbing;
  }
  :global(body.vb-dragging) * {
    cursor: grabbing !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .chip.draggable,
    .tcard,
    .dropzone,
    :global(.vb-drag-ghost) {
      transition: none;
    }
  }

  .addteam {
    align-self: flex-start;
    min-height: 40px;
    padding: 8px 14px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .addteam:hover:not(:disabled) {
    border-color: var(--primary);
  }
  .addteam:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .bench-area {
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .section-lbl {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .muted {
    color: var(--muted);
  }
  .xs {
    font-size: 0.75rem;
  }

  .minus:focus-visible,
  .plus:focus-visible,
  .score:focus-visible,
  .sidehead:focus-visible,
  .chip:focus-visible,
  .mvbtn:focus-visible,
  .dot:focus-visible,
  .addteam:focus-visible,
  .tnameinput:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }

  @media (max-width: 360px) {
    .score {
      font-size: 2.5rem;
    }
  }
</style>
