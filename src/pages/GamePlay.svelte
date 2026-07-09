<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Game, ID, Player, Round, RoundContext } from '../lib/types';
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
  import { customGameDefs } from '../lib/stores/customGames';
  import { computeTotals, leaders } from '../lib/scoring';
  import { navigate, link, absoluteUrl } from '../lib/router';
  import { showToast, showActionToast } from '../lib/stores/toast';
  import { announce } from '../lib/stores/announcer';
  import { relativeTime, generateJoinCode } from '../lib/util';
  import { settings } from '../lib/stores/settings';
  import { leadMember } from '../lib/stores/identity';
  import { enableWakeLock, disableWakeLock } from '../lib/wakelock';
  import Scoreboard from '../lib/components/Scoreboard.svelte';
  import Avatar from '../lib/components/Avatar.svelte';
  import PlaySheet from '../lib/components/PlaySheet.svelte';
  import ShareResultsSheet from '../lib/components/ShareResultsSheet.svelte';
  import BackLink from '../lib/components/BackLink.svelte';
  import { buildRecapPayload } from '../lib/share/recap';
  import { get } from 'svelte/store';
  import {
    startHosting,
    startHostingNearby,
    leaveSession,
    publish,
    runHostExclusive,
    currentSelf,
    isLiveSupported,
    isNearbySupported,
    liveActive,
    liveStatus,
    liveParticipants,
    liveCode,
    liveRemote,
    liveConnection,
  } from '../lib/live/session';
  import type { HostHandlers, NearbyHostControls } from '../lib/live/session';
  import type { LiveState, LiveIntent } from '../lib/live/protocol';

  let { id }: { id: string } = $props();

  let game = $state<Game | null>(null);
  let rounds = $state<Round[]>([]);
  let plist = $state<Player[]>([]);
  let loading = $state(true);
  let draft = $state<any>(null);
  let editing = $state<Round | null>(null);
  let editDraft = $state<any>(null);
  let justSavedId = $state<string | null>(null);
  // Scorecard cells can show each round's delta (default) or the running total
  // through that round, so you can see how the lead was built and when it changed.
  let showRunning = $state(false);

  const module = $derived.by(() => {
    void $customGameDefs;
    return game ? getModule(game.type) : undefined;
  });
  const orderedPlayers = $derived(
    game
      ? (game.playerIds
          .map((pid) => plist.find((p) => p.id === pid))
          .filter(Boolean) as Player[])
      : [],
  );
  const totals = $derived(game ? computeTotals(rounds, game.playerIds) : {});
  const lower = $derived(game && module ? resolveLower(module, game.config) : false);
  // Shared "who's actually ahead" rule: empty until scores diverge, so the gold
  // footer total and the leader announcement never crown a tied-at-zero table.
  const leaderIds = $derived(game ? leaders(totals, game.playerIds, lower) : new Set<string>());
  const maxR = $derived(
    game && module && module.maxRounds ? module.maxRounds(game.config, game.playerIds.length) : null,
  );
  const canAddRound = $derived(maxR == null || rounds.length < maxR);
  // Validate the in-progress entry live so an invalid round is caught inline —
  // Save is disabled with the reason shown — instead of only surfacing as a
  // transient toast after a tap that's easy to miss one-handed in dim light.
  const draftError = $derived.by(() => {
    if (!game || !module || !draft) return null;
    try {
      return module.validateRound($state.snapshot(draft), buildCtx(rounds.length, totals));
    } catch {
      return null;
    }
  });
  const editError = $derived.by(() => {
    if (!game || !module || !editing || editDraft == null) return null;
    try {
      return module.validateRound(
        $state.snapshot(editDraft),
        buildCtx(editing.index, totalsBefore(editing.index)),
      );
    } catch {
      return null;
    }
  });
  // Cumulative total for each player through each round, keyed by round id, for
  // the "Running totals" scorecard view.
  const runningTotals = $derived.by(() => {
    const acc: Record<string, number> = {};
    for (const pid of game?.playerIds ?? []) acc[pid] = 0;
    const map: Record<string, Record<string, number>> = {};
    for (const r of rounds) {
      for (const [pid, d] of Object.entries(r.deltas)) acc[pid] = (acc[pid] ?? 0) + d;
      map[r.id] = { ...acc };
    }
    return map;
  });
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

  // A short, glanceable standing for screen readers — who's on top and by what
  // number — so an assistive-tech user learns what a sighted player sees the
  // moment a round lands, without having to re-read the whole board.
  function leaderSummary(): string {
    const leaders = orderedPlayers.filter((p) => leaderIds.has(p.id));
    if (leaders.length === 0) return '';
    const best = totals[leaders[0].id] ?? 0;
    const names = leaders.map((p) => p.name).join(' and ');
    return leaders.length === 1
      ? `${names} leads with ${best}.`
      : `${names} tie for the lead with ${best}.`;
  }

  async function saveRound() {
    if (!game || !module || !draft) return;
    const snap = $state.snapshot(draft);
    const saved = await hostSerial(async () => {
      if (!game || !module) return false;
      const ctx = buildCtx(rounds.length, computeTotals(rounds, game.playerIds));
      const err = module.validateRound(snap, ctx);
      if (err) {
        showToast(err);
        return false;
      }
      const deltas = module.scoreRound(snap, ctx);
      await appendRound(game, snap, deltas);
      await load();
      publish();
      return true;
    });
    if (!saved) return;
    const newest = rounds[rounds.length - 1];
    if (newest) {
      pulseRow(newest.id);
      announce(`Round ${newest.index + 1} saved. ${leaderSummary()}`);
    }
  }

  // Briefly pulse a scorecard row green to confirm it just landed. The host's own saves and
  // guests' accepted rounds share this, so every recorded round reads the same on the board.
  function pulseRow(id: string): void {
    justSavedId = id;
    setTimeout(() => {
      if (justSavedId === id) justSavedId = null;
    }, 1000);
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
    const snap = $state.snapshot(editDraft);
    const ed = editing;
    await hostSerial(async () => {
      if (!game || !module) return;
      const ctx = buildCtx(ed.index, totalsBefore(ed.index));
      const err = module.validateRound(snap, ctx);
      if (err) {
        showToast(err);
        return;
      }
      const deltas = module.scoreRound(snap, ctx);
      await updateRound(ed, snap, deltas);
      await load();
      publish();
    });
    announce(`Round ${ed.index + 1} updated. ${leaderSummary()}`);
  }

  async function del(r: Round) {
    if (!game) return;
    const gameSnap = $state.snapshot(game);
    const roundSnap = $state.snapshot(r);
    await hostSerial(async () => {
      if (!game) return;
      await removeRound(r, game);
      await load();
      publish();
    });
    showActionToast(`Round ${r.index + 1} deleted`, 'Undo', async () => {
      await hostSerial(async () => {
        await restoreRound(gameSnap, roundSnap);
        await load();
        publish();
      });
    });
  }

  async function doFinish() {
    if (!game) return;
    await hostSerial(async () => {
      if (!game) return;
      game = await finishGame(game);
      publish();
    });
    const names = (game?.winnerIds ?? [])
      .map((wid) => plist.find((p) => p.id === wid)?.name ?? '?')
      .join(' and ');
    if (names) {
      announce(`Game finished. ${names} ${(game?.winnerIds?.length ?? 0) > 1 ? 'tie for the win' : 'wins'}.`);
    }
  }
  async function doReopen() {
    if (!game) return;
    await hostSerial(async () => {
      if (!game) return;
      game = await reopenGame(game);
      resetDraft();
      publish();
    });
  }
  async function doAbandon() {
    if (!game) return;
    await hostSerial(async () => {
      if (!game) return;
      game = await abandonGame(game);
      publish();
    });
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

  // ── Share results (read-only recap) ────────────────────────────────────
  let shareOpen = $state(false);
  const sharePayload = $derived(
    game && game.status === 'finished' ? buildRecapPayload(game, orderedPlayers, rounds) : null,
  );

  // ── Live co-play (host-authoritative) ──────────────────────────────────
  // The leader keeps using this very screen; the engine just mirrors the game
  // to guests and feeds their round proposals back through the same store flow.
  const liveSupported = isLiveSupported();
  const nearbySupported = isNearbySupported();
  let sheetOpen = $state(false);
  let nearbyControls = $state<NearbyHostControls | null>(null);
  // Which transport backs the active session (online = relay/broadcast, nearby = WebRTC).
  let liveKind = $state<'relay' | 'nearby' | null>(null);
  const liveLink = $derived($liveCode ? absoluteUrl(`/join/${$liveCode}`) : '');
  const liveMode = $derived(liveKind === 'nearby' ? 'nearby' : 'online');

  // While hosting, route the host's own durable writes through the engine's serial queue
  // so a guest's intent can't interleave with a local save on the non-atomic append/reindex.
  function hostSerial<T>(fn: () => Promise<T>): Promise<T> {
    return get(liveStatus) === 'hosting' ? runHostExclusive(fn) : fn();
  }

  function buildLiveState(): LiveState {
    return {
      game: $state.snapshot(game)!,
      players: $state.snapshot(orderedPlayers),
      rounds: $state.snapshot(rounds),
      rev: 0,
    };
  }

  async function applyLiveIntent(intent: LiveIntent, from: ID): Promise<string | null> {
    if (intent.kind !== 'record-round') return 'That action isn’t supported.';
    if (!game || !module) return 'The game isn’t ready yet.';
    if (game.status !== 'active') return 'This game has finished.';
    if (!canAddRound) return `All ${maxR} rounds have been played.`;
    const ctx = buildCtx(rounds.length, computeTotals(rounds, game.playerIds));
    const err = module.validateRound(intent.input, ctx);
    if (err) return err;
    const deltas = module.scoreRound(intent.input, ctx);
    await appendRound(game, intent.input, deltas);
    await load();
    // Surface the guest's contribution on the host (the source of truth): pulse the new row and
    // name who added it, so a round arriving from another device never lands silently.
    const landed = rounds[rounds.length - 1];
    if (landed) pulseRow(landed.id);
    const who = get(liveParticipants).find((p) => p.id === from)?.name;
    showToast(`${who ?? 'A player'} added Round ${rounds.length}`);
    return null;
  }

  function hostHandlers(): HostHandlers {
    return { self: currentSelf('leader'), buildState: buildLiveState, applyIntent: applyLiveIntent };
  }

  /** One entry point: "play together". Leads online, or nearby when the device is offline. */
  async function startTogether() {
    if (!game) return;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline && nearbySupported) await startNearby();
    else await startLive();
  }

  async function startLive() {
    if (!game) return;
    try {
      await startHosting(generateJoinCode(), hostHandlers());
      nearbyControls = null;
      liveKind = 'relay';
      sheetOpen = true;
    } catch {
      showToast('Couldn’t start live play on this device.');
    }
  }

  async function startNearby() {
    if (!game) return;
    try {
      nearbyControls = await startHostingNearby(generateJoinCode(), hostHandlers());
      liveKind = 'nearby';
      sheetOpen = true;
    } catch {
      showToast('Couldn’t start nearby play on this device.');
    }
  }

  /** Swap transports from inside the sheet without ending the session (host's explicit choice).
   * PlaySheet owns the "this disconnects joined players" confirm (an in-app themed dialog), so by
   * the time this runs the host has already agreed. */
  async function switchMode(to: 'online' | 'nearby') {
    if (to === 'nearby') await startNearby();
    else await startLive();
  }

  function openLiveSheet() {
    sheetOpen = true;
  }

  async function stopLive() {
    await leaveSession();
    sheetOpen = false;
  }

  $effect(() => {
    // Clean up only when the session truly ends — not during a transport swap, which passes
    // briefly through 'connecting' on its way back to 'hosting'.
    if ($liveStatus === 'off' || $liveStatus === 'error') {
      sheetOpen = false;
      nearbyControls = null;
      liveKind = null;
    }
  });

  onDestroy(() => {
    if (get(liveStatus) === 'hosting') void leaveSession();
  });
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
  <BackLink href="/" label="Games" />
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

  {#if liveSupported && game.status === 'active'}
    {#if $liveActive}
      <button class="card row spread livebar" onclick={openLiveSheet}>
        <span class="row" style="gap: 10px">
          <span
            class="livedot"
            class:reconnecting={$liveConnection === 'reconnecting'}
            class:offline={$liveConnection === 'offline'}
            aria-hidden="true"
          ></span>
          <span style="display: flex; flex-direction: column; text-align: left">
            <strong>Live game</strong>
            <span class="muted" style="font-size: 0.8rem">
              {#if $liveConnection === 'reconnecting'}
                Reconnecting…
              {:else if $liveConnection === 'offline'}
                Offline · your game is safe
              {:else}
                {$liveParticipants.length} here · tap to {liveKind === 'nearby' ? 'add players' : 'share'}
              {/if}
            </span>
          </span>
        </span>
        <span class="pill">{liveKind === 'nearby' ? 'Nearby' : 'Share'}</span>
      </button>
    {:else}
      <button class="btn ghost block" style="margin-top: 12px" onclick={startTogether}>
        👋 Play together
      </button>
    {/if}
  {/if}

  <Scoreboard players={orderedPlayers} {totals} lowerIsBetter={lower} winners={game.winnerIds ?? []} youId={$leadMember?.id} />

  {#if game.status === 'finished'}
    <div class="card center banner">🏆 {winnerNames || 'Nobody'} {(game.winnerIds?.length ?? 0) > 1 ? 'tie!' : 'wins!'}</div>
    <button class="btn block" style="margin-top: 12px" onclick={() => (shareOpen = true)}>
      📤 Share results
    </button>
    <a class="btn block" style="margin-top: 10px" href="/tonight" use:link>🎁 Tonight’s Recap</a>
    <div class="row" style="gap: 10px; margin-top: 10px">
      <button class="btn" onclick={doReopen} title="Reopen to add more rounds">Reopen</button>
      <button class="btn primary grow" onclick={playAgain}>Play again</button>
    </div>
  {:else if game.status === 'abandoned'}
    <div class="card center banner">🪦 Game abandoned — no winner recorded.</div>
    <a class="btn block" style="margin-top: 12px" href="/tonight" use:link>🎁 Tonight’s Recap</a>
    <div class="row" style="gap: 10px; margin-top: 10px">
      <button class="btn" onclick={doReopen} title="Reopen to keep playing">Reopen</button>
      <button class="btn primary grow" onclick={playAgain}>Play again</button>
    </div>
  {:else if editing}
    {@const EditorC = module.RoundEditor}
    {@const ectx = buildCtx(editing.index, totalsBefore(editing.index))}
    <div class="card stack" style="margin-top: 12px">
      <strong>Editing round {editing.index + 1}</strong>
      <EditorC bind:input={editDraft} ctx={ectx} />
      {#if editError}
        <p class="entry-error" role="alert">⚠️ {editError}</p>
      {/if}
      <div class="row" style="gap: 10px">
        <button class="btn grow" onclick={cancelEdit}>Cancel</button>
        <button class="btn primary grow" onclick={saveEdit} disabled={!!editError}>Save changes</button>
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
        {#if draftError}
          <p class="entry-error" role="alert">⚠️ {draftError}</p>
        {/if}
        <button class="btn primary block" onclick={saveRound} disabled={!!draftError}>Save round</button>
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
      {#if rounds.length}
        <button class="btn ghost block" style="margin-top: 12px" onclick={doFinish}>Finish game now</button>
      {/if}
    {/if}
    <button
      class="btn ghost block"
      style="margin-top: 8px; color: var(--muted)"
      onclick={doAbandon}
      title="Stop this game without recording a winner"
    >🪦 Abandon game</button>
  {/if}

  {#if rounds.length}
    <div class="row spread scorecard-head">
      <div class="section-title" style="margin: 0">Scorecard</div>
      <button
        type="button"
        class="btn small ghost"
        onclick={() => (showRunning = !showRunning)}
        aria-pressed={showRunning}
        title="Toggle between each round's points and the running total"
      >{showRunning ? '∑ Running totals' : '± Per round'}</button>
    </div>
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
                <td class="num">{showRunning ? (runningTotals[r.id]?.[p.id] ?? 0) : fmt(r.deltas[p.id])}</td>
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
              <td class="num" class:lead={leaderIds.has(p.id) || (game.winnerIds ?? []).includes(p.id)}>{totals[p.id] ?? 0}</td>
            {/each}
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  {/if}
{/if}

{#if sheetOpen && $liveActive}
  {#key liveKind}
    <PlaySheet
      mode={liveMode}
      code={$liveCode ?? ''}
      link={liveLink}
      remote={$liveRemote}
      controls={nearbyControls}
      canGoOnline={liveSupported}
      canGoNearby={nearbySupported}
      onclose={() => (sheetOpen = false)}
      onend={stopLive}
      onswitch={switchMode}
    />
  {/key}
{/if}

{#if shareOpen && sharePayload}
  <ShareResultsSheet payload={sharePayload} onclose={() => (shareOpen = false)} />
{/if}

<style>
  .livebar {
    margin-top: 12px;
    width: 100%;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
  }
  .livebar:hover {
    border-color: var(--primary);
  }
  .livedot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--good);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--good) 22%, transparent);
  }
  .livedot.reconnecting {
    background: var(--warn);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 22%, transparent);
    animation: livepulse 1.1s ease-in-out infinite;
  }
  .livedot.offline {
    background: var(--muted);
    box-shadow: none;
  }
  @keyframes livepulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .livedot.reconnecting {
      animation-duration: 3s;
    }
  }
  .scorecard-head {
    align-items: center;
    margin-top: 18px;
    margin-bottom: 8px;
  }
  /* Inline round-entry error: an assertive alert co-signalled with ⚠️ and words
     (never colour alone) so an invalid round is clear before Save is even tapped.
     Save is disabled while this shows, so the reason is always on screen. */
  .entry-error {
    margin: 0;
    padding: 9px 12px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--bad) 12%, var(--surface-2));
    border: 1px solid color-mix(in srgb, var(--bad) 45%, var(--border));
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 600;
  }
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
  @media (prefers-reduced-motion: reduce) {
    .matrix tbody tr.flash td {
      animation: none;
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
