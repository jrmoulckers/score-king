<script lang="ts">
  import { getModule } from '../lib/games/registry';
  import { defaultConfig } from '../lib/types';
  import { games, createGame } from '../lib/stores/games';
  import { navigate, link } from '../lib/router';
  import { showToast } from '../lib/stores/toast';
  import PlayerSelect from '../lib/components/PlayerSelect.svelte';
  import ConfigForm from '../lib/components/ConfigForm.svelte';

  let { type }: { type: string } = $props();
  const module = $derived(getModule(type));

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
    $games.filter((g) => g.status === 'active' && g.type === type),
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
</script>

{#if !module}
  <div class="empty">
    <h2>Unknown game</h2>
    <p class="muted">There's no scorer named "{type}".</p>
    <a class="btn primary" href="/" use:link>Back to games</a>
  </div>
{:else}
  <div class="row" style="gap: 12px; margin: 10px 4px 4px">
    <span style="font-size: 2rem">{module.emoji}</span>
    <div>
      <h1 style="margin: 0">{module.name}</h1>
      <div class="muted">{module.tagline}</div>
    </div>
  </div>

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
  </div>
{/if}

<style>
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
</style>
