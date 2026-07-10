<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import { botc } from './index';
  import PhaseSky from './PhaseSky.svelte';
  import ExecutionToll from './ExecutionToll.svelte';
  import TownVerdict from './TownVerdict.svelte';
  import RoleReveal from './RoleReveal.svelte';
  import type { RevealData } from './RoleReveal.svelte';
  import type { BotcInput, Nomination, Team } from './logic';
  import {
    aliveCount,
    demonStatus,
    evilKnowledge,
    evilWinsIn,
    ghostVotesLeft,
    isDemonRole,
    phaseEmoji,
    phaseKind,
    phaseLabel,
    roleTeam,
    roleType,
    rolesFor,
    teamCount,
    teamOfType,
    voteThreshold,
  } from './logic';

  let { input = $bindable(), ctx }: { input: BotcInput; ctx: RoundContext } = $props();

  const script = $derived(String(ctx.config.script ?? 'tb'));
  const roleList = $derived(rolesFor(script));
  const kind = $derived(phaseKind(ctx.roundIndex));
  const label = $derived(phaseLabel(ctx.roundIndex));
  const emoji = $derived(phaseEmoji(ctx.roundIndex));
  const alive = $derived(aliveCount(input.states));
  const dead = $derived(ctx.players.length - alive);
  const threshold = $derived(voteThreshold(alive));
  const goodN = $derived(teamCount(input.states, 'good'));
  const evilN = $derived(teamCount(input.states, 'evil'));
  const ghosts = $derived(ghostVotesLeft(input.states));
  const demonState = $derived(demonStatus(input.states));
  const evilIn = $derived(evilWinsIn(input.states));

  let showGuide = $state(false);
  let expanded = $state<Record<string, boolean>>({});
  let reveal = $state<RevealData | null>(null);

  // Animation tokens — bumping one replays its overlay (each is reduced-motion-safe).
  let skyToken = $state(0);
  let tollToken = $state(0);
  let verdictToken = $state(0);
  let verdictTeam = $state<Team>('good');

  // Open each phase with its dusk↔dawn sky (once per editor mount / phase).
  $effect(() => {
    ctx.roundIndex;
    skyToken += 1;
  });

  const nameOf = (id: string | null): string =>
    ctx.players.find((p) => p.id === id)?.name ?? '—';

  function toggleAlive(id: string) {
    const st = input.states[id];
    st.alive = !st.alive;
    if (st.alive) st.ghostUsed = false;
    haptic('tick');
  }
  function setTeam(id: string, team: Team) {
    const st = input.states[id];
    st.team = team;
    if (team === 'good') st.isDemon = false; // the Demon is always evil
    haptic('tick');
  }
  function onRole(id: string, value: string) {
    const st = input.states[id];
    st.role = value;
    // Auto-follow a known role: a Demon marks the Demon; any other known role
    // clears it. Off-script text leaves the Storyteller's manual flags alone.
    if (isDemonRole(value, script)) {
      st.team = 'evil';
      st.isDemon = true;
    } else {
      const t = roleType(value, script);
      if (t) {
        st.team = teamOfType(t);
        st.isDemon = false;
      } else {
        const rt = roleTeam(value, script);
        if (rt) st.team = rt;
      }
    }
  }
  function toggleDemon(id: string) {
    const st = input.states[id];
    st.isDemon = !st.isDemon;
    if (st.isDemon) st.team = 'evil';
    haptic('tick');
  }
  function toggleGhost(id: string) {
    input.states[id].ghostUsed = !input.states[id].ghostUsed;
    haptic('tick');
  }
  function toggleNotes(id: string) {
    expanded[id] = !expanded[id];
  }

  function openReveal(id: string) {
    const p = ctx.players.find((x) => x.id === id);
    const st = input.states[id];
    if (!p || !st) return;
    const k = evilKnowledge(input.states, id);
    const demonName = k.demonId && k.demonId !== id ? nameOf(k.demonId) : null;
    reveal = {
      name: p.name,
      color: p.color,
      role: st.role,
      team: st.team,
      isDemon: !!st.isDemon,
      fellowEvil: k.fellowEvil.filter((eid) => eid !== k.demonId).map((eid) => nameOf(eid)),
      demonName,
    };
    haptic('tick');
  }

  function addNomination() {
    const nom: Nomination = { nominatorId: null, nomineeId: null, votes: 0, executed: false };
    input.nominations = [...input.nominations, nom];
  }
  function removeNomination(target: Nomination) {
    input.nominations = input.nominations.filter((n) => n !== target);
  }
  function toggleExecuted(nom: Nomination) {
    nom.executed = !nom.executed;
    if (nom.executed) {
      tollToken += 1;
      haptic('save');
    }
  }
  function setResult(team: Team) {
    const next = input.result === team ? null : team;
    input.result = next;
    if (next) {
      verdictTeam = next;
      verdictToken += 1;
      haptic('win');
    }
  }
</script>

<datalist id="botc-roles">
  {#each roleList as r (r.name)}
    <option value={r.name}></option>
  {/each}
</datalist>

<div class="stage">
  <PhaseSky token={skyToken} {kind} />

  <div class="stack">
    <!-- Town Square — the Storyteller's glance -->
    <div class="phase">
      <span class="phase-name">{emoji} {label}</span>
      <button type="button" class="btn small ghost" onclick={() => (showGuide = !showGuide)}>
        {showGuide ? 'Hide' : 'Guide'}
      </button>
    </div>

    <div class="square" role="group" aria-label="Town at a glance">
      <span class="stat"><span class="sn">{alive}</span> alive</span>
      <span class="dot" aria-hidden="true">·</span>
      <span class="stat">💀 <span class="sn">{dead}</span> dead</span>
      <span class="dot" aria-hidden="true">·</span>
      <span class="stat">😇 <span class="sn">{goodN}</span></span>
      <span class="stat">😈 <span class="sn">{evilN}</span></span>
      {#if ghosts > 0}
        <span class="dot" aria-hidden="true">·</span>
        <span class="stat">🗳️ <span class="sn">{ghosts}</span> ghost {ghosts === 1 ? 'vote' : 'votes'}</span>
      {/if}
    </div>

    <!-- Win-condition nudges (hints only — your word is final) -->
    {#if demonState === 'fallen'}
      <p class="nudge good">🌅 The Demon has fallen — Good wins.</p>
    {:else if demonState === 'alive'}
      <p class="nudge">🕯️ Good wins the moment the Demon dies.</p>
    {/if}
    {#if evilIn > 0 && evilIn <= 2}
      <p class="nudge evil">😈 Evil wins with {evilIn} more {evilIn === 1 ? 'death' : 'deaths'} — 2 left alive.</p>
    {:else if alive <= 2 && ctx.players.length > 2}
      <p class="nudge evil">😈 Only two stand — Evil takes the town.</p>
    {/if}

    {#if showGuide}
      <pre class="help">{botc.help}</pre>
    {/if}

    <p class="hint">
      {#if kind === 'night'}
        🌙 Resolve the night in secret, then tap a seat to mark who died.
      {:else}
        ☀️ Dawn breaks — the town talks, nominates, and votes. Log the block below.
      {/if}
    </p>

    <!-- The Grimoire: one card per seat, in circle order -->
    {#each ctx.players as p, i (p.id)}
      {@const st = input.states[p.id]}
      {#if st}
        <div class="prow" class:dead={!st.alive} class:demon={st.isDemon}>
          <div class="row spread top">
            <span class="who">
              <span class="seat" aria-label={`Seat ${i + 1}`}>{i + 1}</span>
              <Avatar name={p.name} color={p.color} size={26} />
              <strong class="nm">{p.name}</strong>
              {#if st.isDemon}<span class="dtag" title="The Demon">😈</span>{/if}
            </span>
            <button
              type="button"
              class="life"
              class:isdead={!st.alive}
              aria-pressed={!st.alive}
              onclick={() => toggleAlive(p.id)}
            >
              {st.alive ? '🌿 Alive' : '💀 Dead'}
            </button>
          </div>

          <div class="controls">
            <input
              class="role"
              type="text"
              list="botc-roles"
              placeholder="Character…"
              aria-label={`${p.name}'s character`}
              value={st.role}
              oninput={(e) => onRole(p.id, e.currentTarget.value)}
            />
            <div class="team" role="group" aria-label={`${p.name}'s team`}>
              <button type="button" class:on={st.team === 'good'} onclick={() => setTeam(p.id, 'good')}>
                😇 Good
              </button>
              <button type="button" class:on={st.team === 'evil'} onclick={() => setTeam(p.id, 'evil')}>
                😈 Evil
              </button>
            </div>
          </div>

          <div class="acts">
            <button type="button" class="act" onclick={() => openReveal(p.id)}>🎭 Reveal</button>
            <button
              type="button"
              class="act"
              class:on={st.isDemon}
              aria-pressed={st.isDemon}
              onclick={() => toggleDemon(p.id)}
            >😈 Demon</button>
            <button
              type="button"
              class="act"
              class:on={expanded[p.id]}
              aria-expanded={!!expanded[p.id]}
              onclick={() => toggleNotes(p.id)}
            >📝 Notes</button>
            {#if !st.alive}
              <button
                type="button"
                class="act ghostvote"
                class:used={st.ghostUsed}
                aria-pressed={st.ghostUsed}
                onclick={() => toggleGhost(p.id)}
              >🗳️ Ghost {st.ghostUsed ? 'used' : 'ready'}</button>
            {/if}
          </div>

          {#if expanded[p.id]}
            <div class="notes">
              <input
                class="note-in"
                type="text"
                list="botc-roles"
                placeholder="Suspected as… (who they might be)"
                aria-label={`${p.name}'s suspected role`}
                bind:value={st.suspect}
              />
              <input
                class="note-in"
                type="text"
                placeholder="Reminder (poisoned, drunk, red herring…)"
                aria-label={`${p.name}'s reminder`}
                bind:value={st.reminder}
              />
            </div>
          {/if}
        </div>
      {/if}
    {/each}

    <!-- Day: nominations & votes -->
    {#if kind === 'day'}
      <div class="noms">
        <ExecutionToll token={tollToken} />
        <div class="row spread">
          <span class="section-lbl">Nominations &amp; votes</span>
          <span class="pill">Majority: {threshold}</span>
        </div>

        {#each input.nominations as nom (nom)}
          {@const reaches = (Number(nom.votes) || 0) >= threshold}
          <div class="nom" class:executed={nom.executed}>
            <div class="nom-line">
              <select bind:value={nom.nomineeId} aria-label="Nominated player">
                <option value={null}>— on the block —</option>
                {#each ctx.players as p (p.id)}
                  <option value={p.id}>{p.name}</option>
                {/each}
              </select>
              <button
                type="button"
                class="rm"
                aria-label="Remove nomination"
                title="Remove"
                onclick={() => removeNomination(nom)}
              >✕</button>
            </div>
            <div class="nom-line by">
              <span class="by-lbl">by</span>
              <select bind:value={nom.nominatorId} aria-label="Nominating player">
                <option value={null}>— nominator (optional) —</option>
                {#each ctx.players as p (p.id)}
                  <option value={p.id}>{p.name}</option>
                {/each}
              </select>
            </div>
            <div class="row spread nom-tally">
              <span class="votes-lbl">
                Votes
                <span class="reach" class:hit={reaches}>{reaches ? '· reaches majority' : `· needs ${threshold}`}</span>
              </span>
              <span class="row" style="gap: 10px">
                <Stepper bind:value={nom.votes} min={0} max={ctx.players.length} />
                <button
                  type="button"
                  class="exec"
                  class:on={nom.executed}
                  aria-pressed={nom.executed}
                  onclick={() => toggleExecuted(nom)}
                >⚖️ Executed</button>
              </span>
            </div>
          </div>
        {/each}

        <button type="button" class="btn block ghost add" onclick={addNomination}>
          ＋ Add nomination
        </button>
      </div>
    {/if}

    <!-- Result recorder -->
    <div class="result">
      <TownVerdict token={verdictToken} team={verdictTeam} />
      <span class="section-lbl">End the game</span>
      <div class="result-btns">
        <button type="button" class="res good" class:on={input.result === 'good'} aria-pressed={input.result === 'good'} onclick={() => setResult('good')}>
          😇 Good wins
        </button>
        <button type="button" class="res evil" class:on={input.result === 'evil'} aria-pressed={input.result === 'evil'} onclick={() => setResult('evil')}>
          😈 Evil wins
        </button>
      </div>
      {#if input.result}
        <p class="recorded">
          🏁 {input.result === 'good' ? 'Good' : 'Evil'} recorded — Save round, then <strong>Finish &amp; record winner</strong>.
        </p>
      {/if}
    </div>

    <input
      class="note"
      type="text"
      placeholder="Storyteller note for this phase (optional)…"
      aria-label="Storyteller note"
      bind:value={input.note}
    />
  </div>
</div>

<RoleReveal {reveal} onclose={() => (reveal = null)} />

<style>
  .stage {
    position: relative;
  }
  .stack {
    position: relative;
    z-index: 1;
  }
  .phase {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
  .phase-name {
    font-weight: 800;
    font-size: 1.05rem;
  }

  /* Town Square — the glance line */
  .square {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
    padding: 8px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 0.85rem;
    color: var(--muted);
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--text);
  }
  .sn {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .dot {
    color: var(--muted);
  }

  .nudge {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
    padding: 8px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .nudge.good {
    color: var(--good);
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
  }
  .nudge.evil {
    color: var(--bad);
    border-color: color-mix(in srgb, var(--bad) 45%, var(--border));
  }

  .hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .help {
    white-space: pre-wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
    font-size: 0.82rem;
    line-height: 1.5;
    margin: 0;
    font-family: inherit;
    color: var(--muted);
  }

  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .prow.dead {
    background: var(--surface);
  }
  .prow.demon {
    border-color: color-mix(in srgb, var(--bad) 40%, var(--border));
  }
  .top {
    align-items: center;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .seat {
    flex: none;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .prow.dead .nm {
    color: var(--muted);
  }
  .dtag {
    flex: none;
    font-size: 0.9rem;
    line-height: 1;
  }

  .life {
    flex: none;
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--text);
    font-weight: 700;
    cursor: pointer;
  }
  .life.isdead {
    background: var(--surface-2);
    color: var(--muted);
    border-style: dashed;
  }

  .controls {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .role {
    flex: 1 1 150px;
    min-width: 120px;
  }
  .team {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .team button {
    min-height: 38px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted);
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .team button.on {
    background: var(--surface-3);
    color: var(--text);
  }

  /* Per-seat secondary actions */
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .act {
    min-height: 38px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .act.on {
    border-style: solid;
    color: var(--text);
    background: var(--surface-3);
  }
  .act.ghostvote {
    border-style: dashed;
  }
  .act.ghostvote.used {
    border-style: solid;
    color: var(--text);
    background: var(--surface-2);
  }

  .notes {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 2px;
  }
  .note-in {
    font-size: 0.85rem;
  }

  .section-lbl {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    font-weight: 600;
  }

  .noms,
  .result {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
  }
  .nom {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .nom.executed {
    border-color: var(--border);
    background: var(--surface-3);
  }
  .nom-line {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .nom-line.by {
    gap: 6px;
  }
  .by-lbl {
    color: var(--muted);
    font-size: 0.8rem;
    flex: none;
  }
  .rm {
    flex: none;
    width: 42px;
    height: 42px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    font-weight: 700;
  }
  .nom-tally {
    flex-wrap: wrap;
    gap: 8px;
  }
  .votes-lbl {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .reach {
    font-weight: 700;
  }
  .reach.hit {
    color: var(--text);
  }
  .exec {
    min-height: 46px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--muted);
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .exec.on {
    background: var(--surface-3);
    color: var(--text);
    border-color: var(--text);
  }
  .add {
    color: var(--muted);
  }

  .result-btns {
    display: flex;
    gap: 8px;
  }
  .res {
    flex: 1 1 0;
    min-height: 46px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-weight: 700;
    cursor: pointer;
  }
  .res.on {
    background: var(--surface-3);
    border-color: var(--text);
    box-shadow: inset 0 0 0 1px var(--text);
  }
  .recorded {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .note {
    font-size: 0.9rem;
  }

  .life:focus-visible,
  .team button:focus-visible,
  .act:focus-visible,
  .rm:focus-visible,
  .exec:focus-visible,
  .res:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }

  .life,
  .team button,
  .act,
  .exec,
  .res {
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .life,
    .team button,
    .act,
    .exec,
    .res {
      transition: none;
    }
  }
</style>
