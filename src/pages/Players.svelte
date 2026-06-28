<script lang="ts">
  import {
    players,
    createPlayer,
    renamePlayer,
    recolorPlayer,
    removePlayer,
  } from '../lib/stores/players';
  import { PALETTE } from '../lib/util';
  import Avatar from '../lib/components/Avatar.svelte';
  import type { Player } from '../lib/types';

  let newName = $state('');
  let editingId = $state<string | null>(null);
  let editName = $state('');

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
  async function remove(p: Player) {
    if (confirm(`Delete ${p.name}? Past games keep their recorded scores.`)) {
      await removePlayer(p.id);
    }
  }
</script>

<h1>Players</h1>

<form class="row" onsubmit={(e) => { e.preventDefault(); add(); }} style="margin-bottom: 14px">
  <input class="grow" type="text" placeholder="New player name…" bind:value={newName} />
  <button class="btn primary" type="submit">Add</button>
</form>

{#if $players.length === 0}
  <div class="empty">No players yet — add your regulars above.</div>
{:else}
  <div class="stack">
    {#each $players as p (p.id)}
      <div class="card">
        <div class="row spread">
          <span class="row" style="gap: 10px">
            <Avatar name={p.name} color={p.color} size={34} />
            {#if editingId === p.id}
              <input type="text" bind:value={editName} style="width: auto" />
            {:else}
              <strong>{p.name}</strong>
            {/if}
          </span>
          <span class="row" style="gap: 6px">
            {#if editingId === p.id}
              <button class="btn small primary" onclick={() => saveEdit(p)}>Save</button>
              <button class="btn small ghost" onclick={() => (editingId = null)}>Cancel</button>
            {:else}
              <button class="iconbtn" onclick={() => startEdit(p)} aria-label="Rename">✎</button>
              <button class="iconbtn" onclick={() => remove(p)} aria-label="Delete">🗑</button>
            {/if}
          </span>
        </div>
        <div class="row wrap" style="gap: 6px; margin-top: 10px">
          {#each PALETTE as c (c)}
            <button
              class="dot"
              class:sel={p.color === c}
              style="background: {c}"
              onclick={() => recolorPlayer(p, c)}
              aria-label="Set colour"
            ></button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
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
</style>
