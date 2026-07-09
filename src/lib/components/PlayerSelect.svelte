<script lang="ts">
  import { activePlayers as roster, createPlayer, generatePlayer } from '../stores/players';
  import type { ID } from '../types';
  import Avatar from './Avatar.svelte';

  let {
    selected = $bindable([]),
    min = 0,
    max = 12,
  }: { selected: ID[]; min?: number; max?: number } = $props();

  let newName = $state('');

  function toggle(id: ID) {
    if (selected.includes(id)) selected = selected.filter((x) => x !== id);
    else if (selected.length < max) selected = [...selected, id];
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    const p = await createPlayer(name);
    newName = '';
    if (selected.length < max) selected = [...selected, p.id];
  }

  async function addRandom() {
    const p = await generatePlayer();
    if (selected.length < max) selected = [...selected, p.id];
  }
</script>

<div class="stack">
  <div class="chips">
    {#each $roster as p (p.id)}
      <button
        type="button"
        class="chip"
        class:on={selected.includes(p.id)}
        onclick={() => toggle(p.id)}
      >
        <Avatar name={p.name} color={p.color} size={22} />
        {p.name}
        {#if selected.includes(p.id)}<span class="ord">{selected.indexOf(p.id) + 1}</span>{/if}
      </button>
    {/each}
    {#if $roster.length === 0}
      <span class="muted">{min > 1 ? `No players yet — add at least ${min} below.` : 'No players yet — add some below.'}</span>
    {/if}
  </div>

  <form class="row" onsubmit={(e) => { e.preventDefault(); add(); }}>
    <input class="grow" type="text" placeholder="Add a player…" bind:value={newName} />
    <button class="btn" type="button" onclick={addRandom} aria-label="Add a random player" title="Surprise me">🎲</button>
    <button class="btn" type="submit">Add</button>
  </form>
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px 7px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font-weight: 600;
  }
  .chip.on {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 18%, var(--surface-2));
  }
  .ord {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--primary);
    color: #fff;
    font-size: 0.72rem;
  }
</style>
