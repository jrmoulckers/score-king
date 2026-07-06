<script lang="ts">
  import { games, removeGame } from '../lib/stores/games';
  import { players } from '../lib/stores/players';
  import { getModule } from '../lib/games/registry';
  import { link } from '../lib/router';
  import { formatDateTime } from '../lib/util';

  function names(ids: string[]): string {
    return ids.map((id) => $players.find((p) => p.id === id)?.name ?? '?').join(', ');
  }
  function winners(ids: string[] | undefined): string {
    return (ids ?? []).map((id) => $players.find((p) => p.id === id)?.name ?? '?').join(' & ');
  }
  async function del(id: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Delete this game and its scores?')) await removeGame(id);
  }
</script>

<h1>History</h1>

{#if $games.length === 0}
  <div class="empty">No games yet. Start one from the Games tab.</div>
{:else}
  <div class="stack">
    {#each $games as g (g.id)}
      {@const m = getModule(g.type)}
      <a class="card row spread tile" href={`/play/${g.id}`} use:link>
        <span class="row" style="gap: 12px">
          <span style="font-size: 1.5rem">{m?.emoji ?? '🎲'}</span>
          <span>
            <div>
              <strong>{m?.name ?? g.type}</strong>
              {#if g.status === 'active'}<span class="pill">in progress</span>{/if}
            </div>
            <div class="muted sm">{names(g.playerIds)}</div>
            <div class="muted sm">
              {formatDateTime(g.finishedAt ?? g.createdAt)}
              {#if g.status === 'finished'} · 🏆 {winners(g.winnerIds) || '—'}{/if}
            </div>
          </span>
        </span>
        <button class="iconbtn" onclick={(e) => del(g.id, e)} aria-label="Delete">🗑</button>
      </a>
    {/each}
  </div>
{/if}

<style>
  .tile {
    text-decoration: none;
    color: inherit;
  }
  .sm {
    font-size: 0.82rem;
  }
</style>
