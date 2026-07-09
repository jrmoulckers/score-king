<script lang="ts">
  import { settings } from '../lib/stores/settings';
  import { link } from '../lib/router';
  import BackLink from '../lib/components/BackLink.svelte';
  import {
    startableTypes,
    toggleFavorite,
    setHidden,
    hideWithUndo,
    matchModule,
    isCustomType,
    editCustomHref,
    CREATE_ROUTE,
    CUSTOM_GAMES_ENABLED,
  } from '../lib/stores/catalog';

  let query = $state('');

  const mods = $derived($startableTypes);
  const favs = $derived($settings.catalogFavorites);
  const hidden = $derived($settings.catalogHidden);

  // Stable registry order here (favoriting reorders the *catalog*, not this list) so rows
  // don't jump under your thumb while you curate.
  const visible = $derived(
    mods.filter((m) => !hidden.includes(m.id) && matchModule(m, query)),
  );
  const hiddenModules = $derived(
    mods.filter((m) => hidden.includes(m.id) && matchModule(m, query)),
  );

  const searching = $derived(query.trim().length > 0);
  const nothing = $derived(visible.length === 0 && hiddenModules.length === 0);
</script>

<BackLink href="/" label="Games" />

<h1>Manage games</h1>
<p class="lede muted">
  Favorite the games your group plays and hide the ones you don’t. Favorites pin to the top of
  the catalog; hidden games leave it — both are easy to undo here.
</p>

<input
  class="search"
  type="text"
  placeholder="Search games…"
  aria-label="Search games"
  autocapitalize="off"
  autocorrect="off"
  spellcheck="false"
  bind:value={query}
/>

{#if nothing}
  <div class="empty">
    {#if searching}No games match “{query}”.{:else}No games yet.{/if}
  </div>
{:else}
  {#if visible.length}
    <div class="section-title">Games</div>
    <div class="card list">
      {#each visible as m (m.id)}
        {@const fav = favs.includes(m.id)}
        <div class="mrow">
          <span class="info">
            <span class="emoji" aria-hidden="true">{m.emoji}</span>
            <span class="meta">
              <span class="name">{m.name}</span>
              <span class="muted sm">{m.tagline}</span>
            </span>
          </span>
          <span class="actions">
            {#if CUSTOM_GAMES_ENABLED && isCustomType(m.id)}
              <a class="btn small ghost" href={editCustomHref(m.id)} use:link>Edit</a>
            {/if}
            <button
              class="starbtn"
              type="button"
              aria-pressed={fav}
              title={fav ? `Unfavorite ${m.name}` : `Favorite ${m.name}`}
              onclick={() => toggleFavorite(m.id)}
            >
              <span aria-hidden="true">{fav ? '★' : '☆'}</span>
              <span class="sr-only">{fav ? `Unfavorite ${m.name}` : `Favorite ${m.name}`}</span>
            </button>
            <button class="btn small ghost" type="button" onclick={() => hideWithUndo(m.id, m.name)}>
              Hide
            </button>
          </span>
        </div>
      {/each}
    </div>
  {:else if !searching}
    <div class="empty">Every game is hidden — show one below to bring it back to the catalog.</div>
  {/if}

  {#if hiddenModules.length}
    <div class="section-title">Hidden</div>
    <div class="card list">
      {#each hiddenModules as m (m.id)}
        <div class="mrow">
          <span class="info dim">
            <span class="emoji" aria-hidden="true">{m.emoji}</span>
            <span class="meta">
              <span class="name">{m.name}</span>
              <span class="muted sm">{m.tagline}</span>
            </span>
          </span>
          <span class="actions">
            <button class="btn small" type="button" onclick={() => setHidden(m.id, false)}>
              Show
            </button>
          </span>
        </div>
      {/each}
    </div>
  {/if}
{/if}

{#if CUSTOM_GAMES_ENABLED}
  <a class="btn primary block createbtn" href={CREATE_ROUTE} use:link>＋ Create a game</a>
{/if}

<style>
  .lede {
    margin: -2px 4px 16px;
    max-width: 60ch;
  }
  .search {
    margin: 0 0 6px;
  }
  .list {
    padding: 0;
    overflow: hidden;
  }
  .mrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 16px;
    min-height: 46px;
  }
  .mrow + .mrow {
    border-top: 1px solid var(--border);
  }
  .info {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .info.dim {
    opacity: 0.6;
  }
  .emoji {
    font-size: 1.6rem;
    line-height: 1;
    flex: none;
  }
  .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-weight: 700;
  }
  .sm {
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  /* A neutral star: filled ★ vs outline ☆ + aria-pressed carry the state — never gold
     (reserved for the leader/winner) and never a second violet fill. */
  .starbtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--muted);
    font-size: 1.3rem;
    line-height: 1;
    cursor: pointer;
    transition: transform 0.05s ease, background 0.15s ease, color 0.15s ease;
  }
  .starbtn[aria-pressed='true'] {
    color: var(--text);
    background: var(--surface-3);
  }
  .starbtn:active {
    transform: translateY(1px);
  }
  .starbtn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .createbtn {
    margin-top: var(--card-gap);
    text-decoration: none;
  }
</style>
