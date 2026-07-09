<script lang="ts">
  import {
    players,
    activePlayers,
    createPlayer,
    generatePlayer,
    renamePlayer,
    recolorPlayer,
    archivePlayer,
    restorePlayer,
    removePlayer,
  } from '../lib/stores/players';
  import { leadMember, setLeadMember } from '../lib/stores/identity';
  import { PALETTE, resolvePlayerColor } from '../lib/util';
  import { settings } from '../lib/stores/settings';
  import Avatar from '../lib/components/Avatar.svelte';
  import type { Player } from '../lib/types';

  let newName = $state('');
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let showArchived = $state(false);

  const archived = $derived($players.filter((p) => p.archived));

  async function add() {
    const n = newName.trim();
    if (!n) return;
    await createPlayer(n);
    newName = '';
  }
  function startEdit(p: Player) {
    editingId = p.id;
    editName = p.name;
  }
  async function saveEdit(p: Player) {
    if (editName.trim()) await renamePlayer(p, editName);
    editingId = null;
  }
  function toggleLead(p: Player) {
    setLeadMember($leadMember?.id === p.id ? null : p.id);
  }
  async function archive(p: Player) {
    if ($leadMember?.id === p.id) setLeadMember(null);
    await archivePlayer(p);
  }
  async function remove(p: Player) {
    if (confirm(`Delete ${p.name} for good? Past games keep their recorded scores.`)) {
      if ($leadMember?.id === p.id) setLeadMember(null);
      await removePlayer(p.id);
    }
  }
</script>

<h1>Players</h1>

<form class="row" onsubmit={(e) => { e.preventDefault(); add(); }} style="margin-bottom: 14px">
  <input class="grow" type="text" placeholder="New player name…" aria-label="New player name" bind:value={newName} />
  <button class="iconbtn" type="button" onclick={generatePlayer} aria-label="Generate a player" title="Surprise me with a name">🎲</button>
  <button class="btn primary" type="submit">Add</button>
</form>

{#if $activePlayers.length === 0 && archived.length === 0}
  <div class="empty firstrun">
    <div class="firstrun-emoji" aria-hidden="true">👥</div>
    <p><strong>Add your regulars once.</strong></p>
    <p class="muted">Players are shared across every game and leaderboard — add them here and
    they'll be ready to pick whenever you start a game. Tap 🎲 for a surprise name.</p>
  </div>
{:else if $activePlayers.length > 0}
  <div class="player-grid">
    {#each $activePlayers as p (p.id)}
      <div class="card" class:lead={$leadMember?.id === p.id} class:editing={editingId === p.id}>
        <div class="row spread">
          <span class="row grow" style="gap: 10px; min-width: 0">
            <Avatar name={p.name} color={p.color} size={34} />
            {#if editingId === p.id}
              <input class="grow" type="text" bind:value={editName} aria-label="Player name" />
            {:else}
              <span class="who">
                <strong>{p.name}</strong>
                {#if $leadMember?.id === p.id || !p.claimed}
                  <span class="tags">
                    {#if $leadMember?.id === p.id}<span class="tag lead-tag">👑 On this device</span>{/if}
                    {#if !p.claimed}<span class="tag muted-tag">Unclaimed</span>{/if}
                  </span>
                {/if}
              </span>
            {/if}
          </span>
          {#if editingId !== p.id}
            <span class="row" style="gap: 6px">
              <button
                class="iconbtn"
                class:on={$leadMember?.id === p.id}
                onclick={() => toggleLead(p)}
                aria-pressed={$leadMember?.id === p.id}
                aria-label={$leadMember?.id === p.id ? 'Stop playing on this device' : 'Play as this member on this device'}
                title="Play on this device"
              >👑</button>
              <button class="iconbtn" onclick={() => startEdit(p)} aria-label="Edit player" title="Rename & recolour">✎</button>
            </span>
          {/if}
        </div>
        {#if editingId === p.id}
          <div class="editpanel">
            <div class="row wrap swatches" role="group" aria-label="Player colour">
              {#each PALETTE as c (c)}
                <button
                  class="dot"
                  class:sel={p.color === c}
                  style="background: {resolvePlayerColor(c, $settings.colorBlind)}"
                  onclick={() => recolorPlayer(p, c)}
                  aria-label="Set colour"
                  aria-pressed={p.color === c}
                ></button>
              {/each}
            </div>
            <div class="row spread editactions">
              <button class="btn small ghost danger" onclick={() => archive(p)}>Archive</button>
              <span class="row" style="gap: 6px">
                <button class="btn small ghost" onclick={() => (editingId = null)}>Cancel</button>
                <button class="btn small primary" onclick={() => saveEdit(p)}>Save</button>
              </span>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

{#if archived.length > 0}
  <button
    class="archtoggle"
    onclick={() => (showArchived = !showArchived)}
    aria-expanded={showArchived}
  >{showArchived ? '▾' : '▸'} Archived ({archived.length})</button>
  {#if showArchived}
    <div class="stack">
      {#each archived as p (p.id)}
        <div class="card arch">
          <div class="row spread">
            <span class="row" style="gap: 10px">
              <Avatar name={p.name} color={p.color} size={28} />
              <span class="muted">{p.name}</span>
            </span>
            <span class="row" style="gap: 6px">
              <button class="btn small ghost" onclick={() => restorePlayer(p)}>Restore</button>
              <button class="iconbtn" onclick={() => remove(p)} aria-label="Delete for good">🗑</button>
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .player-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    align-items: start;
  }
  @media (min-width: 640px) {
    .player-grid {
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    }
  }
  .card {
    transition: border-color 0.15s ease;
  }
  .editpanel {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .swatches {
    gap: 8px;
  }
  .dot {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.12s ease;
  }
  .dot:hover {
    transform: scale(1.12);
  }
  .dot.sel {
    border-color: var(--text);
  }
  .card.lead {
    border-color: var(--accent);
  }
  .iconbtn.on {
    border-color: var(--text);
    background: var(--surface-3);
  }
  .who {
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .who strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .card,
    .dot {
      transition: none;
    }
    .dot:hover {
      transform: none;
    }
  }
  .tags {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tag {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 1px 8px;
    border-radius: 999px;
  }
  .lead-tag {
    color: var(--accent-ink);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }
  .muted-tag {
    color: var(--muted);
    border: 1px solid var(--border);
  }
  .archtoggle {
    display: block;
    margin-top: 14px;
    padding: 10px 2px;
    background: none;
    border: none;
    color: var(--muted);
    font-weight: 600;
    font-size: 0.92rem;
    cursor: pointer;
  }
  .card.arch {
    opacity: 0.82;
  }
  .firstrun {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .firstrun p {
    margin: 0;
    max-width: 46ch;
  }
  .firstrun-emoji {
    font-size: 2.2rem;
    line-height: 1;
    margin-bottom: 4px;
  }
</style>
