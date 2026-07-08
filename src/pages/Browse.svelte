<script lang="ts">
  import { settings } from '../lib/stores/settings';
  import { link } from '../lib/router';
  import BackLink from '../lib/components/BackLink.svelte';
  import {
    startableTypes,
    groupByCategory,
    matchModule,
    CUSTOM_GAMES_ENABLED,
    CREATE_ROUTE,
    type CatalogType,
    type GameCategory,
  } from '../lib/stores/catalog';

  let search = $state('');
  // Empty = no filter (show every category). Categories are multi-select toggles.
  let activeCats = $state<GameCategory[]>([]);

  const mods = $derived($startableTypes);
  const searching = $derived(search.trim().length > 0);

  // Ordered, non-empty category sections over the visible (non-hidden) catalog.
  const groups = $derived(groupByCategory(mods, $settings.catalogHidden));
  const total = $derived(groups.reduce((n, g) => n + g.types.length, 0));

  const searchResults = $derived(
    searching
      ? mods.filter((m) => !$settings.catalogHidden.includes(m.id) && matchModule(m, search))
      : [],
  );

  // No filter → show every group; otherwise show only the toggled-on categories. Either way
  // each section keeps its header, so the category context never disappears when filtering.
  const visibleGroups = $derived(
    activeCats.length === 0 ? groups : groups.filter((g) => activeCats.includes(g.meta.id)),
  );

  const showCreate = $derived(
    CUSTOM_GAMES_ENABLED && (activeCats.length === 0 || activeCats.includes('custom')),
  );

  function toggleCat(id: GameCategory) {
    activeCats = activeCats.includes(id)
      ? activeCats.filter((c) => c !== id)
      : [...activeCats, id];
  }

  // Drop any selected category that no longer exists (e.g. every game in it got hidden).
  $effect(() => {
    const valid = new Set(groups.map((g) => g.meta.id));
    if (activeCats.some((c) => !valid.has(c))) activeCats = activeCats.filter((c) => valid.has(c));
  });
</script>

{#snippet tile(m: CatalogType)}
  <a class="gametile" href={`/${m.id}`} use:link>
    <span class="emoji">{m.emoji}</span>
    <span class="name">{m.name}</span>
    <span class="tag">{m.tagline}</span>
  </a>
{/snippet}

{#snippet createTile()}
  <a class="gametile createtile" href={CREATE_ROUTE} use:link>
    <span class="emoji" aria-hidden="true">＋</span>
    <span class="name">Create a game</span>
    <span class="tag">Build your own scorer</span>
  </a>
{/snippet}

<BackLink href="/" label="Games" />

<div class="browse-head">
  <h1>All games</h1>
  <a class="manage-link" href="/manage-games" use:link>Manage</a>
</div>

<div class="browse-search">
  <span class="search-ico" aria-hidden="true">🔍</span>
  <input
    type="search"
    placeholder="Search {total} games…"
    aria-label="Search games"
    autocapitalize="off"
    autocorrect="off"
    spellcheck="false"
    bind:value={search}
  />
</div>

{#if !searching}
  <div class="chips" role="group" aria-label="Filter by category">
    <button
      type="button"
      class="chip"
      class:on={activeCats.length === 0}
      aria-pressed={activeCats.length === 0}
      onclick={() => (activeCats = [])}
    >
      All <span class="count">{total}</span>
    </button>
    {#each groups as g (g.meta.id)}
      <button
        type="button"
        class="chip"
        class:on={activeCats.includes(g.meta.id)}
        aria-pressed={activeCats.includes(g.meta.id)}
        onclick={() => toggleCat(g.meta.id)}
      >
        <span aria-hidden="true">{g.meta.emoji}</span>
        {g.meta.label}
        <span class="count">{g.types.length}</span>
      </button>
    {/each}
  </div>
{/if}

{#if searching}
  {#if searchResults.length}
    <div class="grid">
      {#each searchResults as m (m.id)}{@render tile(m)}{/each}
    </div>
  {:else}
    <div class="empty">No games match “{search.trim()}”.</div>
  {/if}
{:else}
  {#each visibleGroups as g (g.meta.id)}
    <div class="section-title cathead">
      <span><span class="cat-emoji" aria-hidden="true">{g.meta.emoji}</span> {g.meta.label}</span>
      <span class="cat-count">{g.types.length}</span>
    </div>
    <div class="grid">
      {#each g.types as m (m.id)}{@render tile(m)}{/each}
    </div>
  {/each}
  {#if showCreate}
    <div class="create-wrap">
      <div class="grid">{@render createTile()}</div>
    </div>
  {/if}
{/if}

<style>
  .browse-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .browse-head h1 {
    margin-bottom: 0;
  }
  /* A quiet violet text link (allowed) — not a second violet fill. */
  .manage-link {
    text-transform: none;
    letter-spacing: normal;
    font-size: 0.9rem;
    font-weight: 600;
    white-space: nowrap;
    padding: 6px 4px;
  }
  .browse-search {
    position: relative;
    margin: 14px 0 12px;
  }
  .browse-search input {
    padding-left: 40px;
  }
  .search-ico {
    position: absolute;
    left: 13px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    opacity: 0.7;
    font-size: 0.95rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 4px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 42px;
    padding: 8px 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }
  .chip:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  /* Selected chip uses the app's standard active-pill treatment (surface-2 + ink),
     never a violet fill — keeps the one Royal Violet voice for real primary actions. */
  .chip.on {
    background: var(--surface-2);
    color: var(--text);
    border-color: color-mix(in srgb, var(--text) 22%, var(--border));
  }
  .chip .count {
    font-variant-numeric: tabular-nums;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .chip.on .count {
    color: var(--text);
  }
  .cat-emoji {
    font-size: 0.95rem;
  }
  .cat-count {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    text-transform: none;
    letter-spacing: normal;
  }
  .create-wrap {
    margin-top: 18px;
  }
  /* The single "add" accent: a dashed tile with a violet ＋ — never a solid fill. */
  .createtile {
    border-style: dashed;
  }
  .createtile .emoji {
    color: var(--primary);
    font-weight: 700;
  }
  @media (prefers-reduced-motion: reduce) {
    .chip {
      transition: none;
    }
  }
</style>
