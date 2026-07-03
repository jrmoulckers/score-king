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
  import { liveReplica, sendIntent } from '../live/session';
  import Scoreboard from './Scoreboard.svelte';
  import Avatar from './Avatar.svelte';

  let draft = $state<any>(null);
  let lastRoundCount = $state(-1);

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
  <Scoreboard
    players={replica.players}
    {totals}
    lowerIsBetter={lower}
    winners={replica.game.winnerIds ?? []}
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
  .banner {
    margin-top: 12px;
    font-weight: 700;
  }
</style>
