<script lang="ts">
  import { getModule } from '../lib/games/registry';
  import { games } from '../lib/stores/games';
  import { players } from '../lib/stores/players';
  import { settings } from '../lib/stores/settings';
  import { link, navigate } from '../lib/router';
  import { relativeTime, normalizeJoinCode } from '../lib/util';
  import { isLiveSupported, isNearbySupported } from '../lib/live/session';
  import {
    startableTypes,
    sectionize,
    matchModule,
    SEARCH_THRESHOLD,
    CUSTOM_GAMES_ENABLED,
    CREATE_ROUTE,
    type CatalogType,
  } from '../lib/stores/catalog';

  const liveSupported = isLiveSupported();
  const nearbySupported = isNearbySupported();
  let codeInput = $state('');
  function submitJoin(e: Event) {
    e.preventDefault();
    const c = normalizeJoinCode(codeInput);
    if (c) navigate(`/join/${c}`);
  }

  const active = $derived($games.filter((g) => g.status === 'active' && !g.archived));
  const recent = $derived(
    $games.filter((g) => g.status === 'finished' && !g.archived).slice(0, 4),
  );

  // ── Catalog: search + mutually-exclusive sections over the startable game types ──
  let search = $state('');
  const mods = $derived($startableTypes);
  const showSearch = $derived(mods.length >= SEARCH_THRESHOLD);
  const searching = $derived(search.trim().length > 0);
  const sections = $derived(
    sectionize(mods, $games, $settings.catalogFavorites, $settings.catalogHidden),
  );
  const searchResults = $derived(
    searching
      ? mods.filter((m) => !$settings.catalogHidden.includes(m.id) && matchModule(m, search))
      : [],
  );
  const firstSection = $derived(
    sections.favorites.length ? 'fav' : sections.recent.length ? 'recent' : 'rem',
  );
  const remainderTitle = $derived(
    sections.favorites.length || sections.recent.length ? 'All games' : 'Start a game',
  );
  const showRemainder = $derived(sections.remainder.length > 0 || CUSTOM_GAMES_ENABLED);

  function names(ids: string[]): string {
    return ids.map((id) => $players.find((p) => p.id === id)?.name ?? '?').join(', ');
  }
  function winnerNames(ids: string[] | undefined): string {
    return (ids ?? []).map((id) => $players.find((p) => p.id === id)?.name ?? '?').join(' & ');
  }
</script>

{#if active.length}
  <div class="section-title">Continue</div>
  <div class="stack">
    {#each active as g (g.id)}
      {@const m = getModule(g.type)}
      <a class="card row spread tile" href={`/play/${g.id}`} use:link>
        <span class="row" style="gap: 12px">
          <span class="big-emoji">{m?.emoji ?? '🎲'}</span>
          <span>
            <div><strong>{m?.name ?? g.type}</strong></div>
            <div class="muted sm">{names(g.playerIds)}</div>
          </span>
        </span>
        <span class="pill">Round {g.roundCount + 1}</span>
      </a>
    {/each}
  </div>
{/if}

{#snippet tile(m: CatalogType)}
  <a class="gametile" href={`/${m.id}`} use:link>
    <span class="emoji">{m.emoji}</span>
    <span class="name">{m.name}</span>
    <span class="tag">{m.tagline}</span>
  </a>
{/snippet}

{#snippet head(label: string, withManage: boolean)}
  <div class="section-title cathead">
    <span>{label}</span>
    {#if withManage}
      <a class="manage-link" href="/manage-games" use:link>Manage</a>
    {/if}
  </div>
{/snippet}

{#if showSearch}
  <div class="catalog-bar">
    <input
      class="catalog-search"
      type="text"
      placeholder="Search games…"
      aria-label="Search games"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      bind:value={search}
    />
    <a class="manage-link inbar" href="/manage-games" use:link>Manage</a>
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
  {#if sections.favorites.length}
    {@render head('Favorites', !showSearch && firstSection === 'fav')}
    <div class="grid">
      {#each sections.favorites as m (m.id)}{@render tile(m)}{/each}
    </div>
  {/if}
  {#if sections.recent.length}
    {@render head('Recently played', !showSearch && firstSection === 'recent')}
    <div class="grid">
      {#each sections.recent as m (m.id)}{@render tile(m)}{/each}
    </div>
  {/if}
  {#if showRemainder}
    {@render head(remainderTitle, !showSearch && firstSection === 'rem')}
    <div class="grid">
      {#each sections.remainder as m (m.id)}{@render tile(m)}{/each}
      {#if CUSTOM_GAMES_ENABLED}
        <a class="gametile createtile" href={CREATE_ROUTE} use:link>
          <span class="emoji" aria-hidden="true">＋</span>
          <span class="name">Create a game</span>
          <span class="tag">Build your own scorer</span>
        </a>
      {/if}
    </div>
  {/if}
{/if}

{#if liveSupported || nearbySupported}
  <div class="section-title">Join a game</div>
  <form class="card joincard" onsubmit={submitJoin}>
    {#if liveSupported}
      <div class="row codejoin">
        <input
          class="joincode"
          type="text"
          autocapitalize="characters"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          maxlength="8"
          placeholder="Enter code"
          aria-label="Live game join code"
          bind:value={codeInput}
        />
        <button class="btn" type="submit" disabled={!codeInput.trim()}>Join</button>
      </div>
    {/if}
    {#if nearbySupported}
      {#if liveSupported}<span class="ordiv"><span>or</span></span>{/if}
      <a class="btn ghost block scanbtn" href="/nearby" use:link>📷 Scan a QR to join</a>
      <span class="muted sm scanhint">Scan the host’s invite — works online or with no internet at all.</span>
    {/if}
  </form>
{/if}

{#if recent.length}
  <div class="section-title">Recent results</div>
  <div class="stack">
    {#each recent as g (g.id)}
      {@const m = getModule(g.type)}
      <a class="card row spread tile" href={`/play/${g.id}`} use:link>
        <span class="row" style="gap: 12px">
          <span class="big-emoji">{m?.emoji ?? '🎲'}</span>
          <span>
            <div>
              <strong>{m?.name ?? g.type}</strong>
              <span class="muted sm">· {relativeTime(g.finishedAt ?? g.createdAt)}</span>
            </div>
            <div class="muted sm">🏆 {winnerNames(g.winnerIds) || '—'}</div>
          </span>
        </span>
      </a>
    {/each}
  </div>
{/if}

<style>
  .tile {
    text-decoration: none;
    color: inherit;
  }
  .tile:hover {
    border-color: var(--primary);
  }
  .big-emoji {
    font-size: 1.6rem;
  }
  .catalog-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 18px 4px 4px;
  }
  .catalog-search {
    flex: 1;
  }
  .cathead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  /* A quiet violet text link (allowed) — not a second violet fill. Opts out of the
     section-title's uppercase/tracked treatment. */
  .manage-link {
    text-transform: none;
    letter-spacing: normal;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    padding: 6px 4px;
  }
  .manage-link.inbar {
    padding: 8px;
  }
  /* The single "add" accent on Home: a dashed tile with a violet ＋ — never a solid fill. */
  .createtile {
    border-style: dashed;
  }
  .createtile .emoji {
    color: var(--primary);
    font-weight: 700;
  }
  .sm {
    font-size: 0.85rem;
  }
  .joincard {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .codejoin {
    gap: 10px;
    width: 100%;
  }
  .joincode {
    flex: 1;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-weight: 700;
  }
  .joincode::placeholder {
    text-transform: none;
    letter-spacing: normal;
    font-weight: 400;
  }
  .scanbtn {
    text-decoration: none;
  }
  .scanhint {
    text-align: center;
  }
  /* A quiet "or" divider between the two join paths — not color-only, just a hairline + label. */
  .ordiv {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .ordiv::before,
  .ordiv::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
</style>
