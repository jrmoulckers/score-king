<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { pathStore, parseRoute, link, titleForRoute } from './lib/router';
  import { toast } from './lib/stores/toast';
  import { settings } from './lib/stores/settings';
  import { storageError } from './lib/stores/storage';
  import { announce } from './lib/stores/announcer';
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
  import Announcer from './lib/components/Announcer.svelte';

  let current = $state(window.location.pathname || '/');
  onMount(() => pathStore.subscribe((v) => (current = v)));
  const route = $derived(parseRoute(current));

  let mainEl: HTMLElement | undefined = $state();
  // Skip the very first render: the initial page load already places focus and
  // sets the title, so only *navigations* move focus and re-announce.
  let mounted = false;

  // Keep the document title, focus, and a polite announcement in lockstep with
  // the route so screen-reader and keyboard users perceive each navigation the
  // way a sighted user does at a glance.
  $effect(() => {
    const title = titleForRoute(route);
    document.title = title;
    if (!mounted) {
      mounted = true;
      return;
    }
    announce(title.split(' · ')[0]);
    void (async () => {
      await tick();
      mainEl?.focus();
    })();
  });

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

  // A manual "hide now" is offered on the play screen whenever the guard is on,
  // so a player can veil the board on purpose before handing the phone over —
  // not only when the tab is backgrounded.
  const canHideNow = $derived($settings.privacyGuard && route.name === 'play' && !veiled);
  function hideNow() {
    veiled = true;
  }

  function reveal() {
    veiled = false;
  }

  let veilBtn: HTMLButtonElement | undefined = $state();
  $effect(() => {
    if (veiled) veilBtn?.focus();
  });
</script>

{#snippet navLinks()}
  <a href="/" use:link class:active={navActive.games}><span class="ico" aria-hidden="true">🏠</span><span class="lbl">Games</span></a>
  <a href="/players" use:link class:active={navActive.players}><span class="ico" aria-hidden="true">👥</span><span class="lbl">Players</span></a>
  <a href="/history" use:link class:active={navActive.history}><span class="ico" aria-hidden="true">📜</span><span class="lbl">History</span></a>
  <a href="/stats" use:link class:active={navActive.stats}><span class="ico" aria-hidden="true">📊</span><span class="lbl">Stats</span></a>
{/snippet}

<a href="#main-content" class="skip-link">Skip to content</a>

<div class="shell" inert={veiled}>
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

    {#if $storageError}
      <div class="storage-banner" role="alert">
        <span class="sb-ico" aria-hidden="true">⚠️</span>
        <span class="sb-msg">{$storageError}</span>
        <button class="sb-action" type="button" onclick={() => location.reload()}>Reload</button>
      </div>
    {/if}

<main class="app" id="main-content" tabindex="-1" bind:this={mainEl}>
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
  <div class="toast" role="status" aria-live="polite" aria-atomic="true">
    <span>{$toast.message}</span>
    {#if $toast.action}
      <button class="toast-action" onclick={$toast.action.run}>{$toast.action.label}</button>
    {/if}
  </div>
{/if}

<Announcer />

{#if canHideNow}
  <button class="hide-now" onclick={hideNow} title="Hide scores from view">
    <span aria-hidden="true">🙈</span> Hide scores
  </button>
{/if}

{#if veiled}
  <button
    class="veil"
    onclick={reveal}
    aria-label="Scores hidden. Reveal scores."
    bind:this={veilBtn}
  >
    <span class="veil-card">
      <span class="veil-emoji" aria-hidden="true">🙈</span>
      <strong>Scores hidden</strong>
      <span class="veil-hint">Tap anywhere to reveal</span>
    </span>
  </button>
{/if}

<style>
  /* Storage fault banner: a persistent, co-signalled (⚠️ + text, not colour alone)
     alert shown when the local database can't be read/written, so a device that
     can't persist scores says so instead of booting to a mysterious empty state.
     Surface-2 fill with a coral hairline — no glass (glass is chrome only). */
  .storage-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 10px 12px 0;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid color-mix(in srgb, var(--bad) 55%, var(--border));
    color: var(--text);
    font-size: 0.9rem;
  }
  .sb-ico {
    font-size: 1.1rem;
    line-height: 1;
    flex: none;
  }
  .sb-msg {
    flex: 1;
    min-width: 0;
  }
  .sb-action {
    flex: none;
    min-height: 40px;
    padding: 0 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-3);
    color: var(--text);
    font-weight: 700;
    cursor: pointer;
  }
  .sb-action:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  /* Skip link: off-screen until focused, then anchored top-center over the app
     bar so keyboard users can jump past the persistent nav (WCAG 2.4.1). */
  .skip-link {
    position: fixed;
    top: 0;
    left: 50%;
    transform: translate(-50%, -120%);
    z-index: 100;
    padding: 10px 18px;
    min-height: 46px;
    display: inline-flex;
    align-items: center;
    background: var(--primary);
    color: #fff;
    font-weight: 700;
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    box-shadow: var(--shadow);
    transition: transform 0.15s ease;
  }
  .skip-link:focus-visible {
    transform: translate(-50%, 0);
    outline: 2px solid #fff;
    outline-offset: -4px;
    text-decoration: none;
  }

  /* Manual privacy hide: a thumb-zone pill above the bottom bar so a player can
     veil the board on purpose before setting the phone down. */
  .hide-now {
    position: fixed;
    left: 50%;
    bottom: calc(86px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 60;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 0 18px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-3);
    color: var(--text);
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    box-shadow: var(--shadow);
  }
  .hide-now:hover {
    background: var(--surface-3);
  }
  .hide-now:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

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
