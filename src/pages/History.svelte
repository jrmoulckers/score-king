<script lang="ts">
  import {
    games,
    activeGames,
    removeGame,
    restoreGame,
    archiveGame,
    unarchiveGame,
  } from '../lib/stores/games';
  import { players } from '../lib/stores/players';
  import { getModule } from '../lib/games/registry';
  import { getRounds } from '../lib/storage/db';
  import { link } from '../lib/router';
  import { formatDateTime, relativeTime } from '../lib/util';
  import { showActionToast } from '../lib/stores/toast';
  import { crewSignature, crewNames, setCrewName } from '../lib/stores/crews';
  import Avatar from '../lib/components/Avatar.svelte';
  import Segmented from '../lib/components/Segmented.svelte';
  import type { Game, Player } from '../lib/types';
  import ShareResultsSheet from '../lib/components/ShareResultsSheet.svelte';
  import { buildRecapPayload, type RecapPayload } from '../lib/share/recap';
  import { gameTime as ts, dateBucket, haystack, nameResolver } from './history';

  /** Below this many games, the list is glanceable on its own — no controls shown. */
  const CONTROLS_MIN = 6;

  const STATUS_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'finished', label: 'Finished' },
  ];
  const GROUP_LABEL: Record<string, string> = { date: 'Date', crew: 'Crew', game: 'Game' };

  const DATE_BUCKETS = [
    { key: 'today', title: 'Today' },
    { key: 'week', title: 'This week' },
    { key: 'month', title: 'This month' },
    { key: 'earlier', title: 'Earlier' },
  ];

  type Group = {
    key: string;
    kind: 'date' | 'crew' | 'game';
    title: string;
    emoji?: string;
    signature?: string;
    memberIds?: string[];
    nickname?: string;
    count: number;
    games: Game[];
  };

  let search = $state('');
  let status = $state('all');
  let groupBy = $state('date');
  let sort = $state('newest');
  let showViewOptions = $state(false);
  let showArchived = $state(false);
  let editingCrew = $state<string | null>(null);
  let crewDraft = $state('');
  let sharePayload = $state<RecapPayload | null>(null);

  const playerMap = $derived(new Map($players.map((p) => [p.id, p] as const)));
  const archivedGames = $derived($games.filter((g) => g.archived));
  const showControls = $derived($activeGames.length >= CONTROLS_MIN);

  // When the controls are hidden (few active games) the search/status inputs are
  // unmounted, so honoring a stale value here would silently hide games with no visible
  // way to clear it. Gate the filters on the controls actually being shown.
  const effSearch = $derived(showControls ? search : '');
  const effStatus = $derived(showControls ? status : 'all');

  const viewSummary = $derived(
    [groupBy === 'date' ? null : GROUP_LABEL[groupBy], sort === 'oldest' ? 'Oldest' : null]
      .filter(Boolean)
      .join(' · '),
  );

  const nameOf = $derived(nameResolver(playerMap));
  function names(ids: string[]): string {
    return ids.map(nameOf).join(', ');
  }
  function winners(ids: string[] | undefined): string {
    return (ids ?? []).map(nameOf).join(' & ');
  }
  function push<K, V>(m: Map<K, V[]>, k: K, v: V): void {
    const a = m.get(k);
    if (a) a.push(v);
    else m.set(k, [v]);
  }

  const filtered = $derived.by(() => {
    let list = $activeGames;
    if (effStatus !== 'all') list = list.filter((g) => g.status === effStatus);
    const q = effSearch.trim().toLowerCase();
    if (q) {
      const typeName = (type: string) => getModule(type)?.name ?? type;
      list = list.filter((g) => haystack(g, typeName, nameOf).includes(q));
    }
    return list;
  });

  const groups = $derived.by<Group[]>(() => {
    const list = [...filtered].sort((a, b) =>
      sort === 'oldest' ? ts(a) - ts(b) : ts(b) - ts(a),
    );

    if (groupBy === 'date') {
      const now = new Date();
      const map = new Map<string, Game[]>();
      for (const g of list) push(map, dateBucket(ts(g), now), g);
      const order = sort === 'oldest' ? [...DATE_BUCKETS].reverse() : DATE_BUCKETS;
      return order
        .filter((b) => map.has(b.key))
        .map((b) => ({
          key: `date-${b.key}`,
          kind: 'date' as const,
          title: b.title,
          count: map.get(b.key)!.length,
          games: map.get(b.key)!,
        }));
    }

    const byLead = (a: Game[], b: Game[]) => (sort === 'oldest' ? ts(a[0]) - ts(b[0]) : ts(b[0]) - ts(a[0]));

    if (groupBy === 'game') {
      const map = new Map<string, Game[]>();
      for (const g of list) push(map, g.type, g);
      return [...map.values()]
        .sort(byLead)
        .map((gs) => {
          const m = getModule(gs[0].type);
          return {
            key: `game-${gs[0].type}`,
            kind: 'game' as const,
            title: m?.name ?? gs[0].type,
            emoji: m?.emoji ?? '🎲',
            count: gs.length,
            games: gs,
          };
        });
    }

    // crew — grouped by the exact line-up
    const nicks = $crewNames;
    const map = new Map<string, Game[]>();
    for (const g of list) push(map, crewSignature(g.playerIds), g);
    return [...map.entries()]
      .sort((a, b) => byLead(a[1], b[1]))
      .map(([sig, gs]) => {
        const memberIds = gs[0].playerIds;
        const nickname = nicks[sig] ?? '';
        return {
          key: `crew-${sig}`,
          kind: 'crew' as const,
          signature: sig,
          memberIds,
          nickname,
          title: nickname || names(memberIds),
          count: gs.length,
          games: gs,
        };
      });
  });

  function clearFilters() {
    search = '';
    status = 'all';
  }

  async function del(g: Game) {
    const snap = { ...g };
    const roundsSnap = await getRounds(g.id);
    await removeGame(g.id);
    showActionToast('Game deleted', 'Undo', async () => {
      await restoreGame(snap, roundsSnap);
    });
  }

  async function archive(g: Game) {
    const snap = { ...g };
    await archiveGame(g);
    showActionToast('Game archived', 'Undo', async () => {
      await unarchiveGame(snap);
    });
  }

  /**
   * Build a share recap on tap (never eager per-row). Rounds load async; players are
   * ordered by the game's own playerIds through the roster map (which includes archived
   * members). A hard-deleted member gets a positional placeholder that REUSES the
   * original id, so buildRecapPayload's per-round deltas and winner lookups — both keyed
   * on player.id — stay aligned; a minted id would silently zero that column's scores.
   */
  async function share(g: Game) {
    const rounds = await getRounds(g.id);
    const ordered: Player[] = g.playerIds.map(
      (id, i) => playerMap.get(id) ?? { id, name: `Player ${i + 1}`, color: '#8a8f98', createdAt: 0 },
    );
    sharePayload = buildRecapPayload(g, ordered, rounds);
  }

  function startCrewEdit(sig: string, current: string) {
    editingCrew = sig;
    crewDraft = current;
  }
  function saveCrewEdit(sig: string) {
    setCrewName(sig, crewDraft);
    editingCrew = null;
  }
</script>

{#snippet gameCard(g: Game)}
  {@const m = getModule(g.type)}
  <div class="card row spread libitem">
    <a class="row info" href={`/play/${g.id}`} use:link>
      <span class="big-emoji" aria-hidden="true">{m?.emoji ?? '🎲'}</span>
      <span class="meta">
        <span class="titleline">
          <strong>{m?.name ?? g.type}</strong>
          {#if g.status === 'active'}<span class="pill">in progress</span>{:else if g.status === 'abandoned'}<span class="pill">🪦 abandoned</span>{/if}
        </span>
        <span class="muted sm oneline">{names(g.playerIds)}</span>
        <span class="muted sm oneline" title={formatDateTime(ts(g))}>
          {relativeTime(ts(g))}
          {#if g.roundCount} · {g.roundCount} {g.roundCount === 1 ? 'round' : 'rounds'}{/if}
          {#if g.status === 'finished'} · 🏆 {winners(g.winnerIds) || '—'}{#if g.winnerScore != null} <strong class="lead score">{g.winnerScore}</strong>{/if}{/if}
          {#if g.status === 'abandoned'} · no winner{/if}
        </span>
      </span>
    </a>
    <span class="row actions">
      {#if g.status === 'finished'}
        <button class="iconbtn" onclick={() => share(g)} aria-label="Share results" title="Share results">📤</button>
      {/if}
      <button class="iconbtn" onclick={() => archive(g)} aria-label="Archive game" title="Archive">🗄</button>
      <button class="iconbtn" onclick={() => del(g)} aria-label="Delete game" title="Delete">🗑</button>
    </span>
  </div>
{/snippet}

<h1>History</h1>

{#if $activeGames.length === 0 && archivedGames.length === 0}
  <div class="empty firstrun">
    <div class="firstrun-emoji" aria-hidden="true">📜</div>
    <p><strong>No games yet.</strong></p>
    <p class="muted">Finished and in-progress games land here, grouped by date, crew, and game.</p>
    <a class="btn primary" href="/" use:link>Start a game</a>
  </div>
{:else}
  {#if showControls}
    <div class="controls">
      <div class="searchbar">
        <span class="searchicon" aria-hidden="true">🔍</span>
        <input
          type="search"
          placeholder="Search games, players, winners…"
          aria-label="Search games"
          bind:value={search}
        />
        {#if search}
          <button class="clearbtn" onclick={() => (search = '')} aria-label="Clear search">✕</button>
        {/if}
      </div>

      <Segmented label="Filter by status" bind:value={status} options={STATUS_OPTIONS} />

      <button
        class="viewtoggle"
        onclick={() => (showViewOptions = !showViewOptions)}
        aria-expanded={showViewOptions}
      >
        <span>{showViewOptions ? '▾' : '▸'} View options</span>
        {#if !showViewOptions && viewSummary}<span class="muted vsum">{viewSummary}</span>{/if}
      </button>

      {#if showViewOptions}
        <div class="viewopts">
          <label class="optrow">
            <span class="optlabel">Group by</span>
            <select bind:value={groupBy}>
              <option value="date">Date</option>
              <option value="crew">Crew</option>
              <option value="game">Game</option>
            </select>
          </label>
          <label class="optrow">
            <span class="optlabel">Sort</span>
            <select bind:value={sort}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
      {/if}
    </div>
  {/if}

  {#if $activeGames.length === 0}
    <div class="empty">Every game is archived. Restore one below to bring it back here.</div>
  {:else if filtered.length === 0}
    <div class="empty">
      <div>No games match — try a different search or filter.</div>
      <button class="btn small ghost" style="margin-top: 10px" onclick={clearFilters}>Clear filters</button>
    </div>
  {:else}
    {#each groups as grp (grp.key)}
      {#if grp.kind === 'date'}
        <div class="section-title">{grp.title}</div>
      {:else if grp.kind === 'game'}
        <div class="grouphead">
          <span class="big-emoji" aria-hidden="true">{grp.emoji}</span>
          <span class="gh-title">{grp.title}</span>
          <span class="pill count">{grp.count}</span>
        </div>
      {:else}
        <div class="grouphead">
          <span class="avstack">
            {#each grp.memberIds!.slice(0, 4) as id (id)}
              {@const p = playerMap.get(id)}
              <Avatar name={p?.name ?? '?'} color={p?.color ?? '#7c5cff'} size={22} />
            {/each}
            {#if grp.memberIds!.length > 4}<span class="avmore">+{grp.memberIds!.length - 4}</span>{/if}
          </span>
          {#if editingCrew === grp.signature}
            <input
              class="crewinput"
              type="text"
              placeholder="Crew name…"
              aria-label="Crew name"
              bind:value={crewDraft}
              onkeydown={(e) => {
                if (e.key === 'Enter') saveCrewEdit(grp.signature!);
                else if (e.key === 'Escape') editingCrew = null;
              }}
            />
            <button class="btn small primary" onclick={() => saveCrewEdit(grp.signature!)}>Save</button>
            <button class="btn small ghost" onclick={() => (editingCrew = null)}>Cancel</button>
          {:else}
            <span class="gh-crew">
              <span class="gh-title">{grp.title}</span>
              {#if grp.nickname}<span class="muted sm oneline">{names(grp.memberIds!)}</span>{/if}
            </span>
            <span class="pill count">{grp.count}</span>
            <button
              class="iconbtn small-icon"
              onclick={() => startCrewEdit(grp.signature!, grp.nickname ?? '')}
              aria-label="Name this crew"
              title="Name this crew"
            >✎</button>
          {/if}
        </div>
      {/if}
      <div class="stack">
        {#each grp.games as g (g.id)}
          {@render gameCard(g)}
        {/each}
      </div>
    {/each}
  {/if}

  {#if archivedGames.length > 0}
    <button
      class="viewtoggle archtoggle"
      onclick={() => (showArchived = !showArchived)}
      aria-expanded={showArchived}
    >{showArchived ? '▾' : '▸'} Archived ({archivedGames.length})</button>
    {#if showArchived}
      <div class="stack">
        {#each archivedGames as g (g.id)}
          {@const m = getModule(g.type)}
          <div class="card row spread libitem arch">
            <a class="row info" href={`/play/${g.id}`} use:link>
              <span class="big-emoji" aria-hidden="true">{m?.emoji ?? '🎲'}</span>
              <span class="meta">
                <span class="titleline"><strong>{m?.name ?? g.type}</strong></span>
                <span class="muted sm oneline">{names(g.playerIds)}</span>
                <span class="muted sm oneline" title={formatDateTime(ts(g))}>
                  {relativeTime(ts(g))}
                  {#if g.status === 'finished'} · 🏆 {winners(g.winnerIds) || '—'}{/if}
                  {#if g.status === 'abandoned'} · no winner{/if}
                </span>
              </span>
            </a>
            <span class="row actions">
              <button class="btn small ghost" onclick={() => unarchiveGame(g)}>Restore</button>
              <button class="iconbtn" onclick={() => del(g)} aria-label="Delete game" title="Delete">🗑</button>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
{/if}

{#if sharePayload}
  <ShareResultsSheet payload={sharePayload} onclose={() => (sharePayload = null)} />
{/if}

<style>
  .firstrun {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .firstrun p {
    margin: 0;
    max-width: 46ch;
  }
  .firstrun-emoji {
    font-size: 2.2rem;
    line-height: 1;
    margin-bottom: 4px;
  }
  .firstrun .btn {
    margin-top: 10px;
    text-decoration: none;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
  }
  .searchbar {
    position: relative;
    display: flex;
    align-items: center;
  }
  .searchbar input {
    width: 100%;
    padding-left: 38px;
  }
  .searchicon {
    position: absolute;
    left: 12px;
    font-size: 0.95rem;
    opacity: 0.7;
    pointer-events: none;
  }
  .clearbtn {
    position: absolute;
    right: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 0.85rem;
  }
  .clearbtn:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .viewtoggle {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 2px;
    background: none;
    border: none;
    color: var(--muted);
    font-weight: 600;
    font-size: 0.92rem;
    cursor: pointer;
    text-align: left;
  }
  .vsum {
    font-weight: 400;
    font-size: 0.85rem;
  }
  .viewopts {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .optrow {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .optlabel {
    flex: none;
    width: 74px;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .viewopts select {
    flex: 1;
    min-height: 44px;
    padding: 8px 12px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font: inherit;
    cursor: pointer;
  }
  .viewopts select:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }

  .grouphead {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 18px 4px 8px;
  }
  .gh-title {
    font-weight: 700;
  }
  .gh-crew {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .grouphead .count {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .grouphead .small-icon {
    flex: none;
    width: 38px;
    height: 38px;
    font-size: 0.95rem;
  }
  .avstack {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex: none;
  }
  .avmore {
    font-size: 0.75rem;
    color: var(--muted);
    margin-left: 2px;
  }
  .crewinput {
    flex: 1;
    min-width: 0;
  }

  .libitem {
    align-items: center;
  }
  .libitem:has(.info:hover) {
    border-color: var(--primary);
  }
  .info {
    flex: 1;
    min-width: 0;
    gap: 12px;
    text-decoration: none;
    color: inherit;
  }
  .big-emoji {
    font-size: 1.6rem;
    flex: none;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .titleline {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .oneline {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .actions {
    flex: none;
    gap: 6px;
  }
  .sm {
    font-size: 0.85rem;
  }
  /* Winner's final total in the summary — Crown Gold (.lead) + tabular so the
     glanceable "who won and by how much" stays legible and non-jittering. */
  .score {
    font-variant-numeric: tabular-nums;
  }
  .arch {
    opacity: 0.82;
  }
  .archtoggle {
    margin-top: 16px;
  }

  @media (max-width: 360px) {
    /* Recover a few px of info width so the 3-icon finished row (Share · Archive ·
       Delete) keeps a comfortable title/tap area on the narrowest phones, without
       ever shrinking the 46×46 icon hit targets. */
    .libitem {
      padding: 12px;
      gap: 8px;
    }
    .actions {
      gap: 4px;
    }
  }
</style>
