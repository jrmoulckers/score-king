<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { PALETTE } from '../../util';
  import { haptic } from '../../haptics';
  import type { Side, VolleyballInput } from './logic';
  import {
    cloneTeams,
    currentRun,
    dropRally,
    foldStandings,
    isDeuceSet,
    makeTeam,
    popRally,
    pushRally,
    readConfig,
    scoreFromRallies,
    serving,
    setPointSide,
    setWinner,
    shuffleTeams,
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

  // The rally log powers a true single "undo", the serve indicator and the momentum read.
  // It's optional and additive — `points` stays the scoring truth, and legacy sets with no
  // log fall back to plain ± on the point totals.
  const hasLog = $derived(Array.isArray(input.rallies));
  const rallies = $derived(input.rallies ?? []);
  const ptsHome = $derived(Number(input.points?.home) || 0);
  const ptsAway = $derived(Number(input.points?.away) || 0);
  const target = $derived(cfg.pointsPerSet);
  const result = $derived(setWinner(ptsHome, ptsAway, target, cfg.winBy2, cfg.hardCap));
  const done = $derived(result !== null);

  const spSide = $derived(done ? null : setPointSide(ptsHome, ptsAway, target, cfg.winBy2, cfg.hardCap));
  const spHome = $derived(spSide === 'a');
  const spAway = $derived(spSide === 'b');
  const deuce = $derived(isDeuceSet(ptsHome, ptsAway, target, cfg.winBy2, cfg.hardCap));
  const serveSide = $derived(serving(rallies));
  const run = $derived(currentRun(rallies));

  const canUndo = $derived(hasLog && rallies.length > 0);
  const lastSide = $derived<Side | null>(rallies.length ? rallies[rallies.length - 1]! : null);
  const lastName = $derived(lastSide === null ? '' : lastSide === 'a' ? (home?.name ?? 'Home') : (away?.name ?? 'Away'));

  const benchIds = $derived(unassigned(input.teams ?? [], pool.map((p) => p.id)));

  // Beach vs indoor costume — flavour through emoji + copy, never a restyled shell.
  const formatEmoji = $derived(cfg.format === 'beach' ? '🏖️' : cfg.format === 'indoor' ? '🏟️' : '🏐');
  const formatLabel = $derived(
    cfg.format === 'beach' ? 'Beach' : cfg.format === 'indoor' ? 'Indoor' : cfg.format === 'fours' ? 'Fours' : 'Custom',
  );

  // ── Score entry ──────────────────────────────────────────────────────────
  /** Sync `points` from a rally log so the log and the score stay the one truth. */
  function setScore(next: Side[]) {
    input.rallies = next;
    const s = scoreFromRallies(next);
    input.points = { home: s.home, away: s.away };
  }
  /** Would giving `side` the next rally clinch the set right now? */
  function clinches(side: Side): boolean {
    const na = side === 'a' ? ptsHome + 1 : ptsHome;
    const nb = side === 'b' ? ptsAway + 1 : ptsAway;
    return setWinner(na, nb, target, cfg.winBy2, cfg.hardCap) === side;
  }
  function add(slot: 'home' | 'away') {
    if (done) return;
    const side: Side = slot === 'home' ? 'a' : 'b';
    const win = clinches(side);
    if (hasLog) setScore(pushRally(rallies, side));
    else input.points = { ...input.points, [slot]: (Number(input.points?.[slot]) || 0) + 1 };
    haptic(win ? 'win' : 'tick');
  }
  function sub(slot: 'home' | 'away') {
    const side: Side = slot === 'home' ? 'a' : 'b';
    if (hasLog) setScore(dropRally(rallies, side));
    else input.points = { ...input.points, [slot]: Math.max(0, (Number(input.points?.[slot]) || 0) - 1) };
  }
  function undoLast() {
    if (!canUndo) return;
    setScore(popRally(rallies));
    haptic('undo');
  }
  function swapSides() {
    const h = input.home;
    input.home = input.away;
    input.away = h;
    if (hasLog) setScore(rallies.map((s) => (s === 'a' ? 'b' : 'a')));
    else input.points = { home: ptsAway, away: ptsHome };
  }

  // One sportscaster line for the live status region — whimsy in the copy, never clutter.
  const call = $derived.by(() => {
    if (!home || !away) return { tone: 'muted', text: '🏐 Pick the two teams playing this set.' };
    const hn = home.name;
    const an = away.name;
    if (done) {
      const w = result === 'a' ? hn : an;
      const hi = Math.max(ptsHome, ptsAway);
      const lo = Math.min(ptsHome, ptsAway);
      return { tone: 'good', text: `✅ ${w} take the set ${hi}–${lo} — tap “Save round” to bank it.` };
    }
    if (spHome || spAway) return { tone: 'warn', text: `🎯 Set point — ${spHome ? hn : an} one rally away!` };
    if (deuce) return { tone: 'warn', text: `🔁 Deuce at ${ptsHome}–${ptsAway} — win by two, nobody blinks.` };
    if (run.side !== null && run.length >= 4) return { tone: 'muted', text: `🔥 ${run.side === 'a' ? hn : an} rolling — ${run.length} straight.` };
    if (ptsHome === 0 && ptsAway === 0) return { tone: 'muted', text: `${formatEmoji} ${formatLabel} • first serve! Rally to ${target}${cfg.winBy2 ? ', win by two' : ''}.` };
    return { tone: 'muted', text: `Tap ＋1 for the side that won each rally. Rally to ${target}${cfg.winBy2 ? ', win by two' : ''}.` };
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
  /** Whimsical one-tap re-deal: reshuffle the whole pool across the current teams. */
  function doShuffle() {
    commit(shuffleTeams(input.teams ?? [], pool.map((p) => p.id), cfg));
    selectedMember = null;
    haptic('tick');
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
    <span class="pill">{formatEmoji} Set {setNumber} · to {target}</span>
    <button type="button" class="linklike" onclick={() => (managing = !managing)} aria-expanded={managing}>
      {managing ? '✕ Done editing' : '⚙ Manage teams'}
    </button>
  </div>

  {#snippet sideCard(slot: 'home' | 'away', team: Team | undefined, pts: number, sp: boolean, side: Side)}
    {@const won = side === 'a' ? result === 'a' : result === 'b'}
    {@const serves = hasLog && !done && serveSide === side}
    {@const rolling = !done && run.side === side && run.length >= 3}
    <div
      class="side"
      class:won
      class:atpoint={sp}
      class:deuce={deuce && !done}
      data-drop={team?.id ?? undefined}
      style={`--tc:${team?.color ?? 'var(--primary)'}`}
    >
      <button
        type="button"
        class="sidehead"
        onclick={() => (picking = picking === slot ? null : slot)}
        aria-label={`Choose the ${slot} team (currently ${team?.name ?? 'none'})`}
      >
        <span class="temoji sm" style={`--tc:${team?.color ?? 'var(--primary)'}`}>{team?.emoji ?? '🏐'}</span>
        <span class="pickname">{team?.name ?? 'Pick team'}</span>
        {#if serves}<span class="serve" title="Serving next">🏐</span>{/if}
        {#if (input.teams?.length ?? 0) > 2}<span class="caret" aria-hidden="true">▾</span>{/if}
      </button>

      {#if picking === slot && (input.teams?.length ?? 0) > 2}
        <div class="picklist" role="listbox">
          {#each input.teams as t (t.id)}
            {@const taken = t.id === (slot === 'home' ? input.away : input.home)}
            <button
              type="button"
              class="pickopt"
              class:on={t.id === team?.id}
              disabled={taken}
              onclick={() => {
                if (slot === 'home') input.home = t.id; else input.away = t.id;
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

      <div class="scorebox">
        <span class="sr-only">{team?.name ?? slot} points this set</span>
        {#key pts}
          <span class="bigscore tnum" class:goodnum={won}>{pts}</span>
        {/key}
      </div>

      <div class="tagline" aria-hidden="true">
        {#if won}
          <span class="tag win">✅ Set!</span>
        {:else if sp}
          <span class="tag point">🎯 Set pt</span>
        {:else if rolling}
          <span class="tag run">🔥 {run.length} in a row</span>
        {:else}
          <span class="tag ghost">&nbsp;</span>
        {/if}
      </div>

      <div class="ctrls">
        <button type="button" class="minus" onclick={() => sub(slot)} disabled={pts <= 0} aria-label={`Take a point back from ${team?.name ?? slot}`}>−1</button>
        <button type="button" class="plus" class:pt={sp} disabled={done} onclick={() => add(slot)} aria-label={`${sp ? 'Set point — ' : ''}Add a rally point for ${team?.name ?? slot}`}>
          <span class="plussign">＋1</span>
          <span class="pluslabel">{sp ? 'set point' : 'rally'}</span>
        </button>
      </div>
    </div>
  {/snippet}

  <div class="match">
    {@render sideCard('home', home, ptsHome, spHome, 'a')}
    <div class="net" aria-hidden="true"><span class="netbadge">🥅</span></div>
    {@render sideCard('away', away, ptsAway, spAway, 'b')}
  </div>

  <p class="status" class:good={call.tone === 'good'} class:warn={call.tone === 'warn'} role="status" aria-live="polite">
    {call.text}
  </p>

  <div class="livebar">
    <button
      type="button"
      class="undo"
      onclick={undoLast}
      disabled={!canUndo}
      aria-label={canUndo ? `Undo the last point for ${lastName}` : 'Undo last point'}
    >
      <span class="undoicon" aria-hidden="true">↩</span>
      <span>{canUndo ? `Undo · ${lastName}` : 'Undo last point'}</span>
    </button>
    <button type="button" class="swap" onclick={swapSides} aria-label="Swap which side is home and away">⇄ Swap sides</button>
  </div>

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

      <div class="manage-actions">
        <button type="button" class="addteam" onclick={addTeam} disabled={(input.teams?.length ?? 0) >= 8}>＋ Add team</button>
        <button type="button" class="shuffle" onclick={doShuffle} disabled={pool.length === 0} title="Randomly redeal every player across the teams">🎲 Shuffle teams</button>
      </div>

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
          {#if benchIds.length === 0}<span class="muted xs emptyhint">Everyone’s on a team</span>{/if}
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

  /* ── Match (two contesting sides, split by the net) ── */
  .match {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 8px;
    align-items: stretch;
  }
  /* The net between the two courts — a dashed centre line with a 🥅 badge. Pure flavour,
     aria-hidden, and never the only signal for anything. */
  .net {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 26px;
  }
  .net::before,
  .net::after {
    content: '';
    flex: 1;
    width: 0;
    border-left: 2px dashed color-mix(in srgb, var(--border) 80%, var(--muted));
  }
  .netbadge {
    font-size: 1.1rem;
    line-height: 1;
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
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease;
  }
  /* A won set reads as success — green, distinct from the standings leader's Crown Gold. */
  .side.won {
    border-color: color-mix(in srgb, var(--good) 55%, var(--border));
    background: color-mix(in srgb, var(--good) 12%, var(--surface-2));
    animation: vb-setpop 0.4s var(--ease-out, cubic-bezier(0.22, 0.61, 0.36, 1)) both;
  }
  /* Set point: an amber ring backs the 🎯 tag + copy (never colour alone). */
  .side.atpoint {
    border-color: color-mix(in srgb, var(--warn) 65%, var(--border));
    background: color-mix(in srgb, var(--warn) 7%, var(--surface-2));
    animation: vb-breathe 1.5s ease-in-out infinite;
  }
  /* Deuce: both cards breathe together — the tension is shared. */
  .side.deuce {
    border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
    animation: vb-breathe 1.7s ease-in-out infinite;
  }
  @keyframes vb-breathe {
    0%,
    100% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--warn) 30%, transparent);
    }
    50% {
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--warn) 16%, transparent);
    }
  }
  @keyframes vb-setpop {
    0% {
      transform: scale(0.97);
    }
    55% {
      transform: scale(1.02);
    }
    100% {
      transform: scale(1);
    }
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
  /* Serve indicator: the side that won the last rally serves next. A gentle bob draws the
     eye; the 🏐 + title carry the meaning, so motion is never the only cue. */
  .serve {
    flex: none;
    font-size: 0.95rem;
    line-height: 1;
    animation: vb-serve 1.4s ease-in-out infinite;
  }
  @keyframes vb-serve {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-2px);
    }
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

  /* The live courtside score is the hero of each card — big enough to read one-handed,
     outdoors, at arm's length. Tabular so it never jitters as it climbs; pops on change. */
  .scorebox {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 84px;
  }
  .bigscore {
    font-size: clamp(3.2rem, 14vw, 4.6rem);
    line-height: 1;
    font-weight: 800;
    letter-spacing: -0.02em;
    min-width: 2ch;
    text-align: center;
    animation: vb-pop 0.16s ease-out;
  }
  .goodnum {
    color: var(--good);
  }
  @keyframes vb-pop {
    from {
      transform: scale(1.14);
    }
    to {
      transform: scale(1);
    }
  }

  /* Reserved tag row so the card never reflows as tags come and go. */
  .tagline {
    display: flex;
    justify-content: center;
    min-height: 1.6rem;
  }
  .tag {
    flex: none;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--border);
    white-space: nowrap;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .tag.ghost {
    visibility: hidden;
  }
  .tag.win {
    color: var(--good);
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
    background: color-mix(in srgb, var(--good) 12%, transparent);
  }
  .tag.point {
    color: var(--warn);
    border-color: color-mix(in srgb, var(--warn) 55%, var(--border));
    background: color-mix(in srgb, var(--warn) 14%, transparent);
  }
  .tag.run {
    color: var(--text);
    border-color: color-mix(in srgb, var(--bad) 45%, var(--border));
    background: color-mix(in srgb, var(--bad) 12%, transparent);
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
    width: 52px;
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
  /* The rally tap: large and thumb-friendly, but a surface control — the one Royal Violet
     primary on this screen stays the shell's "Save round" button below the editor. */
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
  .plus:hover:not(:disabled) {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--text) 6%, var(--surface-3));
  }
  .plus:active:not(:disabled) {
    transform: translateY(1px);
  }
  .plus:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .plussign {
    font-size: 1.35rem;
    font-variant-numeric: tabular-nums;
  }
  .pluslabel {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .plus.pt {
    border-color: color-mix(in srgb, var(--warn) 55%, var(--border));
  }
  .plus.pt .pluslabel {
    color: var(--warn);
  }

  /* Undo + swap sit together under the courts, as low-emphasis surface controls. */
  .livebar {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }
  .undo {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 46px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    transition:
      transform 0.05s ease,
      background 0.15s ease,
      border-color 0.15s ease;
  }
  .undo:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--primary);
  }
  .undo:active:not(:disabled) {
    transform: translateY(1px);
  }
  .undo:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .undoicon {
    font-size: 1.1rem;
  }
  .swap {
    flex: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--muted);
    font: inherit;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    padding: 8px 12px;
    min-height: 46px;
  }
  .swap:hover {
    color: var(--text);
    border-color: var(--primary);
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
    .bigscore,
    .serve,
    .side.won {
      animation: none;
    }
    /* Keep a static ring so set-point / deuce tension still reads without motion. */
    .side.atpoint,
    .side.deuce {
      animation: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--warn) 22%, transparent);
    }
  }

  .manage-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .addteam,
  .shuffle {
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
  .addteam:hover:not(:disabled),
  .shuffle:hover:not(:disabled) {
    border-color: var(--primary);
  }
  .addteam:disabled,
  .shuffle:disabled {
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
  .undo:focus-visible,
  .swap:focus-visible,
  .shuffle:focus-visible,
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
    .bigscore {
      font-size: 2.6rem;
    }
  }
</style>
