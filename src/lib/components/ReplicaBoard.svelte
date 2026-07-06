<script lang="ts">
  /**
   * The shared guest board: live scoreboard, round entry, and scorecard. Reads the live replica
   * and sends intents to the host, so it works identically whether the guest joined over the relay
   * (LiveJoin) or a nearby P2P link (NearbyJoin). The host-authoritative model means this view only
   * ever proposes rounds — the host records them and rebroadcasts the resulting state.
   */
  import type { RoundContext } from '../types';
  import { resolveLower } from '../types';
  import { getModule } from '../games/registry';
  import { computeTotals } from '../scoring';
  import { showToast } from '../stores/toast';
  import { liveReplica, sendIntent, liveSelf, liveParticipants, claimSeat, liveConnection } from '../live/session';
  import Scoreboard from './Scoreboard.svelte';
  import Avatar from './Avatar.svelte';

  let draft = $state<any>(null);
  let lastRoundCount = $state(-1);
  let choosing = $state(true);

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

  const me = $derived($liveSelf);
  const conn = $derived($liveConnection);
  // Seats already claimed by *other* devices — disabled in the picker so two phones can't
  // both be Alice. My own claim is excluded, so re-opening the picker keeps my seat pickable.
  const takenByOthers = $derived(
    new Set($liveParticipants.filter((p) => p.playerId && p.id !== me?.id).map((p) => p.playerId)),
  );

  function pickSeat(p: { id: string; name: string; color: string }): void {
    claimSeat({ id: p.id, name: p.name, color: p.color });
    choosing = false;
  }
  function watchOnly(): void {
    claimSeat(null);
    choosing = false;
  }

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
</script>

{#if replica && gmodule}
  {#if conn !== 'online'}
    <div class="connbar" class:off={conn === 'offline'} role="status">
      <span class="cdot" aria-hidden="true"></span>
      <span>{conn === 'reconnecting' ? 'Reconnecting…' : 'Offline — trying to reconnect. The host still has the game.'}</span>
    </div>
  {/if}
  {#if choosing}
    <div class="card stack claim">
      <strong>Which one are you?</strong>
      <span class="muted hint">Claim your seat so everyone sees who's who — or just watch.</span>
      <div class="seats">
        {#each replica.players as p (p.id)}
          {@const taken = takenByOthers.has(p.id)}
          <button
            class="seat"
            class:mine={me?.playerId === p.id}
            disabled={taken}
            onclick={() => pickSeat(p)}
          >
            <Avatar name={p.name} color={p.color} size={26} />
            <span class="seatname">{p.name}</span>
            {#if taken}<span class="tag">taken</span>{/if}
          </button>
        {/each}
      </div>
      <button class="btn ghost block" onclick={watchOnly}>Just watching</button>
    </div>
  {:else}
    <button class="whoami" onclick={() => (choosing = true)}>
      {#if me && me.playerId}
        <span class="row" style="gap: 8px">
          <Avatar name={me.name} color={me.color} size={22} />
          <span>You're <strong>{me.name}</strong></span>
        </span>
      {:else}
        <span class="muted">👀 You're watching</span>
      {/if}
      <span class="change">Change</span>
    </button>
  {/if}

  <Scoreboard
    players={replica.players}
    {totals}
    lowerIsBetter={lower}
    winners={replica.game.winnerIds ?? []}
    youId={me?.playerId}
  />

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
{/if}

<style>
  .connbar {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 12px;
    padding: 9px 12px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--warn) 14%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
    font-size: 0.85rem;
    line-height: 1.35;
  }
  .connbar.off {
    background: var(--surface-2);
    border-color: var(--border);
    color: var(--muted);
  }
  .cdot {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--warn);
    animation: pulse 1.1s ease-in-out infinite;
  }
  .connbar.off .cdot {
    background: var(--muted);
    animation: none;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .cdot {
      animation-duration: 3s;
    }
  }
  .banner {
    margin-top: 12px;
    font-weight: 700;
  }
  .claim {
    gap: 10px;
  }
  .hint {
    font-size: 0.82rem;
    line-height: 1.4;
  }
  .seats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .seat {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 6px 7px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 0.92rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 40px;
  }
  .seat:hover:not(:disabled) {
    border-color: var(--primary);
  }
  .seat:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .seat.mine {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, var(--surface-2));
  }
  .tag {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .whoami {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 9px 12px;
    margin-bottom: 12px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 0.9rem;
    cursor: pointer;
  }
  .whoami:hover {
    border-color: var(--primary);
  }
  .change {
    flex: none;
    font-size: 0.8rem;
    color: var(--muted);
  }
</style>
