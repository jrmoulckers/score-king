<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { RoundContext } from '../lib/types';
  import { resolveLower } from '../lib/types';
  import { getModule } from '../lib/games/registry';
  import { computeTotals } from '../lib/scoring';
  import { navigate, link } from '../lib/router';
  import { showToast } from '../lib/stores/toast';
  import { normalizeJoinCode } from '../lib/util';
  import {
    joinSession,
    leaveSession,
    sendIntent,
    currentSelf,
    isLiveSupported,
    liveStatus,
    liveReplica,
    liveParticipants,
    liveError,
  } from '../lib/live/session';
  import Scoreboard from '../lib/components/Scoreboard.svelte';
  import Avatar from '../lib/components/Avatar.svelte';

  let { code }: { code: string } = $props();
  const joinCode = $derived(normalizeJoinCode(code));
  const supported = isLiveSupported();

  let draft = $state<any>(null);
  let lastRoundCount = $state(-1);
  let everConnected = $state(false);

  const replica = $derived($liveReplica);
  const gmodule = $derived(replica ? getModule(replica.game.type) : undefined);
  const totals = $derived(replica ? computeTotals(replica.rounds, replica.game.playerIds) : {});
  const lower = $derived(replica && gmodule ? resolveLower(gmodule, replica.game.config) : false);
  const maxR = $derived(
    replica && gmodule?.maxRounds
      ? gmodule.maxRounds(replica.game.config, replica.game.playerIds.length)
      : null,
  );
  const canAdd = $derived(
    !!replica &&
      replica.game.status === 'active' &&
      (maxR == null || replica.rounds.length < maxR),
  );
  const winnerNames = $derived(
    !replica
      ? ''
      : (replica.game.winnerIds ?? [])
          .map((wid) => replica.players.find((p) => p.id === wid)?.name ?? '?')
          .join(' & '),
  );

  function buildCtx(): RoundContext {
    return {
      game: replica!.game,
      players: replica!.players,
      config: replica!.game.config,
      roundIndex: replica!.rounds.length,
      totals,
      rounds: replica!.rounds,
    };
  }

  // Rebuild the draft whenever a new round lands (mine or anyone's) or the game opens up.
  $effect(() => {
    if (replica && gmodule && canAdd) {
      if (replica.rounds.length !== lastRoundCount) {
        draft = gmodule.createRoundInput(buildCtx());
        lastRoundCount = replica.rounds.length;
      }
    } else {
      draft = null;
      lastRoundCount = -1;
    }
  });

  $effect(() => {
    if ($liveStatus === 'guest') everConnected = true;
  });

  function sendRound() {
    if (!replica || !gmodule || !draft) return;
    const ctx = buildCtx();
    const snap = $state.snapshot(draft);
    const err = gmodule.validateRound(snap, ctx);
    if (err) {
      showToast(err);
      return;
    }
    sendIntent({ kind: 'record-round', input: snap });
  }

  function fmt(d: number | undefined): string {
    if (d === undefined || d === null) return '·';
    return d > 0 ? `+${d}` : `${d}`;
  }

  async function leave() {
    await leaveSession();
    navigate('/');
  }

  onMount(() => {
    if (!supported) return;
    void joinSession(joinCode, currentSelf('guest'));
  });
  onDestroy(() => {
    void leaveSession();
  });
</script>

{#if !supported}
  <div class="empty">
    <h2>Live play isn’t available here</h2>
    <p class="muted">This browser can’t run live games. You can still keep score on your own.</p>
    <a class="btn primary" href="/" use:link>Back to games</a>
  </div>
{:else if $liveStatus === 'guest' && replica && gmodule}
  <div class="row spread" style="margin: 10px 4px 6px">
    <span class="row" style="gap: 10px">
      <span style="font-size: 1.7rem">{gmodule.emoji}</span>
      <span>
        <div><strong>{gmodule.name}</strong></div>
        <div class="muted" style="font-size: 0.8rem">Live game · code {joinCode}</div>
      </span>
    </span>
    <span class="live"><span class="dot" aria-hidden="true"></span>{$liveParticipants.length}</span>
  </div>

  <Scoreboard players={replica.players} {totals} lowerIsBetter={lower} winners={replica.game.winnerIds ?? []} />

  {#if replica.game.status === 'finished'}
    <div class="card center banner">
      🏆 {winnerNames || 'Nobody'} {(replica.game.winnerIds?.length ?? 0) > 1 ? 'tie!' : 'wins!'}
    </div>
  {:else if canAdd && draft}
    {@const RoundEditor = gmodule.RoundEditor}
    <div class="card stack" style="margin-top: 12px">
      <strong>Round {replica.rounds.length + 1}{maxR ? ` of ${maxR}` : ''}</strong>
      <RoundEditor bind:input={draft} ctx={buildCtx()} />
      <button class="btn primary block" onclick={sendRound}>Send round to host</button>
      <span class="muted" style="font-size: 0.8rem; text-align: center">
        The host records it and everyone’s board updates.
      </span>
    </div>
  {:else}
    <div class="card center" style="margin-top: 12px">Waiting for the host…</div>
  {/if}

  {#if replica.rounds.length}
    <div class="section-title">Scorecard</div>
    <div class="scroll">
      <table class="matrix">
        <thead>
          <tr>
            <th scope="col">Rd</th>
            {#each replica.players as p (p.id)}
              <th scope="col"><Avatar name={p.name} color={p.color} size={22} /></th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each replica.rounds as r (r.id)}
            <tr>
              <td>{r.index + 1}</td>
              {#each replica.players as p (p.id)}
                <td class="num">{fmt(r.deltas[p.id])}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            {#each replica.players as p (p.id)}
              <td class="num">{totals[p.id] ?? 0}</td>
            {/each}
          </tr>
        </tfoot>
      </table>
    </div>
  {/if}

  <button class="btn ghost block" style="margin-top: 14px" onclick={leave}>Leave game</button>
{:else if $liveStatus === 'error'}
  <div class="empty">
    <h2>Couldn’t join</h2>
    <p class="muted">{$liveError ?? 'That live game isn’t reachable.'}</p>
    <a class="btn primary" href="/" use:link>Back to games</a>
  </div>
{:else if everConnected}
  <div class="empty">
    <h2>The live game ended</h2>
    <p class="muted">The host closed the session.</p>
    <a class="btn primary" href="/" use:link>Back to games</a>
  </div>
{:else}
  <div class="empty">
    <div class="spinner" aria-hidden="true"></div>
    <h2>Joining game {joinCode}…</h2>
    <p class="muted">Connecting you to the host.</p>
  </div>
{/if}

<style>
  .live {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.85rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--good);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--good) 22%, transparent);
  }
  .banner {
    margin-top: 12px;
    font-weight: 700;
  }
  .spinner {
    width: 30px;
    height: 30px;
    margin: 0 auto 10px;
    border-radius: 999px;
    border: 3px solid var(--surface-3);
    border-top-color: var(--primary);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 2.4s;
    }
  }
</style>
