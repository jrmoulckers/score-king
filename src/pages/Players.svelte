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
  <input class="grow" type="text" placeholder="New player name…" bind:value={newName} />
  <button class="iconbtn" type="button" onclick={generatePlayer} aria-label="Generate a player" title="Surprise me with a name">🎲</button>
  <button class="btn primary" type="submit">Add</button>
</form>

{#if $activePlayers.length === 0 && archived.length === 0}
  <div class="empty">No players yet — add your regulars above.</div>
{:else if $activePlayers.length > 0}
  <div class="stack">
    {#each $activePlayers as p (p.id)}
      <div class="card" class:lead={$leadMember?.id === p.id}>
        <div class="row spread">
          <span class="row" style="gap: 10px">
            <Avatar name={p.name} color={p.color} size={34} />
            {#if editingId === p.id}
              <input type="text" bind:value={editName} style="width: auto" />
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
          <span class="row" style="gap: 6px">
            {#if editingId === p.id}
              <button class="btn small primary" onclick={() => saveEdit(p)}>Save</button>
              <button class="btn small ghost" onclick={() => (editingId = null)}>Cancel</button>
            {:else}
              <button
                class="iconbtn"
                class:on={$leadMember?.id === p.id}
                onclick={() => toggleLead(p)}
                aria-pressed={$leadMember?.id === p.id}
                aria-label={$leadMember?.id === p.id ? 'Stop playing on this device' : 'Play as this member on this device'}
                title="Play on this device"
              >👑</button>
              <button class="iconbtn" onclick={() => startEdit(p)} aria-label="Rename">✎</button>
              <button class="iconbtn" onclick={() => archive(p)} aria-label="Archive">🗄</button>
            {/if}
          </span>
        </div>
        <div class="row wrap" style="gap: 6px; margin-top: 10px">
          {#each PALETTE as c (c)}
            <button
              class="dot"
              class:sel={p.color === c}
              style="background: {resolvePlayerColor(c, $settings.colorBlind)}"
              onclick={() => recolorPlayer(p, c)}
              aria-label="Set colour"
            ></button>
          {/each}
        </div>
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
  .dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
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
</style>
