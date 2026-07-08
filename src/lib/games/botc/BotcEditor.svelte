<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { botc } from './index';
  import type { BotcInput, Nomination, Team } from './logic';
  import {
    aliveCount,
    phaseEmoji,
    phaseKind,
    phaseLabel,
    roleTeam,
    rolesFor,
    teamCount,
    voteThreshold,
  } from './logic';

  let { input = $bindable(), ctx }: { input: BotcInput; ctx: RoundContext } = $props();

  const script = $derived(String(ctx.config.script ?? 'tb'));
  const roleList = $derived(rolesFor(script));
  const kind = $derived(phaseKind(ctx.roundIndex));
  const label = $derived(phaseLabel(ctx.roundIndex));
  const emoji = $derived(phaseEmoji(ctx.roundIndex));
  const alive = $derived(aliveCount(input.states));
  const threshold = $derived(voteThreshold(alive));
  const goodN = $derived(teamCount(input.states, 'good'));
  const evilN = $derived(teamCount(input.states, 'evil'));

  let showGuide = $state(false);

  const nameOf = (id: string | null): string =>
    ctx.players.find((p) => p.id === id)?.name ?? '—';

  function toggleAlive(id: string) {
    const st = input.states[id];
    st.alive = !st.alive;
    if (st.alive) st.ghostUsed = false;
  }
  function setTeam(id: string, team: Team) {
    input.states[id].team = team;
  }
  function onRole(id: string, value: string) {
    const st = input.states[id];
    st.role = value;
    const t = roleTeam(value, script);
    if (t) st.team = t;
  }
  function toggleGhost(id: string) {
    input.states[id].ghostUsed = !input.states[id].ghostUsed;
  }

  function addNomination() {
    const nom: Nomination = { nominatorId: null, nomineeId: null, votes: 0, executed: false };
    input.nominations = [...input.nominations, nom];
  }
  function removeNomination(target: Nomination) {
    input.nominations = input.nominations.filter((n) => n !== target);
  }
  function setResult(team: Team) {
    input.result = input.result === team ? null : team;
  }
</script>

<datalist id="botc-roles">
  {#each roleList as r (r.name)}
    <option value={r.name}></option>
  {/each}
</datalist>

<div class="stack">
  <!-- Phase header -->
  <div class="phase">
    <span class="phase-name">{emoji} {label}</span>
    <span class="row" style="gap: 6px">
      <span class="pill">🌿 {alive} alive</span>
      <span class="pill">😇 {goodN} · 😈 {evilN}</span>
      <button type="button" class="btn small ghost" onclick={() => (showGuide = !showGuide)}>
        {showGuide ? 'Hide' : 'Guide'}
      </button>
    </span>
  </div>

  {#if showGuide}
    <pre class="help">{botc.help}</pre>
  {/if}

  <p class="hint">
    {#if kind === 'night'}
      🌙 Resolve the night in secret, then tap a player to mark who died.
    {:else}
      ☀️ Town talks, nominates, and votes — log the block below.
    {/if}
  </p>

  <!-- Roster -->
  {#each ctx.players as p (p.id)}
    {@const st = input.states[p.id]}
    {#if st}
      <div class="prow" class:dead={!st.alive}>
        <div class="row spread">
          <span class="who">
            <Avatar name={p.name} color={p.color} size={28} />
            <strong class="nm">{p.name}</strong>
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

        {#if !st.alive}
          <button
            type="button"
            class="ghostvote"
            class:used={st.ghostUsed}
            aria-pressed={st.ghostUsed}
            onclick={() => toggleGhost(p.id)}
          >
            🗳️ Ghost vote {st.ghostUsed ? 'used' : 'available'}
          </button>
        {/if}
      </div>
    {/if}
  {/each}

  <!-- Day: nominations & votes -->
  {#if kind === 'day'}
    <div class="noms">
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
                onclick={() => (nom.executed = !nom.executed)}
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
    placeholder="Storyteller note (optional)…"
    aria-label="Storyteller note"
    bind:value={input.note}
  />
</div>

<style>
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
  .hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .help {
    white-space: pre-wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
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
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .prow.dead {
    background: var(--surface);
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .prow.dead .nm {
    color: var(--muted);
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
    border-radius: 7px;
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

  .ghostvote {
    align-self: flex-start;
    min-height: 38px;
    padding: 0 12px;
    border: 1px dashed var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    font-weight: 600;
    cursor: pointer;
  }
  .ghostvote.used {
    border-style: solid;
    color: var(--text);
    background: var(--surface-2);
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
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
  }
  .nom {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .nom.executed {
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, var(--surface-2));
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
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
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
  .ghostvote:focus-visible,
  .rm:focus-visible,
  .exec:focus-visible,
  .res:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }

  .life,
  .team button,
  .ghostvote,
  .exec,
  .res {
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .life,
    .team button,
    .ghostvote,
    .exec,
    .res {
      transition: none;
    }
  }
</style>
