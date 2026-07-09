<script lang="ts">
  import { onMount } from 'svelte';
  import { games } from '../lib/stores/games';
  import { players } from '../lib/stores/players';
  import { settings } from '../lib/stores/settings';
  import { getModule } from '../lib/games/registry';
  import BackLink from '../lib/components/BackLink.svelte';
  import { link } from '../lib/router';
  import * as db from '../lib/storage/db';
  import Avatar from '../lib/components/Avatar.svelte';
  import type { Player, Round } from '../lib/types';
  import { computeStats, buildCourt, fmtPct, fmtAvg, rangePresets, type LeaderRow } from '../lib/stats';

  let rounds = $state<Round[]>([]);
  let loaded = $state(false);
  onMount(async () => {
    rounds = await db.getAllRounds();
    loaded = true;
  });

  const ranges = rangePresets();
  let rangeKey = $state('all');
  const activeRange = $derived(ranges.find((r) => r.key === rangeKey)?.range);

  type SortKey = 'wins' | 'winRate' | 'played' | 'streak' | 'avgFinish';
  let sortKey = $state<SortKey>('wins');
  let filterType = $state<string>('all');

  const meId = $derived($settings.leadMemberId);
  const roast = $derived($settings.roastMode);
  const playerById = $derived(new Map<string, Player>($players.map((p) => [p.id, p])));
  const nameOf = (id: string | undefined): string => (id ? playerById.get(id)?.name ?? 'Someone' : '—');
  const gameLabel = (type: string): string => getModule(type)?.name ?? type;
  const gameEmoji = (type: string): string => getModule(type)?.emoji ?? '🎲';

  // Distinct finished-game types drive the lens chips (stable regardless of filter).
  const gameTypes = $derived(
    [...new Set($games.filter((g) => g.status === 'finished').map((g) => g.type))].sort(),
  );

  // One engine pass, optionally lensed to a single game and/or time window — the whole Court follows it.
  const result = $derived(
    loaded
      ? computeStats(
          { players: $players, games: $games, rounds },
          {
            ...(filterType === 'all' ? {} : { gameType: filterType }),
            ...(activeRange ? { range: activeRange } : {}),
          },
          { gameStats: (type) => getModule(type)?.stats },
        )
      : undefined,
  );
  const court = $derived(result ? buildCourt(result) : undefined);
  const hasData = $derived((result?.totals.finishedGames ?? 0) > 0);
  // Whether the group has *any* finished game at all (range-independent), so the
  // time-lens chips stay on screen even when the current window is empty.
  const hasAnyFinished = $derived($games.some((g) => g.status === 'finished'));

  const sorters: Record<SortKey, (a: LeaderRow, b: LeaderRow) => number> = {
    wins: (a, b) => b.wins - a.wins || b.winRate - a.winRate,
    winRate: (a, b) => b.winRate - a.winRate || b.wins - a.wins,
    played: (a, b) => b.played - a.played || b.wins - a.wins,
    streak: (a, b) => b.currentStreak - a.currentStreak || b.wins - a.wins,
    avgFinish: (a, b) => (a.avgFinish ?? 99) - (b.avgFinish ?? 99) || b.wins - a.wins,
  };
  const standings = $derived([...(result?.leaderboard ?? [])].sort(sorters[sortKey]));

  // Matrix / rivalry read off the same members, ranked by the live standings.
  const courtMembers = $derived(
    standings.map((r) => playerById.get(r.playerId)).filter((p): p is Player => !!p),
  );
  const h2h = (aId: string, bId: string) => result?.perPlayer[aId]?.headToHead[bId];

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'wins', label: 'Wins' },
    { key: 'winRate', label: 'Win %' },
    { key: 'played', label: 'Games' },
    { key: 'streak', label: 'Streak' },
    { key: 'avgFinish', label: 'Avg' },
  ];

  const parityText = (p: number): string =>
    p >= 0.66 ? 'Anyone’s crown' : p >= 0.33 ? 'A clear favourite' : 'One-horse race';
</script>

<BackLink href="/stats" label="Stats" />
<h1 style="margin: 0 4px 8px">👑 The Court</h1>

{#if !loaded}
  <div class="empty">Gathering the court…</div>
{:else if !hasAnyFinished}
  <div class="empty">Finish a game and the court will assemble — Kings, rivalries and all.</div>
{:else}
  <!-- Time lens: the whole Court can focus on a window -->
  <div class="row wrap seg" role="group" aria-label="Filter by time">
    {#each ranges as r (r.key)}
      <button class="chip" class:on={rangeKey === r.key} onclick={() => (rangeKey = r.key)}>{r.label}</button>
    {/each}
  </div>

  <!-- Lens chips: whole Court can focus on one game -->
  {#if gameTypes.length > 1}
    <div class="row wrap seg" role="group" aria-label="Filter by game">
      <button class="chip" class:on={filterType === 'all'} onclick={() => (filterType = 'all')}>All games</button>
      {#each gameTypes as t (t)}
        <button class="chip" class:on={filterType === t} onclick={() => (filterType = t)}>
          {gameEmoji(t)} {gameLabel(t)}
        </button>
      {/each}
    </div>
  {/if}

  {#if result && court && hasData}
  <!-- 1 ─ The Throne -->
  <div class="section-title">The Throne</div>
  <section class="card throne" aria-label="Who reigns">
    {#if court.throne.overallId}
      {@const k = playerById.get(court.throne.overallId)}
      <div class="row" style="gap: 12px">
        <span class="crown" aria-hidden="true">👑</span>
        {#if k}<Avatar name={k.name} color={k.color} size={40} />{/if}
        <div class="grow">
          <div class="lead" style="font-size: 1.15rem">{nameOf(court.throne.overallId)}</div>
          <div class="muted sm">
            reigns with <b class="tnum">{court.throne.overallWins}</b> wins ·
            <b class="tnum">{fmtPct(court.throne.overallWinRate)}</b>
          </div>
        </div>
        {#if court.throne.overallId === meId}<span class="you">You</span>{/if}
      </div>
    {/if}

    {#if court.throne.ironThroneId && court.throne.ironThroneStreak > 1}
      <div class="row belt" style="gap: 10px">
        <span aria-hidden="true">🔥</span>
        <span class="grow">
          <b>{nameOf(court.throne.ironThroneId)}</b> holds the Iron Throne —
          <b class="tnum">{court.throne.ironThroneStreak}</b> straight
        </span>
      </div>
    {/if}
  </section>

  {#if court.throne.kings.length > 0}
    <div class="section-title">Reigning kings</div>
    <div class="stack">
      {#each court.throne.kings as king (king.gameType)}
        {@const k = playerById.get(king.holderId)}
        <div class="card row spread tile">
          <span class="row" style="gap: 10px">
            <span style="font-size: 1.3rem" aria-hidden="true">{gameEmoji(king.gameType)}</span>
            <span>
              <div class="muted sm">{gameLabel(king.gameType)}</div>
              <div class="row" style="gap: 8px">
                {#if k}<Avatar name={k.name} color={k.color} size={20} />{/if}
                <strong>{nameOf(king.holderId)}</strong>
                {#if king.holderId === meId}<span class="you">You</span>{/if}
              </div>
            </span>
          </span>
          <span class="row" style="gap: 10px">
            <span class="muted sm"><b class="tnum">{fmtPct(king.winRate)}</b></span>
            <b class="tnum lead">{king.wins}W</b>
          </span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- 2 ─ Standings -->
  <div class="section-title">Standings</div>
  <div class="row wrap seg" role="group" aria-label="Sort standings">
    {#each sortOptions as o (o.key)}
      <button class="chip" class:on={sortKey === o.key} onclick={() => (sortKey = o.key)}>{o.label}</button>
    {/each}
  </div>
  <div class="card stack">
    {#each standings as row, i (row.playerId)}
      {@const p = playerById.get(row.playerId)}
      <div class="row spread" class:me={row.playerId === meId}>
        <span class="row" style="gap: 8px">
          <span class="rank tnum" class:lead={i === 0}>{i + 1}</span>
          {#if p}<Avatar name={p.name} color={p.color} size={22} />{/if}
          <span>{p?.name ?? '—'}</span>
          {#if row.playerId === meId}<span class="you">You</span>{/if}
        </span>
        <span class="row figures">
          <span class="fig"><b class="tnum" class:lead={i === 0}>{row.wins}</b><span class="lbl">W</span></span>
          <span class="fig"><b class="tnum">{fmtPct(row.winRate)}</b><span class="lbl">win</span></span>
          <span class="fig"><b class="tnum">{row.avgFinish ? fmtAvg(row.avgFinish) : '—'}</b><span class="lbl">avg</span></span>
          <span class="fig">
            <b class="tnum">{row.currentStreak > 0 ? `🔥${row.currentStreak}` : '—'}</b><span class="lbl">run</span>
          </span>
        </span>
      </div>
    {/each}
  </div>

  <!-- 3 ─ Rivalries -->
  {#if court.hottestRivalry || court.biggestMismatch}
    <div class="section-title">Rivalries</div>
    <div class="stack">
      {#if court.hottestRivalry}
        {@const r = court.hottestRivalry}
        <div class="card stack" style="gap: 8px">
          <div class="row spread">
            <span class="row" style="gap: 8px"><span aria-hidden="true">⚔️</span><strong>Hottest rivalry</strong></span>
            <span class="pill sm"><b class="tnum">{r.games}</b> games</span>
          </div>
          <div class="row spread vs">
            <span class="side">{nameOf(r.aId)}</span>
            <span class="score tnum">{r.aWins}–{r.bWins}</span>
            <span class="side end">{nameOf(r.bId)}</span>
          </div>
        </div>
      {/if}
      {#if court.biggestMismatch}
        {@const r = court.biggestMismatch}
        {@const lead = r.aWins >= r.bWins ? r.aId : r.bId}
        {@const trail = r.aWins >= r.bWins ? r.bId : r.aId}
        {@const hi = Math.max(r.aWins, r.bWins)}
        {@const lo = Math.min(r.aWins, r.bWins)}
        <div class="card row spread tile">
          <span class="row" style="gap: 8px"><span aria-hidden="true">🎯</span><strong>Biggest mismatch</strong></span>
          <span class="muted sm">
            <b>{nameOf(lead)}</b> owns <b>{nameOf(trail)}</b> <b class="tnum">{hi}–{lo}</b>
          </span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 4 ─ Head-to-head matrix -->
  {#if courtMembers.length > 1}
    <div class="section-title">Head to head</div>
    <div class="card matrix-wrap">
      <table class="matrix">
        <thead>
          <tr>
            <th class="corner" scope="col"><span class="vh">Row beats column</span></th>
            {#each courtMembers as c (c.id)}
              <th scope="col" title={c.name}><Avatar name={c.name} color={c.color} size={22} /></th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each courtMembers as rowM (rowM.id)}
            <tr>
              <th scope="row" class="rowhead">
                <Avatar name={rowM.name} color={rowM.color} size={22} />
                <span class="nm">{rowM.name}</span>
              </th>
              {#each courtMembers as colM (colM.id)}
                {#if colM.id === rowM.id}
                  <td class="diag">—</td>
                {:else}
                  {@const rec = h2h(rowM.id, colM.id)}
                  <td
                    class:win={rec && rec.wins > rec.losses}
                    class:loss={rec && rec.wins < rec.losses}
                    title={`${rowM.name} vs ${colM.name}`}
                  >
                    {#if rec}<span class="tnum">{rec.wins}–{rec.losses}</span>{:else}<span class="muted">·</span>{/if}
                  </td>
                {/if}
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- 5 ─ Wall of Fame -->
  {#if result.records.length > 0}
    <div class="section-title">Wall of fame</div>
    <div class="card stack">
      {#each result.records as rec (rec.key)}
        {#snippet recBody()}
          <span class="row" style="gap: 8px"><span aria-hidden="true">{rec.emoji}</span>{rec.label}</span>
          <span class="row" style="gap: 8px">
            <b class="tnum">{rec.value}</b>
            {#if rec.holderId}
              {@const h = playerById.get(rec.holderId)}
              {#if h}<Avatar name={h.name} color={h.color} size={20} />{/if}
              {#if rec.holderId === meId}<span class="you">You</span>{/if}
            {/if}
            {#if rec.gameId}<span class="recgo" aria-hidden="true">›</span>{/if}
          </span>
        {/snippet}
        {#if rec.gameId}
          <a class="row spread reclink" href={`/play/${rec.gameId}`} use:link aria-label={`${rec.label} — view game`}>{@render recBody()}</a>
        {:else}
          <div class="row spread">{@render recBody()}</div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- 6 ─ Group pulse -->
  <div class="section-title">Group pulse</div>
  <div class="card stack">
    <div class="stack" style="gap: 6px">
      <div class="row spread">
        <span class="row" style="gap: 8px"><span aria-hidden="true">⚖️</span>Parity</span>
        <span class="muted sm">{parityText(court.parity)}</span>
      </div>
      <div class="parity" role="img" aria-label={`Parity ${parityText(court.parity)}`}>
        <span class="parity-fill" style={`transform:scaleX(${court.parity})`}></span>
      </div>
    </div>
    <div class="row wrap" style="gap: 8px">
      <span class="pill">🌙 <b class="tnum">{result.totals.gameNights}</b> game nights</span>
      <span class="pill">🎲 <b class="tnum">{result.totals.finishedGames}</b> games</span>
      <span class="pill">👥 <b class="tnum">{standings.length}</b> players</span>
    </div>
  </div>

  <!-- 7 ─ Wall of Shame (lighthearted, opt-out via roastMode) -->
  {#if roast && (court.shame.coldestId || court.shame.winlessIds.length > 0)}
    <div class="section-title">Wall of shame 😅</div>
    <div class="card stack">
      {#if court.shame.coldestId}
        <div class="row spread">
          <span class="row" style="gap: 8px"><span aria-hidden="true">🥶</span>Coldest spell</span>
          <span class="muted sm">
            <b>{nameOf(court.shame.coldestId)}</b> · <b class="tnum">{fmtPct(court.shame.coldestWinRate ?? 0)}</b>
          </span>
        </div>
      {/if}
      {#if court.shame.winlessIds.length > 0}
        <div class="row spread">
          <span class="row" style="gap: 8px"><span aria-hidden="true">🫥</span>Still hunting a first win</span>
          <span class="muted sm">{court.shame.winlessIds.map(nameOf).join(', ')}</span>
        </div>
      {/if}
    </div>
  {/if}
  {:else}
    <div class="empty">No finished games in this window — widen the time lens.</div>
  {/if}
{/if}

<style>
  .tnum {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .sm {
    font-size: 0.82rem;
  }
  /* Lens + sort chips — a quiet segmented control on the surface ramp. */
  .seg {
    gap: 6px;
    margin: 0 2px 8px;
  }
  .chip {
    min-height: 46px;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .chip.on {
    background: var(--surface-3);
    color: var(--text);
    border-color: color-mix(in srgb, var(--text) 30%, var(--border));
  }

  .throne {
    background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 10%, var(--surface)), var(--surface));
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }
  .crown {
    font-size: 1.7rem;
    line-height: 1;
  }
  .belt {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .tile {
    min-height: 46px;
  }

  /* Wall-of-fame rows link to the game that set the record — closing the
     stat → game loop without changing the row's quiet look. */
  .reclink {
    color: inherit;
    text-decoration: none;
    min-height: 44px;
    margin: 0 -8px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
  }
  .reclink:hover {
    background: var(--surface-2);
  }
  .recgo {
    color: var(--muted);
    font-size: 1.1rem;
    line-height: 1;
  }

  .rank {
    display: inline-block;
    min-width: 1.4em;
    text-align: center;
    color: var(--muted);
  }
  .you {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-2);
  }
  .row.me {
    margin: 0 -8px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .pill.sm {
    font-size: 0.7rem;
    padding: 1px 7px;
  }

  /* Standings figures — compact, right-aligned, tabular. */
  .figures {
    gap: 12px;
  }
  .fig {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    line-height: 1.05;
    min-width: 2.4em;
  }
  .fig .lbl {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    font-weight: 600;
  }

  /* Rivalry vs bar */
  .vs .side {
    flex: 1;
    font-weight: 700;
  }
  .vs .side.end {
    text-align: right;
  }
  .vs .score {
    padding: 2px 12px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }

  /* Head-to-head matrix */
  .matrix-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .matrix {
    border-collapse: collapse;
    min-width: max-content;
  }
  .matrix th,
  .matrix td {
    padding: 6px 8px;
    text-align: center;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .matrix thead th {
    position: sticky;
    top: 0;
  }
  .matrix .corner {
    text-align: left;
  }
  .matrix .rowhead {
    display: flex;
    align-items: center;
    gap: 6px;
    text-align: left;
    font-weight: 600;
  }
  .matrix .rowhead .nm {
    max-width: 6.5em;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .matrix .diag {
    color: var(--muted);
  }
  .matrix td.win {
    color: var(--accent-ink);
    font-weight: 700;
  }
  .matrix td.loss {
    color: var(--muted);
  }
  .vh {
    font-size: 0.7rem;
    color: var(--muted);
    font-weight: 600;
  }

  /* Parity meter — neutral (never gold/violet), state also carried by the label. */
  .parity {
    height: 10px;
    border-radius: 999px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .parity-fill {
    display: block;
    height: 100%;
    width: 100%;
    transform-origin: left center;
    background: color-mix(in srgb, var(--text) 45%, var(--surface-3));
    transition: transform 0.4s ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .parity-fill {
      transition: none;
    }
  }
</style>
