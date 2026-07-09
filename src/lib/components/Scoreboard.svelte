<script lang="ts">
  import type { ID, Player } from '../types';
  import { standings, leaders } from '../scoring';
  import { bumpOnChange, popIn } from '../motion';
  import Avatar from './Avatar.svelte';

  let {
    players,
    totals,
    lowerIsBetter = false,
    winners = [],
    youId,
  }: {
    players: Player[];
    totals: Record<ID, number>;
    lowerIsBetter?: boolean;
    winners?: ID[];
    youId?: ID;
  } = $props();

  const byId = $derived(new Map(players.map((p) => [p.id, p])));
  const ranked = $derived(standings(totals, lowerIsBetter));
  // A leader only exists once scores diverge — at an all-tie (including 0-0)
  // nobody is "leading yet", so the crown and the gold `.lead` number stay
  // hidden. `leaders()` is the shared source of truth for that scarcity.
  const leaderSet = $derived(leaders(totals, players.map((p) => p.id), lowerIsBetter));
  const winnerSet = $derived(new Set(winners));
  // Gold (`.lead`) marks the reigning leader now, or the winner once the game is
  // over — never a row that's merely tied-at-zero with everyone else.
  const isGold = (id: ID) => leaderSet.has(id) || winnerSet.has(id);
  // How far a trailing player sits behind the best score, as a positive number,
  // so "5 back" reads the same whether high or low totals win.
  const best = $derived(
    ranked.length ? ranked[0].total : 0,
  );
  const singleLeader = $derived(leaderSet.size === 1);
  function gap(total: number): number {
    return Math.abs(total - best);
  }
</script>

<table>
  <caption class="sr-only">Standings by rank</caption>
  <thead>
    <tr>
      <th scope="col"><span class="sr-only">Rank</span><span aria-hidden="true">#</span></th>
      <th scope="col">Player</th>
      <th scope="col">Score</th>
    </tr>
  </thead>
  <tbody>
    {#each ranked as s (s.playerId)}
      {@const p = byId.get(s.playerId)}
      {@const behind = gap(s.total)}
      <tr class:winner={winnerSet.has(s.playerId)}>
        <td>{s.rank}</td>
        <td>
          <span class="row" style="gap: 8px">
            {#if p}<Avatar name={p.name} color={p.color} size={24} decorative />{p.name}{/if}
            {#if youId && s.playerId === youId}<span class="you">You</span>{/if}
            {#if winnerSet.has(s.playerId)}
              <span aria-hidden="true" title="Winner" use:popIn>🏆</span><span class="sr-only">Winner</span>
            {:else if leaderSet.has(s.playerId)}
              <span aria-hidden="true" title="Leading" use:popIn>👑</span><span class="sr-only">Leading</span>
            {/if}
          </span>
        </td>
        <td class="num" class:lead={isGold(s.playerId)}>
          <span class="total" use:bumpOnChange={s.total}>{s.total}</span>
          {#if leaderSet.size && !leaderSet.has(s.playerId) && !winnerSet.has(s.playerId)}
            <span class="gap">{behind} back</span>
          {:else if singleLeader && leaderSet.has(s.playerId) && winnerSet.size === 0 && ranked.length > 1}
            <span class="gap">leads by {gap(ranked[1].total)}</span>
          {/if}
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .num {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    text-align: right;
    white-space: nowrap;
  }
  .num .total {
    display: block;
  }
  /* The distance to the leader, co-signalled by the word "back"/"leads" so it
     never depends on position or colour alone. Quiet by default — the score is
     the headline; the gap is the footnote. */
  .gap {
    display: block;
    font-size: 0.72rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    margin-top: 1px;
  }
  .you {
    flex: none;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--muted);
  }
  tr.winner td {
    background: color-mix(in srgb, var(--accent) 13%, transparent);
    border-bottom-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
</style>
