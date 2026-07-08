<script lang="ts">
  import { onMount } from 'svelte';
  import { pathStore, parseRoute, link } from './lib/router';
  import { toast } from './lib/stores/toast';
  import { settings } from './lib/stores/settings';
  import Home from './pages/Home.svelte';
  import Players from './pages/Players.svelte';
  import History from './pages/History.svelte';
  import Stats from './pages/Stats.svelte';
  import Court from './pages/Court.svelte';
  import Wrapped from './pages/Wrapped.svelte';
  import Settings from './pages/Settings.svelte';
  import Accessibility from './pages/Accessibility.svelte';
  import GameplaySettings from './pages/GameplaySettings.svelte';
  import ManageGames from './pages/ManageGames.svelte';
  import Browse from './pages/Browse.svelte';
  import GameType from './pages/GameType.svelte';
  import GamePlay from './pages/GamePlay.svelte';
  import CustomGameEdit from './pages/CustomGameEdit.svelte';
  import LiveJoin from './pages/LiveJoin.svelte';
  import NearbyJoin from './pages/NearbyJoin.svelte';
  import Recap from './pages/Recap.svelte';
  import NotFound from './pages/NotFound.svelte';
  import SyncBubble from './lib/components/SyncBubble.svelte';

  let current = $state(window.location.pathname || '/');
  onMount(() => pathStore.subscribe((v) => (current = v)));
  const route = $derived(parseRoute(current));

  // Which primary nav item is active — shared by the mobile tab bar and the
  // desktop sidebar rail so both stay in lockstep.
  const navActive = $derived({
    games: ['home', 'gametype', 'customedit', 'managegames', 'browse'].includes(route.name),
    players: route.name === 'players',
    history: route.name === 'history',
    stats: ['stats', 'court', 'wrapped', 'tonight'].includes(route.name),
  });

  let veiled = $state(false);
  onMount(() => {
    const onVis = () => {
      if (
        document.visibilityState === 'hidden' &&
        $settings.privacyGuard &&
        route.name === 'play'
      ) {
        veiled = true;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });

  function reveal() {
    veiled = false;
  }
</script>

{#snippet navLinks()}
  <a href="/" use:link class:active={navActive.games}><span class="ico" aria-hidden="true">🏠</span><span class="lbl">Games</span></a>
  <a href="/players" use:link class:active={navActive.players}><span class="ico" aria-hidden="true">👥</span><span class="lbl">Players</span></a>
  <a href="/history" use:link class:active={navActive.history}><span class="ico" aria-hidden="true">📜</span><span class="lbl">History</span></a>
  <a href="/stats" use:link class:active={navActive.stats}><span class="ico" aria-hidden="true">📊</span><span class="lbl">Stats</span></a>
{/snippet}

<div class="shell">
  <aside class="sidebar">
    <a class="brand sidebar-brand" href="/" use:link>
      <img src="/favicon.svg" alt="" />
      <span>Score King</span>
    </a>
    <nav class="sidebar-nav" aria-label="Primary">
      {@render navLinks()}
    </nav>
    <div class="sidebar-foot">
      <SyncBubble />
      <a class="iconbtn" href="/settings" use:link aria-label="Settings" title="Settings">⚙️</a>
    </div>
  </aside>

  <div class="viewport">
    <header class="appbar">
      <a class="brand" href="/" use:link>
        <img src="/favicon.svg" alt="" />
        Score King
      </a>
      <div class="appbar-actions">
        <SyncBubble />
        <a class="iconbtn" href="/settings" use:link aria-label="Settings" title="Settings">⚙️</a>
      </div>
    </header>

<main class="app">
  {#if route.name === 'home'}
    <Home />
  {:else if route.name === 'players'}
    <Players />
  {:else if route.name === 'history'}
    <History />
  {:else if route.name === 'stats'}
    <Stats />
  {:else if route.name === 'court'}
    <Court />
  {:else if route.name === 'wrapped'}
    <Wrapped />
  {:else if route.name === 'tonight'}
    <Wrapped initialPreset="tonight" />
  {:else if route.name === 'settings'}
    <Settings />
  {:else if route.name === 'accessibility'}
    <Accessibility />
  {:else if route.name === 'gameplay'}
    <GameplaySettings />
  {:else if route.name === 'managegames'}
    <ManageGames />
  {:else if route.name === 'browse'}
    <Browse />
  {:else if route.name === 'gametype'}
    <GameType type={route.params.type} />
  {:else if route.name === 'customedit'}
    {#key route.params.id ?? 'new'}
      <CustomGameEdit id={route.params.id} />
    {/key}
  {:else if route.name === 'play'}
    {#key route.params.id}
      <GamePlay id={route.params.id} />
    {/key}
  {:else if route.name === 'join'}
    {#key route.params.code}
      <LiveJoin code={route.params.code} />
    {/key}
  {:else if route.name === 'nearby'}
    <NearbyJoin />
  {:else if route.name === 'recap'}
    {#key current}
      <Recap />
    {/key}
  {:else}
    <NotFound />
  {/if}
</main>

    <nav class="tabbar" aria-label="Primary">
      {@render navLinks()}
    </nav>
  </div>
</div>

{#if $toast}
  <div class="toast" role="status" aria-live="polite">
    <span>{$toast.message}</span>
    {#if $toast.action}
      <button class="toast-action" onclick={$toast.action.run}>{$toast.action.label}</button>
    {/if}
  </div>
{/if}

{#if veiled}
  <button class="veil" onclick={reveal} aria-label="Reveal scores">
    <span class="veil-card">
      <span class="veil-emoji" aria-hidden="true">🙈</span>
      <strong>Scores hidden</strong>
      <span class="veil-hint">Tap anywhere to reveal</span>
    </span>
  </button>
{/if}

<style>
  .veil {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 0;
    width: 100%;
    cursor: pointer;
    color: var(--text);
    background: color-mix(in srgb, var(--bg) 62%, transparent);
    backdrop-filter: blur(18px) saturate(120%);
    -webkit-backdrop-filter: blur(18px) saturate(120%);
    animation: veil-in 0.18s ease-out;
  }
  .veil-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 26px 30px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--surface) 70%, transparent);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
  }
  .veil-emoji {
    font-size: 2.4rem;
    line-height: 1;
  }
  .veil-card strong {
    font-size: 1.05rem;
  }
  .veil-hint {
    color: var(--muted);
    font-size: 0.9rem;
  }
  @keyframes veil-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
