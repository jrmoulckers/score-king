<script lang="ts">
  import { getModule } from '../lib/games/registry';
  import { defaultConfig } from '../lib/types';
  import { activeGames, createGame, games } from '../lib/stores/games';
  import { activePlayers } from '../lib/stores/players';
  import {
    customGameDefs,
    removeCustomGame,
    restoreCustomGame,
    saveCustomGame,
  } from '../lib/stores/customGames';
  import { isCustomType, duplicateDef } from '../lib/games/custom/types';
  import { editCustomHref } from '../lib/stores/catalog';
  import { navigate, link } from '../lib/router';
  import { showToast, showActionToast } from '../lib/stores/toast';
  import PlayerSelect from '../lib/components/PlayerSelect.svelte';
  import ConfigForm from '../lib/components/ConfigForm.svelte';
  import BackLink from '../lib/components/BackLink.svelte';
  import GamePresets from '../lib/components/GamePresets.svelte';

  let { type }: { type: string } = $props();
  // Re-resolve when custom defs load so a deep-link to /def_… lands once IndexedDB answers.
  const module = $derived.by(() => {
    void $customGameDefs;
    return getModule(type);
  });

  // The editable definition behind a custom type (undefined for built-ins), plus whether any
  // game of this type was ever played — which turns Delete into an archive (retain history).
  const def = $derived($customGameDefs.find((d) => d.id === type));
  const isCustom = $derived(isCustomType(type));
  const playedCount = $derived($games.filter((g) => g.type === type).length);

  let selected = $state<string[]>([]);
  let config = $state<Record<string, any>>({});
  let lastInitFor = '';

  $effect(() => {
    if (module && lastInitFor !== module.id) {
      config = defaultConfig(module.configFields);
      lastInitFor = module.id;
    }
  });

  const activeOfType = $derived(
    $activeGames.filter((g) => g.status === 'active' && g.type === type),
  );

  async function start() {
    if (!module) return;
    if (selected.length < module.minPlayers) {
      showToast(`Need at least ${module.minPlayers} players.`);
      return;
    }
    if (selected.length > module.maxPlayers) {
      showToast(`At most ${module.maxPlayers} players.`);
      return;
    }
    const g = await createGame(type, [...selected], { ...config });
    navigate(`/play/${g.id}`);
  }

  // Clone-and-tweak: save a fresh copy, then open it in the builder to adjust.
  async function duplicate() {
    if (!def) return;
    const copy = duplicateDef(def);
    await saveCustomGame(copy);
    showToast('Duplicated — tweak your copy.');
    navigate(editCustomHref(copy.id));
  }

  // Delete a custom type. Played types archive (history/stats keep the right scoring); unplayed
  // ones hard-delete. Either way it's undoable from the toast — the app's standard pattern.
  async function del() {
    if (!def) return;
    const inUse = playedCount > 0;
    const snapshot = { ...def, columns: def.columns.map((c) => ({ ...c })) };
    await removeCustomGame(def.id, inUse);
    const label = inUse ? `${def.name} archived` : `${def.name} deleted`;
    showActionToast(label, 'Undo', () => {
      if (inUse) void restoreCustomGame(snapshot.id);
      else void saveCustomGame(snapshot);
    });
    navigate('/');
  }
</script>

{#if !module}
  <div class="empty">
    <h2>Unknown game</h2>
    <p class="muted">There's no scorer named "{type}".</p>
    <a class="btn primary" href="/" use:link>Back to games</a>
  </div>
{:else}
  <BackLink href="/" label="Games" />
  <div class="row" style="gap: 12px; margin: 10px 4px 4px">
    <span style="font-size: 2rem">{module.emoji}</span>
    <div>
      <h1 style="margin: 0">{module.name}</h1>
      <div class="muted">{module.tagline}</div>
    </div>
  </div>

  {#if isCustom && def}
    <div class="authoring" aria-label="Custom game actions">
      <a class="btn small" href={editCustomHref(type)} use:link>Edit</a>
      <button class="btn small ghost" type="button" onclick={duplicate}>Duplicate</button>
      <button class="btn small danger" type="button" onclick={del}>Delete</button>
    </div>
  {/if}

  {#if activeOfType.length}
    <div class="section-title">In progress</div>
    <div class="stack">
      {#each activeOfType as g (g.id)}
        <a class="card row spread resume" href={`/play/${g.id}`} use:link>
          <span>Round {g.roundCount + 1} · {g.playerIds.length} players</span>
          <span class="pill">Resume →</span>
        </a>
      {/each}
    </div>
  {/if}

  <div class="section-title">New game</div>
  <div class="card stack">
    <GamePresets
      {type}
      fields={module.configFields}
      max={module.maxPlayers}
      bind:selected
      bind:config
    />
    <hr />
    <div>
      <div class="fieldlabel">Players ({module.minPlayers}–{module.maxPlayers})</div>
      <PlayerSelect bind:selected max={module.maxPlayers} min={module.minPlayers} />
    </div>
    {#if module.configFields?.length}
      <hr />
      <ConfigForm fields={module.configFields} bind:config />
    {/if}
    <button class="btn primary block" onclick={start} disabled={selected.length < module.minPlayers}>
      Start game
    </button>
    {#if selected.length < module.minPlayers}
      <p class="startneed muted sm" role="status">
        {#if $activePlayers.length === 0}
          Add {module.minPlayers} player{module.minPlayers === 1 ? '' : 's'} above to start your first game.
        {:else}
          Pick {module.minPlayers - selected.length} more player{module.minPlayers - selected.length === 1 ? '' : 's'} to start.
        {/if}
      </p>
    {/if}
  </div>
{/if}

<style>
  .authoring {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 6px 4px 2px;
  }
  .authoring .btn {
    text-decoration: none;
  }
  .resume {
    text-decoration: none;
    color: inherit;
  }
  hr {
    border: none;
    border-top: 1px solid var(--border);
    width: 100%;
    margin: 4px 0;
  }
  .startneed {
    margin: 0;
    text-align: center;
  }
  .sm {
    font-size: 0.85rem;
  }
</style>
