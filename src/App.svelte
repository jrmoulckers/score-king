<script lang="ts">
  import { onMount } from 'svelte';
  import { pathStore, parseRoute, link } from './lib/router';
  import { toast } from './lib/stores/toast';
  import Home from './pages/Home.svelte';
  import Players from './pages/Players.svelte';
  import History from './pages/History.svelte';
  import Stats from './pages/Stats.svelte';
  import Settings from './pages/Settings.svelte';
  import GameType from './pages/GameType.svelte';
  import GamePlay from './pages/GamePlay.svelte';
  import NotFound from './pages/NotFound.svelte';
  import SyncBubble from './lib/components/SyncBubble.svelte';

  let current = $state(window.location.pathname || '/');
  onMount(() => pathStore.subscribe((v) => (current = v)));
  const route = $derived(parseRoute(current));
</script>

<header class="appbar">
  <a class="brand" href="/" use:link>
    <img src="/favicon.svg" alt="" />
    Score King
  </a>
  <a class="iconbtn" href="/settings" use:link aria-label="Settings" title="Settings">⚙️</a>
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
  {:else if route.name === 'settings'}
    <Settings />
  {:else if route.name === 'gametype'}
    <GameType type={route.params.type} />
  {:else if route.name === 'play'}
    {#key route.params.id}
      <GamePlay id={route.params.id} />
    {/key}
  {:else}
    <NotFound />
  {/if}
</main>

<nav class="tabbar">
  <a href="/" use:link class:active={route.name === 'home' || route.name === 'gametype'}>
    <span class="ico">🏠</span>Games
  </a>
  <a href="/players" use:link class:active={route.name === 'players'}>
    <span class="ico">👥</span>Players
  </a>
  <a href="/history" use:link class:active={route.name === 'history'}>
    <span class="ico">📜</span>History
  </a>
  <a href="/stats" use:link class:active={route.name === 'stats'}>
    <span class="ico">📊</span>Stats
  </a>
</nav>

{#if $toast}
  <div class="toast">{$toast}</div>
{/if}

<SyncBubble />
