<script lang="ts">
  import { MODULES, getModule } from '../lib/games/registry';
  import { games } from '../lib/stores/games';
  import { players } from '../lib/stores/players';
  import { link, navigate } from '../lib/router';
  import { relativeTime, normalizeJoinCode } from '../lib/util';
  import { isLiveSupported } from '../lib/live/session';

  const liveSupported = isLiveSupported();
  let codeInput = $state('');
  function submitJoin(e: Event) {
    e.preventDefault();
    const c = normalizeJoinCode(codeInput);
    if (c) navigate(`/join/${c}`);
  }

  const active = $derived($games.filter((g) => g.status === 'active'));
  const recent = $derived($games.filter((g) => g.status === 'finished').slice(0, 4));

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
</div>

{#if liveSupported}
  <div class="section-title">Join a live game</div>
  <form class="card row" onsubmit={submitJoin}>
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
            <div class="muted sm">👑 {winnerNames(g.winnerIds) || '—'}</div>
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
  .sm {
    font-size: 0.85rem;
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
</style>
