<script lang="ts">
  import type { ID, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import {
    TEAMS,
    TEAM_META,
    teamCounts,
    tally,
    type CodenamesInput,
    type Team,
  } from './logic';

  let { input = $bindable(), ctx }: { input: CodenamesInput; ctx: RoundContext } = $props();

  const trackAssassin = $derived(ctx.config.trackAssassin !== false);
  const playerIds = $derived(ctx.players.map((p) => p.id));
  const counts = $derived(teamCounts(input.teams, playerIds));
  const prior = $derived(tally(ctx.rounds));
  const priorGames = $derived(prior.red + prior.blue);
  /** Round 0 has no carried teams, so the roster is front-and-centre; later it tucks away. */
  const setupOpen = $derived(ctx.roundIndex === 0);

  function teamOf(id: ID): Team {
    return input.teams[id] === 'blue' ? 'blue' : 'red';
  }
  function flip(id: ID) {
    input.teams[id] = teamOf(id) === 'red' ? 'blue' : 'red';
  }
</script>

<div class="stack">
  <div class="tallybar" class:first={priorGames === 0}>
    {#if priorGames > 0}
      <span class="tlabel">Match so far</span>
      <span class="tscore" aria-label="Red {prior.red}, Blue {prior.blue}">
        <span class="tteam">🔴 {prior.red}</span>
        <span class="tdash" aria-hidden="true">–</span>
        <span class="tteam">{prior.blue} 🔵</span>
      </span>
    {:else}
      <span class="tlabel">🕵️ First game of the match</span>
    {/if}
  </div>

  <div class="field">
    <span class="flabel">Who won this game?</span>
    <div class="winner" role="group" aria-label="Winning team">
      {#each TEAMS as t (t)}
        <button
          type="button"
          class="teamwin {t}"
          class:on={input.winner === t}
          aria-pressed={input.winner === t}
          onclick={() => (input.winner = t)}
        >
          <span class="wemoji" aria-hidden="true">{TEAM_META[t].emoji}</span>
          <span class="wname">{TEAM_META[t].label}</span>
          <span class="wtag">{input.winner === t ? '✓ won' : 'tap if they won'}</span>
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
          onclick={() => (input.ending = 'agents')}
        >
          🎉 Found all agents
        </button>
        <button
          type="button"
          class="endbtn assassin"
          class:on={input.ending === 'assassin'}
          aria-pressed={input.ending === 'assassin'}
          onclick={() => (input.ending = 'assassin')}
        >
          💀 Assassin
        </button>
      </div>
      {#if input.ending === 'assassin'}
        <p class="hint">💀 The losing team revealed the assassin — an instant loss.</p>
      {/if}
    </div>
  {/if}

  {#snippet roster()}
    <div class="stack roster">
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

  /* Match tally */
  .tallybar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .tallybar.first {
    justify-content: center;
  }
  .tlabel {
    font-size: 0.85rem;
    color: var(--muted);
    font-weight: 600;
  }
  .tscore {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .tdash {
    color: var(--muted);
  }

  /* Winner chooser — the hero choice */
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

  /* Team roster */
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

  @media (prefers-reduced-motion: reduce) {
    .teamwin,
    .endbtn,
    .teamtog {
      transition: none;
    }
  }
</style>
