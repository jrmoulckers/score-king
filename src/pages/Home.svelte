<script lang="ts">
  import { MODULES, getModule } from '../lib/games/registry';
  import { activeGames } from '../lib/stores/games';
  import { players } from '../lib/stores/players';
  import { customGameDefs } from '../lib/stores/customGames';
  import { link, navigate } from '../lib/router';
  import { relativeTime, normalizeJoinCode } from '../lib/util';
  import { isLiveSupported, isNearbySupported } from '../lib/live/session';

  const liveSupported = isLiveSupported();
  const nearbySupported = isNearbySupported();
  let codeInput = $state('');
  function submitJoin(e: Event) {
    e.preventDefault();
    const c = normalizeJoinCode(codeInput);
    if (c) navigate(`/join/${c}`);
  }

  const active = $derived($activeGames.filter((g) => g.status === 'active'));
  const recent = $derived($activeGames.filter((g) => g.status === 'finished').slice(0, 4));
  // Custom, user-authored games — non-archived, shown alongside the built-ins.
  // (Seam: session 1's catalog will own ordering/favorites/hidden for these.)
  const customTiles = $derived($customGameDefs.filter((d) => !d.archived && !d.deleted));

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

<div class="section-title">Start a game</div>
<div class="grid">
  {#each MODULES as m (m.id)}
    <a class="gametile" href={`/${m.id}`} use:link>
      <span class="emoji">{m.emoji}</span>
      <span class="name">{m.name}</span>
      <span class="tag">{m.tagline}</span>
    </a>
  {/each}
  {#each customTiles as d (d.id)}
    <a class="gametile" href={`/${d.id}`} use:link>
      <span class="emoji">{d.emoji}</span>
      <span class="name">{d.name}</span>
      <span class="tag">{d.tagline}</span>
    </a>
  {/each}
  <a class="gametile create" href="/create" use:link>
    <span class="emoji" aria-hidden="true">＋</span>
    <span class="name">Create a game</span>
    <span class="tag">Design your own scorer</span>
  </a>
</div>

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
  /* "Add new" affordance — dashed outline + ＋ glyph carry the meaning, not color alone. */
  .create {
    border-style: dashed;
  }
  .create .emoji {
    color: var(--muted);
  }
  .tile:hover {
    border-color: var(--primary);
  }
  .big-emoji {
    font-size: 1.6rem;
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
