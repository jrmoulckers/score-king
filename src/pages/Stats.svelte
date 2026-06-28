<script lang="ts">
  import { games } from '../lib/stores/games';
  import { players } from '../lib/stores/players';
  import { getModule } from '../lib/games/registry';
  import Avatar from '../lib/components/Avatar.svelte';

  interface Row {
    id: string;
    name: string;
    color: string;
    played: number;
    wins: number;
  }

  const finished = $derived($games.filter((g) => g.status === 'finished'));

  const rows = $derived.by<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const p of $players) {
      map.set(p.id, { id: p.id, name: p.name, color: p.color, played: 0, wins: 0 });
    }
    for (const g of finished) {
      for (const pid of g.playerIds) {
        const r = map.get(pid);
        if (r) r.played++;
      }
      for (const wid of g.winnerIds ?? []) {
        const r = map.get(wid);
        if (r) r.wins++;
      }
    }
    return [...map.values()]
      .filter((r) => r.played > 0)
      .sort((a, b) => b.wins - a.wins || b.played - a.played);
  });

  const byType = $derived.by(() => {
    const m = new Map<string, number>();
    for (const g of $games) m.set(g.type, (m.get(g.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });

  function pct(r: Row): string {
    return r.played ? `${Math.round((r.wins / r.played) * 100)}%` : '—';
  }
</script>

<h1>Stats</h1>

<div class="row wrap" style="gap: 10px; margin-bottom: 6px">
  <span class="pill">{$games.length} games</span>
  <span class="pill">{finished.length} finished</span>
  <span class="pill">{$players.length} players</span>
</div>

{#if rows.length === 0}
  <div class="empty">Finish a game to start building stats.</div>
{:else}
  <div class="section-title">Leaderboard</div>
  <div class="card">
    <table>
      <thead>
        <tr><th>Player</th><th>Played</th><th>Wins</th><th>Win %</th></tr>
      </thead>
      <tbody>
        {#each rows as r (r.id)}
          <tr>
            <td>
              <span class="row" style="gap: 8px">
                <Avatar name={r.name} color={r.color} size={24} />{r.name}
              </span>
            </td>
            <td>{r.played}</td>
            <td class="lead">{r.wins}</td>
            <td>{pct(r)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="section-title">Games played by type</div>
  <div class="card stack">
    {#each byType as [type, count] (type)}
      {@const m = getModule(type)}
      <div class="row spread">
        <span class="row" style="gap: 8px">{m?.emoji ?? '🎲'} {m?.name ?? type}</span>
        <span class="pill">{count}</span>
      </div>
    {/each}
  </div>
{/if}
