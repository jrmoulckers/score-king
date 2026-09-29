<script lang="ts">
  import { games } from '../lib/stores/games';
  import { players } from '../lib/stores/players';
  import { getModule } from '../lib/games/registry';
  import { link } from '../lib/router';
  import { rosterFor } from '../lib/util';
  import { groupLeader } from './history';
  import { gameNights, isNightDate } from './nights';

  const { date }: { date?: string } = $props();

  const nights = $derived(gameNights($games));
  const night = $derived(date ? nights.find((item) => item.date === date) : undefined);
  const playerMap = $derived(new Map($players.map((player) => [player.id, player] as const)));
  const nameFor = $derived((id: string) => playerMap.get(id)?.name ?? 'Removed player');

  function label(key: string): string {
    const [year, month, day] = key.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(year, month - 1, day));
  }

  function names(ids: string[]): string {
    return ids.map(nameFor).join(', ');
  }

  function count(n: number, singular: string, plural = `${singular}s`): string {
    return `${n} ${n === 1 ? singular : plural}`;
  }
</script>

{#if date}
  <a class="backlink" href="/nights" use:link>← All game nights</a>
  {#if !isNightDate(date)}
    <h1>Game night not found</h1>
    <p class="muted">That date isn’t a game night.</p>
  {:else if !night}
    <h1>Game night not found</h1>
    <p class="muted">No saved results for {label(date)}. Archived games stay in History.</p>
  {:else}
    <h1>{label(night.date)}</h1>
    <p class="muted intro">
      {count(night.games.length, 'game')} · {count(night.playerIds.length, 'player')}
      {#if night.abandoned}
        · {count(night.abandoned, 'abandoned game')}{/if}
    </p>
    {#if night.playerIds.length}
      <section aria-labelledby="night-table">
        <h2 class="section-title" id="night-table">At the table</h2>
        <p class="card table-names">{names(night.playerIds)}</p>
      </section>
    {/if}
    {@const lead = groupLeader(night.games, nameFor)}
    {#if lead}
      <p class="card night-lead">
        <span aria-hidden="true">👑</span>
        {lead.tie ? 'Most wins: a tie' : `Most wins: ${lead.name}`}
        <span class="tnum">({count(lead.wins, 'win')})</span>
      </p>
    {/if}
    <section aria-labelledby="night-games">
      <h2 class="section-title" id="night-games">Games played</h2>
      <div class="stack">
        {#each night.games as game (game.id)}
          {@const module = getModule(game.type)}
          <a class="card game-card" href={`/play/${game.id}`} use:link>
            <span class="game-title">
              <span aria-hidden="true">{module?.emoji ?? '🎲'}</span>
              <strong>{game.name || module?.name || game.type}</strong>
              <span class="muted sm">{game.status === 'abandoned' ? 'Abandoned' : 'Finished'}</span>
            </span>
            <span class="muted sm"
              >{rosterFor(game.playerIds, $players)
                .map((p) => p.name)
                .join(', ')}</span
            >
            {#if game.status === 'finished'}
              <span class="outcome">
                {#if game.winnerIds?.length}
                  <span aria-hidden="true">👑</span>
                  {names(game.winnerIds)}
                  {#if game.winnerScore != null}
                    <strong class="tnum">· {game.winnerScore}</strong>
                  {/if}
                {:else}
                  No winner recorded
                {/if}
              </span>
            {:else}
              <span class="muted sm">No winner · view game</span>
            {/if}
          </a>
        {/each}
      </div>
    </section>
  {/if}
{:else}
  <a class="backlink" href="/history" use:link>← History</a>
  <h1>Game nights</h1>
  <p class="muted intro">
    The whole table, one night at a time. A night follows your local calendar date.
  </p>
  {#if nights.length === 0}
    <div class="empty">
      <p><strong>No game nights yet.</strong></p>
      <p class="muted">
        Finish a game and you’ll find its night here. Archived results stay in History.
      </p>
      <a class="btn primary" href="/" use:link>Start a game</a>
    </div>
  {:else}
    <div class="stack">
      {#each nights as item (item.date)}
        {@const lead = groupLeader(item.games, nameFor)}
        <a class="card night-card" href={`/nights/${item.date}`} use:link>
          <span class="night-title"
            ><span aria-hidden="true">🎲</span> <strong>{label(item.date)}</strong></span
          >
          <span class="muted sm">
            {count(item.games.length, 'game')} · {count(item.playerIds.length, 'player')}
            {#if item.abandoned}
              · {count(item.abandoned, 'abandoned')}{/if}
          </span>
          {#if item.playerIds.length}<span class="muted sm">{names(item.playerIds)}</span>{/if}
          {#if lead}<span class="winner sm"
              ><span aria-hidden="true">👑</span>
              {lead.tie ? 'Most wins: a tie' : `Most wins: ${lead.name}`}</span
            >{/if}
        </a>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .backlink {
    display: inline-flex;
    align-items: center;
    min-height: 46px;
    margin-bottom: 6px;
  }
  .intro {
    margin: 0 0 20px;
  }
  .night-card,
  .game-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    min-height: 80px;
    text-decoration: none;
    color: var(--text);
  }
  .night-card:hover,
  .game-card:hover {
    border-color: var(--primary);
  }
  .night-title,
  .game-title {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .table-names {
    margin: 0;
  }
  .night-lead,
  .winner,
  .outcome {
    color: var(--accent-ink);
  }
  .night-lead {
    display: flex;
    gap: 8px;
    margin: 16px 0;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
  .sm {
    font-size: 0.9rem;
  }
  .empty .btn {
    margin-top: 10px;
  }
</style>
