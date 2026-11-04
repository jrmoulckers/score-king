<script lang="ts">
  import { activePlayers as roster, createPlayer, generatePlayer } from '../stores/players';
  import { reportStorageError } from '../stores/storage';
  import { showToast } from '../stores/toast';
  import type { ID } from '../types';
  import { MAX_NAME_LEN } from '../util';
  import Avatar from './Avatar.svelte';

  let {
    selected = $bindable([]),
    min = 0,
    max = 12,
  }: { selected: ID[]; min?: number; max?: number } = $props();

  let newName = $state('');
  let adding = $state(false);
  const capacityHintId = $props.id();
  const atCapacity = $derived(selected.length >= max);

  function toggle(id: ID) {
    if (selected.includes(id)) selected = selected.filter((x) => x !== id);
    else if (selected.length < max) selected = [...selected, id];
  }

  async function add(random = false) {
    const name = newName.trim();
    if (adding || (!random && !name)) return;
    adding = true;
    try {
      const p = await (random ? generatePlayer() : createPlayer(name));
      if (!random) newName = '';
      if (selected.length < max) selected = [...selected, p.id];
      else {
        showToast(
          `${p.name} was added to Players, but not selected. Deselect players to make room.`,
          6000,
        );
      }
    } catch {
      reportStorageError();
    } finally {
      adding = false;
    }
  }
</script>

<div class="stack">
  <div class="chips">
    {#each $roster as p (p.id)}
      <button
        type="button"
        class="chip"
        class:on={selected.includes(p.id)}
        aria-pressed={selected.includes(p.id)}
        disabled={atCapacity && !selected.includes(p.id)}
        aria-describedby={atCapacity ? capacityHintId : undefined}
        onclick={() => toggle(p.id)}
      >
        <Avatar
          name={p.name}
          color={p.color}
          playerId={p.id}
          appearance={p.appearance}
          size={22}
          decorative
        />
        <span class="name">{p.name}</span>
        {#if selected.includes(p.id)}<span class="ord" aria-hidden="true"
            >{selected.indexOf(p.id) + 1}</span
          >{/if}
      </button>
    {/each}
    {#if $roster.length === 0}
      <span class="muted"
        >{min > 1
          ? `No players yet — add at least ${min} below.`
          : 'No players yet — add some below.'}</span
      >
    {/if}
  </div>

  {#if atCapacity}
    <p class="muted" id={capacityHintId} role="status">
      This setup allows at most {max} player{max === 1 ? '' : 's'}. Deselect players to change your
      selection. New players are saved to Players without being selected.
    </p>
  {/if}

  <form
    class="row"
    aria-describedby={atCapacity ? capacityHintId : undefined}
    aria-busy={adding}
    onsubmit={(e) => {
      e.preventDefault();
      add();
    }}
  >
    <input
      class="grow"
      type="text"
      placeholder="Add a player…"
      aria-label="Add a player by name"
      maxlength={MAX_NAME_LEN}
      bind:value={newName}
      disabled={adding}
    />
    <button
      class="btn"
      type="button"
      onclick={() => add(true)}
      disabled={adding}
      aria-label="Add a random player"
      title="Surprise me">🎲</button
    >
    <button class="btn" type="submit" disabled={adding || !newName.trim()}>Add</button>
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
    min-width: 0;
    max-width: 100%;
    min-height: 46px;
    padding: 7px 14px 7px 10px;
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
  .name {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .ord {
    display: inline-flex;
    flex: none;
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
