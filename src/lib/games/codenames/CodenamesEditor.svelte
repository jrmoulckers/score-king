<script lang="ts">
  import type { ID, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { haptic } from '../../haptics';
  import AssassinReveal from './AssassinReveal.svelte';
  import {
    TEAMS,
    TEAM_META,
    teamCounts,
    tally,
    seriesState,
    streak,
    balanceTeams,
    swapTeams,
    shuffleTeams,
    codeword,
    type CodenamesInput,
    type Team,
  } from './logic';

  let { input = $bindable(), ctx }: { input: CodenamesInput; ctx: RoundContext } = $props();

  // Backfill the optional spymaster desks for rounds saved before they existed.
  if (input.spymasters == null) input.spymasters = { red: null, blue: null };

  const trackAssassin = $derived(ctx.config.trackAssassin !== false);
  const winTarget = $derived(Math.max(0, Math.round(Number(ctx.config.winTarget) || 0)));
  const playerIds = $derived(ctx.players.map((p) => p.id));
  const counts = $derived(teamCounts(input.teams, playerIds));
  const prior = $derived(tally(ctx.rounds));
  const priorGames = $derived(prior.red + prior.blue);
  const series = $derived(seriesState(prior, winTarget));
  const run = $derived(streak(ctx.rounds));
  const word = $derived(codeword(ctx.game.id));
  /** Round 0 has no carried teams, so the roster is front-and-centre; later it tucks away. */
  const setupOpen = $derived(ctx.roundIndex === 0);
  let showSpies = $state(false);

  function teamOf(id: ID): Team {
    return input.teams[id] === 'blue' ? 'blue' : 'red';
  }
  const redPlayers = $derived(ctx.players.filter((p) => teamOf(p.id) === 'red'));
  const bluePlayers = $derived(ctx.players.filter((p) => teamOf(p.id) === 'blue'));

  // A stable 5×5 agent grid for the spy motif: 9 red · 8 blue · 7 neutral · 1 assassin,
  // arranged by a game-seeded shuffle so it's the same board all match. Pure decoration.
  const grid = $derived.by(() => {
    const kinds = [
      ...Array(9).fill('red'),
      ...Array(8).fill('blue'),
      ...Array(7).fill('neutral'),
      'assassin',
    ];
    let h = 0;
    const s = String(ctx.game.id);
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    const rand = () => {
      h = (Math.imul(h, 1103515245) + 12345) | 0;
      return ((h >>> 0) % 1000) / 1000;
    };
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    return kinds;
  });

  // Series pips per side: `target` slots, filled up to the games that side has banked.
  const redPips = $derived(
    series.target > 0 ? Array.from({ length: series.target }, (_, i) => i < prior.red) : [],
  );
  const bluePips = $derived(
    series.target > 0 ? Array.from({ length: series.target }, (_, i) => i < prior.blue) : [],
  );

  // The assassin's-reveal fires when the ending flips to 💀 with a winner set (never on mount).
  let strikeToken = $state(0);
  let strikePrimed = false;
  let lastAssassin = false;
  $effect(() => {
    const isAssassin = input.ending === 'assassin' && input.winner !== null;
    if (!strikePrimed) {
      strikePrimed = true;
      lastAssassin = isAssassin;
      return;
    }
    if (isAssassin && !lastAssassin) {
      strikeToken += 1;
      haptic('win');
    }
    lastAssassin = isAssassin;
  });

  function pickWinner(t: Team) {
    input.winner = t;
    haptic('tick');
  }
  function setEnding(e: CodenamesInput['ending']) {
    input.ending = e;
    haptic('tick');
  }
  function flip(id: ID) {
    input.teams = { ...input.teams, [id]: teamOf(id) === 'red' ? 'blue' : 'red' };
    // A player leaving a desk can't keep running it.
    if (input.spymasters?.red === id || input.spymasters?.blue === id) {
      input.spymasters = {
        red: input.spymasters.red === id ? null : (input.spymasters?.red ?? null),
        blue: input.spymasters.blue === id ? null : (input.spymasters?.blue ?? null),
      };
    }
    haptic('tick');
  }
  function doBalance() {
    input.teams = balanceTeams(playerIds);
    input.spymasters = { red: null, blue: null };
    haptic('save');
  }
  function doSwap() {
    input.teams = swapTeams(input.teams);
    input.spymasters = { red: input.spymasters?.blue ?? null, blue: input.spymasters?.red ?? null };
    haptic('save');
  }
  function doShuffle() {
    input.teams = shuffleTeams(playerIds);
    input.spymasters = { red: null, blue: null };
    haptic('save');
  }
  function setSpy(team: Team, id: ID) {
    const cur = input.spymasters ?? { red: null, blue: null };
    input.spymasters = { ...cur, [team]: cur[team] === id ? null : id };
    haptic('tick');
  }
</script>

<div class="stack">
  <!-- Series scoreboard — the Red vs Blue head-to-head, dramatized. -->
  <div class="series" class:tense={(series.matchPoint || series.decider) && !series.over}>
    <div class="grid" aria-hidden="true">
      {#each grid as k, i (i)}
        <span class="tile {k}"></span>
      {/each}
    </div>
    <div class="series-body">
      <div class="row spread head">
        <span class="over">🕵️ Codeword · {word}</span>
        <span class="over muted">
          {#if series.target > 0}Best of {series.target * 2 - 1}{:else}Open match{/if}
        </span>
      </div>

      {#if priorGames > 0}
        <div class="hh" aria-label="Red {prior.red}, Blue {prior.blue}">
          <span class="side red" class:ahead={series.leader === 'red'}>
            <span class="semoji" aria-hidden="true">🔴</span>
            <span class="snum tnum">{prior.red}</span>
          </span>
          <span class="dash" aria-hidden="true">–</span>
          <span class="side blue" class:ahead={series.leader === 'blue'}>
            <span class="snum tnum">{prior.blue}</span>
            <span class="semoji" aria-hidden="true">🔵</span>
          </span>
        </div>
        {#if series.leader}
          <p class="lead-line">
            {TEAM_META[series.leader].emoji} <strong>{TEAM_META[series.leader].label}</strong> leads the match
          </p>
        {:else}
          <p class="lead-line muted">All square — {prior.red} apiece</p>
        {/if}
      {:else}
        <p class="firstline">🎙️ First game of the match — spymasters, give your clues.</p>
      {/if}

      {#if series.target > 0}
        <div class="pips" aria-hidden="true">
          <span class="prow red">{#each redPips as on, i (i)}<i class:on></i>{/each}</span>
          <span class="pspacer"></span>
          <span class="prow blue">{#each bluePips as on, i (i)}<i class:on></i>{/each}</span>
        </div>
      {/if}

      {#if run.team && run.length >= 2}
        <p class="streak" aria-live="polite">
          {TEAM_META[run.team].emoji} <strong>{TEAM_META[run.team].label}</strong> on a
          <span class="tnum">{run.length}</span>-game run 🔥
        </p>
      {/if}

      {#if !series.over && (series.matchPoint || series.decider)}
        <p class="matchpoint" aria-live="polite">
          {#if series.decider}
            🎯 <strong>Decider</strong> — the next game takes the series.
          {:else if series.leader}
            🎯 <strong>{TEAM_META[series.leader].label} match point</strong> — one game from the crown.
          {/if}
        </p>
      {/if}
    </div>
  </div>

  <!-- The stage hosts the hero winner choice, the ending, and the assassin reveal overlay. -->
  <div class="stage">
    <AssassinReveal token={strikeToken} />

    <div class="field">
      <span class="flabel">Who cracked the grid?</span>
      <div class="winner" role="group" aria-label="Winning team">
        {#each TEAMS as t (t)}
          <button
            type="button"
            class="teamwin {t}"
            class:on={input.winner === t}
            aria-pressed={input.winner === t}
            onclick={() => pickWinner(t)}
          >
            <span class="wemoji" aria-hidden="true">{TEAM_META[t].emoji}</span>
            <span class="wname">{TEAM_META[t].label}</span>
            <span class="wtag">{input.winner === t ? '✓ agents found' : 'tap if they won'}</span>
          </button>
        {/each}
      </div>
    </div>

    {#if trackAssassin}
      <div class="field">
        <span class="flabel">How did it end?</span>
        <div class="ending" role="group" aria-label="How the game ended">
          <button
            type="button"
            class="endbtn agents"
            class:on={input.ending === 'agents'}
            aria-pressed={input.ending === 'agents'}
            onclick={() => setEnding('agents')}
          >
            🎉 Found all agents
          </button>
          <button
            type="button"
            class="endbtn assassin"
            class:on={input.ending === 'assassin'}
            aria-pressed={input.ending === 'assassin'}
            onclick={() => setEnding('assassin')}
          >
            💀 Assassin
          </button>
        </div>
        {#if input.ending === 'assassin'}
          <p class="hint">💀 The losing team touched the assassin — cover blown, instant loss.</p>
        {/if}
      </div>
    {/if}
  </div>

  {#snippet quickAssign()}
    <div class="quick" role="group" aria-label="Quick team assignment">
      <button type="button" class="qbtn" onclick={doShuffle}>🔀 Shuffle</button>
      <button type="button" class="qbtn" onclick={doBalance}>⚖️ Balance</button>
      <button type="button" class="qbtn" onclick={doSwap}>⇄ Swap sides</button>
    </div>
  {/snippet}

  {#snippet roster()}
    <div class="stack roster">
      {@render quickAssign()}
      {#each ctx.players as p (p.id)}
        {@const team = teamOf(p.id)}
        <div class="prow">
          <span class="who">
            <Avatar name={p.name} color={p.color} />
            <span class="pname">{p.name}</span>
          </span>
          <button
            type="button"
            class="teamtog {team}"
            onclick={() => flip(p.id)}
            aria-label="{p.name} is on {TEAM_META[team].label} team. Tap to switch."
          >
            <span class="dot" aria-hidden="true">{TEAM_META[team].emoji}</span>
            <span class="tname">{TEAM_META[team].label}</span>
            <span class="swap" aria-hidden="true">⇄</span>
          </button>
        </div>
      {/each}
    </div>
  {/snippet}

  {#if setupOpen}
    <div class="field">
      <span class="flabel">Teams · 🔴 {counts.red} vs 🔵 {counts.blue}</span>
      {@render roster()}
    </div>
  {:else}
    <details class="teams-details">
      <summary>
        <span>Teams</span>
        <span class="summ">🔴 {counts.red} vs {counts.blue} 🔵 · tap to adjust</span>
      </summary>
      {@render roster()}
    </details>
  {/if}

  <!-- Optional: log who ran each spymaster desk, for the spymaster win-rate stat. -->
  <details class="teams-details spies" bind:open={showSpies}>
    <summary>
      <span>🎙️ Spymasters</span>
      <span class="summ">
        {#if input.spymasters?.red || input.spymasters?.blue}logged · tap to edit{:else}optional{/if}
      </span>
    </summary>
    <div class="spybody">
      {#each TEAMS as t (t)}
        {@const roster = t === 'red' ? redPlayers : bluePlayers}
        <div class="spyrow">
          <span class="spylabel {t}">{TEAM_META[t].emoji} {TEAM_META[t].label}</span>
          {#if roster.length === 0}
            <span class="muted small">No one on this team yet</span>
          {:else}
            <div class="chips">
              {#each roster as p (p.id)}
                <button
                  type="button"
                  class="chip {t}"
                  class:on={input.spymasters?.[t] === p.id}
                  aria-pressed={input.spymasters?.[t] === p.id}
                  onclick={() => setSpy(t, p.id)}
                >{p.name}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
      <p class="muted small">The spymaster gives one-word clues — logging them unlocks a win-rate stat.</p>
    </div>
  </details>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .flabel {
    font-size: 0.9rem;
    color: var(--muted);
    font-weight: 600;
  }

  /* ── Series scoreboard ─────────────────────────────────────────────── */
  .series {
    position: relative;
    overflow: hidden;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .series.tense {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }
  .series-body {
    position: relative;
    z-index: 1;
  }
  /* The 5×5 agent grid motif — a faint spy costume behind the score. Decoration only. */
  .grid {
    position: absolute;
    top: 10px;
    right: 12px;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 2px;
    width: 62px;
    opacity: 0.16;
    pointer-events: none;
    z-index: 0;
  }
  .tile {
    aspect-ratio: 1;
    background: var(--muted);
  }
  .tile.red {
    background: #e5484d;
  }
  .tile.blue {
    background: #4c7dff;
  }
  .tile.neutral {
    background: #c9b458;
  }
  .tile.assassin {
    background: #1b1b1f;
  }
  .head {
    margin-bottom: 4px;
  }
  .over {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text);
  }
  .over.muted {
    color: var(--muted);
  }
  .hh {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 2px 0;
  }
  .side {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    opacity: 0.72;
  }
  .side.ahead {
    opacity: 1;
  }
  .snum {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
  }
  .side.ahead .snum {
    text-shadow: 0 0 1px currentColor;
  }
  .side.red {
    color: #e5484d;
  }
  .side.blue {
    color: #4c7dff;
  }
  .semoji {
    font-size: 1rem;
  }
  .dash {
    color: var(--muted);
    font-weight: 700;
  }
  .lead-line,
  .firstline {
    margin: 6px 0 0;
    text-align: center;
    font-size: 0.9rem;
  }
  .lead-line.muted,
  .firstline {
    color: var(--muted);
  }

  .pips {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 8px;
  }
  .prow {
    display: inline-flex;
    gap: 5px;
  }
  .prow i {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    border: 1.5px solid currentColor;
    opacity: 0.4;
  }
  .prow i.on {
    opacity: 1;
    background: currentColor;
  }
  .prow.red {
    color: #e5484d;
  }
  .prow.blue {
    color: #4c7dff;
  }
  .pspacer {
    width: 1px;
    height: 14px;
    background: var(--border);
  }

  .streak,
  .matchpoint {
    margin: 8px 0 0;
    text-align: center;
    font-size: 0.85rem;
    color: var(--text);
  }
  .matchpoint {
    font-weight: 600;
  }

  /* ── Winner + ending stage (hosts the assassin reveal) ─────────────── */
  .stage {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .winner {
    display: flex;
    gap: 10px;
  }
  .teamwin {
    --tc: var(--muted);
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-height: 72px;
    padding: 12px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.05s ease;
  }
  .teamwin.red {
    --tc: #e5484d;
  }
  .teamwin.blue {
    --tc: #4c7dff;
  }
  .teamwin:hover {
    border-color: var(--tc);
  }
  .teamwin:active {
    transform: translateY(1px);
  }
  .teamwin.on {
    border-color: var(--tc);
    background: color-mix(in srgb, var(--tc) 16%, var(--surface-2));
  }
  .teamwin:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .wemoji {
    font-size: 1.5rem;
    line-height: 1;
  }
  .wname {
    font-weight: 700;
    font-size: 1.05rem;
  }
  .wtag {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .teamwin.on .wtag {
    color: var(--tc);
  }

  /* Ending toggle — semantic green (clean) vs coral (assassin) */
  .ending {
    display: flex;
    gap: 10px;
  }
  .endbtn {
    flex: 1 1 0;
    min-height: 46px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .endbtn:active {
    transform: translateY(1px);
  }
  .endbtn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .endbtn.agents.on {
    border-color: color-mix(in srgb, var(--good) 60%, var(--border));
    background: color-mix(in srgb, var(--good) 16%, var(--surface-2));
  }
  .endbtn.assassin.on {
    border-color: color-mix(in srgb, var(--bad) 60%, var(--border));
    background: color-mix(in srgb, var(--bad) 16%, var(--surface-2));
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.4;
  }

  /* ── Fast team assignment ──────────────────────────────────────────── */
  .quick {
    display: flex;
    gap: 8px;
  }
  .qbtn {
    flex: 1 1 0;
    min-height: 40px;
    padding: 8px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    color: var(--text);
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .qbtn:hover {
    border-color: var(--primary);
  }
  .qbtn:active {
    transform: translateY(1px);
  }
  .qbtn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  /* ── Team roster ───────────────────────────────────────────────────── */
  .roster {
    gap: 8px;
  }
  .prow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .pname {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .teamtog {
    --tc: #e5484d;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    flex: none;
    min-height: 46px;
    padding: 0 12px;
    border: 1px solid var(--tc);
    border-radius: 999px;
    background: color-mix(in srgb, var(--tc) 12%, var(--surface));
    color: var(--text);
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .teamtog.blue {
    --tc: #4c7dff;
  }
  .teamtog:active {
    transform: translateY(1px);
  }
  .teamtog:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .swap {
    color: var(--muted);
    font-weight: 400;
  }

  .teams-details {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0 12px;
  }
  .teams-details summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 46px;
    cursor: pointer;
    font-weight: 700;
    list-style: none;
  }
  .teams-details summary::-webkit-details-marker {
    display: none;
  }
  .teams-details .summ {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .teams-details[open] summary {
    border-bottom: 1px solid var(--border);
    margin-bottom: 10px;
  }
  .teams-details .roster {
    padding-bottom: 12px;
  }

  /* ── Spymaster log ─────────────────────────────────────────────────── */
  .spybody {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 12px;
  }
  .spyrow {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .spylabel {
    font-weight: 700;
    font-size: 0.85rem;
  }
  .spylabel.red {
    color: #e5484d;
  }
  .spylabel.blue {
    color: #4c7dff;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    --tc: #e5484d;
    min-height: 38px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .chip.blue {
    --tc: #4c7dff;
  }
  .chip.on {
    border-color: var(--tc);
    background: color-mix(in srgb, var(--tc) 16%, var(--surface));
  }
  .chip:active {
    transform: translateY(1px);
  }
  .chip:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .small {
    font-size: 0.8rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .teamwin,
    .endbtn,
    .teamtog,
    .qbtn,
    .chip {
      transition: none;
    }
  }
</style>
