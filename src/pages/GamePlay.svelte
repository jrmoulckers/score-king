<script lang="ts">
  import { onMount } from 'svelte';
  import type { Game, Player, Round, RoundContext } from '../lib/types';
  import { resolveLower } from '../lib/types';
  import * as db from '../lib/storage/db';
  import { players } from '../lib/stores/players';
  import {
    appendRound,
    updateRound,
    removeRound,
    finishGame,
    reopenGame,
    createGame,
    removeGame,
  } from '../lib/stores/games';
  import { getModule } from '../lib/games/registry';
  import { computeTotals } from '../lib/scoring';
  import { navigate, link } from '../lib/router';
  import { showToast } from '../lib/stores/toast';
  import { relativeTime } from '../lib/util';
  import Scoreboard from '../lib/components/Scoreboard.svelte';
  import Avatar from '../lib/components/Avatar.svelte';

  let { id }: { id: string } = $props();

  let game = $state<Game | null>(null);
  let rounds = $state<Round[]>([]);
  let plist = $state<Player[]>([]);
  let loading = $state(true);
  let draft = $state<any>(null);
  let editing = $state<Round | null>(null);
  let editDraft = $state<any>(null);

  const module = $derived(game ? getModule(game.type) : undefined);
  const orderedPlayers = $derived(
    game
      ? (game.playerIds
          .map((pid) => plist.find((p) => p.id === pid))
          .filter(Boolean) as Player[])
      : [],
  );
  const totals = $derived(game ? computeTotals(rounds, game.playerIds) : {});
  const lower = $derived(game && module ? resolveLower(module, game.config) : false);
  const maxR = $derived(
    game && module && module.maxRounds ? module.maxRounds(game.config, game.playerIds.length) : null,
  );
  const canAddRound = $derived(maxR == null || rounds.length < maxR);
  const finishedReady = $derived.by(() => {
    if (!game || !module) return false;
    if (maxR != null && rounds.length >= maxR) return true;
    if (module.isFinished) {
      return module.isFinished(totals, {
        config: game.config,
        roundCount: rounds.length,
        playerCount: game.playerIds.length,
      });
    }
    return false;
  });

  function buildCtx(roundIndex: number, t: Record<string, number>): RoundContext {
    return {
      game: game!,
      players: orderedPlayers,
      config: game!.config,
      roundIndex,
      totals: t,
      rounds,
    };
  }
  function totalsBefore(i: number): Record<string, number> {
    return computeTotals(rounds.slice(0, i), game!.playerIds);
  }

  function resetDraft() {
    if (game && module) {
      draft = module.createRoundInput(buildCtx(rounds.length, computeTotals(rounds, game.playerIds)));
    } else {
      draft = null;
    }
  }

  async function load() {
    loading = true;
    plist = await db.getAllPlayers();
    game = (await db.getGame(id)) ?? null;
    rounds = game ? await db.getRounds(id) : [];
    editing = null;
    editDraft = null;
    resetDraft();
    loading = false;
  }

  onMount(() => {
    const unsub = players.subscribe((v) => (plist = v));
    load();
    return unsub;
  });

  async function saveRound() {
    if (!game || !module || !draft) return;
    const ctx = buildCtx(rounds.length, computeTotals(rounds, game.playerIds));
    const snap = $state.snapshot(draft);
    const err = module.validateRound(snap, ctx);
    if (err) {
      showToast(err);
      return;
    }
    const deltas = module.scoreRound(snap, ctx);
    await appendRound(game, snap, deltas);
    await load();
  }

  function startEdit(r: Round) {
    editing = r;
    editDraft = $state.snapshot(r.input);
  }
  function cancelEdit() {
    editing = null;
    editDraft = null;
  }
  async function saveEdit() {
    if (!game || !module || !editing) return;
    const ctx = buildCtx(editing.index, totalsBefore(editing.index));
    const snap = $state.snapshot(editDraft);
    const err = module.validateRound(snap, ctx);
    if (err) {
      showToast(err);
      return;
    }
    const deltas = module.scoreRound(snap, ctx);
    await updateRound(editing, snap, deltas);
    await load();
  }

  async function del(r: Round) {
    if (!game) return;
    if (!confirm(`Delete round ${r.index + 1}?`)) return;
    await removeRound(r, game);
    await load();
  }

  async function doFinish() {
    if (!game) return;
    game = await finishGame(game);
  }
  async function doReopen() {
    if (!game) return;
    game = await reopenGame(game);
    resetDraft();
  }
  async function playAgain() {
    if (!game) return;
    const g = await createGame(game.type, [...game.playerIds], { ...game.config });
    navigate(`/play/${g.id}`);
  }
  async function deleteGame() {
    if (!game) return;
    if (!confirm('Delete this entire game and its scores?')) return;
    await removeGame(game.id);
    navigate('/');
  }

  function fmt(d: number | undefined): string {
    if (d === undefined || d === null) return '·';
    return d > 0 ? `+${d}` : `${d}`;
  }
  const winnerNames = $derived(
    (game?.winnerIds ?? []).map((wid) => plist.find((p) => p.id === wid)?.name ?? '?').join(' & '),
  );
</script>

{#if loading}
  <div class="empty">Loading…</div>
{:else if !game || !module}
  <div class="empty">
    <h2>Game not found</h2>
    <a class="btn primary" href="/" use:link>Back to games</a>
  </div>
{:else}
  <div class="row spread" style="margin: 10px 4px 6px">
    <span class="row" style="gap: 10px">
      <span style="font-size: 1.7rem">{module.emoji}</span>
      <span>
        <div><strong>{module.name}</strong></div>
        <div class="muted" style="font-size: 0.8rem">
          {game.status === 'finished' ? 'Finished' : 'Started'} · {relativeTime(
            game.finishedAt ?? game.createdAt,
          )}
        </div>
      </span>
    </span>
    <button class="iconbtn" onclick={deleteGame} aria-label="Delete game" title="Delete game">🗑</button>
  </div>

  <Scoreboard players={orderedPlayers} {totals} lowerIsBetter={lower} winners={game.winnerIds ?? []} />

  {#if game.status === 'finished'}
    <div class="card center banner">🏆 {winnerNames || 'Nobody'} {(game.winnerIds?.length ?? 0) > 1 ? 'tie!' : 'wins!'}</div>
    <div class="row" style="gap: 10px; margin-top: 12px">
      <button class="btn" onclick={doReopen}>Reopen</button>
      <button class="btn primary grow" onclick={playAgain}>Play again</button>
    </div>
  {:else if editing}
    {@const EditorC = module.RoundEditor}
    {@const ectx = buildCtx(editing.index, totalsBefore(editing.index))}
    <div class="card stack" style="margin-top: 12px">
      <strong>Editing round {editing.index + 1}</strong>
      <EditorC bind:input={editDraft} ctx={ectx} />
      <div class="row" style="gap: 10px">
        <button class="btn grow" onclick={cancelEdit}>Cancel</button>
        <button class="btn primary grow" onclick={saveEdit}>Save changes</button>
      </div>
    </div>
  {:else}
    {#if canAddRound}
      {@const actx = buildCtx(rounds.length, totals)}
      {@const AddEditor = module.RoundEditor}
      <div class="card stack" style="margin-top: 12px">
        <strong>Round {rounds.length + 1}{maxR ? ` of ${maxR}` : ''}</strong>
        {#if draft}
          <AddEditor bind:input={draft} ctx={actx} />
        {/if}
        <button class="btn primary block" onclick={saveRound}>Save round</button>
      </div>
    {:else}
      <div class="card center" style="margin-top: 12px">All {maxR} rounds played.</div>
    {/if}

    {#if finishedReady}
      <div class="card center stack" style="margin-top: 12px">
        <span>🏁 This game looks complete.</span>
        <button class="btn primary" onclick={doFinish}>Finish &amp; record winner</button>
      </div>
    {:else}
      <button class="btn ghost block" style="margin-top: 12px" onclick={doFinish}>Finish game now</button>
    {/if}
  {/if}

  {#if rounds.length}
    <div class="section-title">Scorecard</div>
    <div class="scroll">
      <table class="matrix">
        <thead>
          <tr>
            <th>R</th>
            {#each orderedPlayers as p (p.id)}
              <th><Avatar name={p.name} color={p.color} size={22} /></th>
            {/each}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each rounds as r (r.id)}
            <tr>
              <td>{r.index + 1}</td>
              {#each orderedPlayers as p (p.id)}
                <td class="num">{fmt(r.deltas[p.id])}</td>
              {/each}
              <td class="acts">
                {#if game.status !== 'finished'}
                  <button class="mini" onclick={() => startEdit(r)} aria-label="Edit">✎</button>
                  <button class="mini" onclick={() => del(r)} aria-label="Delete">🗑</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <td>Σ</td>
            {#each orderedPlayers as p (p.id)}
              <td class="num lead">{totals[p.id] ?? 0}</td>
            {/each}
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  {/if}
{/if}

<style>
  .banner {
    margin-top: 12px;
    font-size: 1.15rem;
    font-weight: 800;
    background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  }
  .scroll {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .matrix th,
  .matrix td {
    padding: 8px 10px;
    text-align: center;
    border-bottom: 1px solid var(--border);
  }
  .matrix .num {
    font-variant-numeric: tabular-nums;
  }
  .matrix tfoot td {
    border-bottom: none;
    font-weight: 800;
  }
  .acts {
    white-space: nowrap;
  }
  .mini {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 0.95rem;
    padding: 2px 4px;
    color: var(--muted);
  }
  .mini:hover {
    color: var(--text);
  }
</style>
