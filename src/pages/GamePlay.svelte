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
    restoreRound,
    finishGame,
    reopenGame,
    abandonGame,
    createGame,
    removeGame,
    restoreGame,
  } from '../lib/stores/games';
  import { getModule } from '../lib/games/registry';
  import { computeTotals } from '../lib/scoring';
  import { navigate, link } from '../lib/router';
  import { showToast, showActionToast } from '../lib/stores/toast';
  import { relativeTime } from '../lib/util';
  import { settings } from '../lib/stores/settings';
  import { enableWakeLock, disableWakeLock } from '../lib/wakelock';
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
  let justSavedId = $state<string | null>(null);

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
  const leaderIds = $derived.by(() => {
    const ids = new Set<string>();
    if (!game || rounds.length === 0 || orderedPlayers.length === 0) return ids;
    const vals = orderedPlayers.map((p) => totals[p.id] ?? 0);
    const best = lower ? Math.min(...vals) : Math.max(...vals);
    for (const p of orderedPlayers) if ((totals[p.id] ?? 0) === best) ids.add(p.id);
    return ids;
  });
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

  $effect(() => {
    if ($settings.keepAwake && game?.status === 'active') {
      enableWakeLock();
    } else {
      disableWakeLock();
    }
    return () => disableWakeLock();
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
    const newest = rounds[rounds.length - 1];
    if (newest) {
      justSavedId = newest.id;
      const fid = newest.id;
      setTimeout(() => {
        if (justSavedId === fid) justSavedId = null;
      }, 1000);
    }
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
    const gameSnap = $state.snapshot(game);
    const roundSnap = $state.snapshot(r);
    await removeRound(r, game);
    await load();
    showActionToast(`Round ${r.index + 1} deleted`, 'Undo', async () => {
      await restoreRound(gameSnap, roundSnap);
      await load();
    });
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
  async function doAbandon() {
    if (!game) return;
    game = await abandonGame(game);
  }
  async function playAgain() {
    if (!game) return;
    const g = await createGame(game.type, [...game.playerIds], { ...game.config });
    navigate(`/play/${g.id}`);
  }
  async function deleteGame() {
    if (!game) return;
    const gameSnap = $state.snapshot(game);
    const roundsSnap = $state.snapshot(rounds);
    await removeGame(game.id);
    navigate('/');
    showActionToast('Game deleted', 'Undo', async () => {
      await restoreGame(gameSnap, roundsSnap);
      navigate(`/play/${gameSnap.id}`);
    });
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
  <div class="skeleton" aria-busy="true" aria-label="Loading game">
    <div class="sk" style="height: 56px"></div>
    <div class="sk" style="height: 184px"></div>
    <div class="sk" style="height: 150px"></div>
  </div>
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
          {game.status === 'finished'
            ? 'Finished'
            : game.status === 'abandoned'
              ? 'Abandoned'
              : 'Started'} · {relativeTime(
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
      <button class="btn" onclick={doReopen} title="Reopen to add more rounds">Reopen</button>
      <button class="btn primary grow" onclick={playAgain}>Play again</button>
    </div>
  {:else if game.status === 'abandoned'}
    <div class="card center banner">🪦 Game abandoned — no winner recorded.</div>
    <div class="row" style="gap: 10px; margin-top: 12px">
      <button class="btn" onclick={doReopen} title="Reopen to keep playing">Reopen</button>
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
      <button class="btn danger block" onclick={() => editing && del(editing)}>
        Delete round {editing.index + 1}
      </button>
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
        <button class="btn {canAddRound ? '' : 'primary'}" onclick={doFinish}>Finish &amp; record winner</button>
      </div>
    {:else}
      <button class="btn ghost block" style="margin-top: 12px" onclick={doFinish}>Finish game now</button>
    {/if}
    <button
      class="btn ghost block"
      style="margin-top: 8px; color: var(--muted)"
      onclick={doAbandon}
      title="Stop this game without recording a winner"
    >🪦 Abandon game</button>
  {/if}

  {#if rounds.length}
    <div class="section-title">Scorecard</div>
    <div class="scroll">
      <table class="matrix">
        <thead>
          <tr>
            <th scope="col">Rd</th>
            {#each orderedPlayers as p (p.id)}
              <th scope="col"><Avatar name={p.name} color={p.color} size={22} /></th>
            {/each}
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {#each rounds as r (r.id)}
            <tr class:flash={r.id === justSavedId}>
              <td>{r.index + 1}</td>
              {#each orderedPlayers as p (p.id)}
                <td class="num">{fmt(r.deltas[p.id])}</td>
              {/each}
              <td class="acts">
                {#if game.status === 'active'}
                  <button
                    class="rowbtn"
                    onclick={() => startEdit(r)}
                    aria-label={`Edit round ${r.index + 1}`}
                    title="Edit round"
                  >✎</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            {#each orderedPlayers as p (p.id)}
              <td class="num" class:lead={leaderIds.has(p.id)}>{totals[p.id] ?? 0}</td>
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
    background: color-mix(in srgb, var(--accent) 22%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
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
  .matrix tfoot td,
  .matrix tfoot th {
    border-bottom: none;
    font-weight: 800;
  }
  .matrix tbody tr.flash td {
    animation: rowflash 0.9s ease-out;
  }
  /* Positive "round saved" confirmation: green (success), distinct from gold
     (which means leader only). The new row is already visible; this pulse just
     draws the eye to where the entry landed, and reduced-motion settles it instantly. */
  @keyframes rowflash {
    from {
      background: color-mix(in srgb, var(--good) 26%, transparent);
    }
    to {
      background: transparent;
    }
  }
  .acts {
    white-space: nowrap;
  }
  .matrix td.acts {
    padding: 2px 6px;
  }
  .rowbtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 46px;
    min-height: 46px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 1.05rem;
    color: var(--muted);
  }
  .rowbtn:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .rowbtn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
    color: var(--text);
  }
</style>
