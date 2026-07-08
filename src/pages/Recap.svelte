<script lang="ts">
  /**
   * Read-only recap of a shared game's results at /recap. The whole game is carried in the URL
   * fragment (never sent to a server), decoded fully on-device, and rendered as final standings
   * plus the round-by-round scorecard. Nothing is written to this device's World — it only shows
   * the outcome, then invites the viewer to keep score of their own.
   */
  import { onMount } from 'svelte';
  import { link } from '../lib/router';
  import { formatDate } from '../lib/util';
  import { decodeRecap, recapView, type RecapView } from '../lib/share/recap';
  import Scoreboard from '../lib/components/Scoreboard.svelte';
  import Avatar from '../lib/components/Avatar.svelte';
  import type { Player } from '../lib/types';

  let status = $state<'loading' | 'ok' | 'error'>('loading');
  let errorMsg = $state('');
  let view = $state<RecapView | null>(null);

  const players = $derived<Player[]>(
    view ? view.players.map((p) => ({ id: p.id, name: p.name, color: p.color, createdAt: 0 })) : [],
  );
  const winnerNames = $derived(
    view
      ? view.winners.map((id) => view!.players.find((p) => p.id === id)?.name ?? '?').join(' & ')
      : '',
  );

  async function decodeFromHash() {
    status = 'loading';
    const wire = window.location.hash.replace(/^#/, '').trim();
    if (!wire) {
      status = 'error';
      errorMsg = 'This link doesn’t have any results in it.';
      return;
    }
    try {
      const payload = await decodeRecap(wire);
      view = recapView(payload);
      status = 'ok';
    } catch (e) {
      status = 'error';
      errorMsg = e instanceof Error ? e.message : 'This results link couldn’t be read.';
    }
  }

  function fmt(d: number): string {
    return d > 0 ? `+${d}` : `${d}`;
  }

  onMount(() => {
    decodeFromHash();
    const onHash = () => decodeFromHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });
</script>

{#if status === 'loading'}
  <div class="skeleton" aria-busy="true" aria-label="Loading results">
    <div class="sk" style="height: 56px"></div>
    <div class="sk" style="height: 184px"></div>
    <div class="sk" style="height: 150px"></div>
  </div>
{:else if status === 'error' || !view}
  <div class="empty">
    <h2>Nothing to show</h2>
    <p class="muted">{errorMsg}</p>
    <a class="btn primary" href="/" use:link>Go to Score King</a>
  </div>
{:else}
  <div class="row" style="gap: 10px; margin: 10px 4px 6px">
    <span style="font-size: 1.7rem">{view.emoji}</span>
    <span>
      <div><strong>{view.title}</strong></div>
      <div class="muted" style="font-size: 0.8rem">Final results · {formatDate(view.finishedAt)}</div>
    </span>
  </div>

  {#if winnerNames}
    <div class="card center banner">🏆 {winnerNames} {view.winners.length > 1 ? 'tie!' : 'wins!'}</div>
  {/if}

  <Scoreboard {players} totals={view.totals} lowerIsBetter={view.lowerIsBetter} winners={view.winners} />

  {#if view.rounds.length}
    <div class="section-title">Scorecard</div>
    <div class="scroll">
      <table class="matrix">
        <thead>
          <tr>
            <th scope="col">Rd</th>
            {#each view.players as p (p.id)}
              <th scope="col"><Avatar name={p.name} color={p.color} size={22} /></th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each view.rounds as row, i (i)}
            <tr>
              <td>{i + 1}</td>
              {#each view.players as _p, j (j)}
                <td class="num">{fmt(row[j] ?? 0)}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <td>Σ</td>
            {#each view.players as p (p.id)}
              <td class="num tot">{view.totals[p.id] ?? 0}</td>
            {/each}
          </tr>
        </tfoot>
      </table>
    </div>
  {/if}

  <div class="cta card center stack">
    <span class="muted">Made with Score King 👑</span>
    <a class="btn primary block" href="/" use:link>Keep score of your own game</a>
  </div>
{/if}

<style>
  .banner {
    font-weight: 700;
    color: var(--accent-ink);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    margin-top: 10px;
  }
  .scroll {
    overflow-x: auto;
  }
  .matrix {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  .matrix th,
  .matrix td {
    padding: 8px 10px;
    text-align: center;
    border-bottom: 1px solid var(--border);
  }
  .matrix .num {
    font-weight: 700;
  }
  .matrix tfoot .tot {
    font-weight: 800;
  }
  .cta {
    margin-top: 16px;
    gap: 10px;
  }
</style>
