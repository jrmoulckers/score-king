<script lang="ts">
  import type { ID, Player } from '../types';
  import { standings } from '../scoring';
  import Avatar from './Avatar.svelte';

  let {
    players,
    totals,
    lowerIsBetter = false,
    winners = [],
  }: {
    players: Player[];
    totals: Record<ID, number>;
    lowerIsBetter?: boolean;
    winners?: ID[];
  } = $props();

  const byId = $derived(new Map(players.map((p) => [p.id, p])));
  const ranked = $derived(standings(totals, lowerIsBetter));
</script>

<table>
  <thead>
    <tr><th>#</th><th>Player</th><th>Score</th></tr>
  </thead>
  <tbody>
    {#each ranked as s (s.playerId)}
      {@const p = byId.get(s.playerId)}
      <tr class:winner={winners.includes(s.playerId)}>
        <td>{s.rank}</td>
        <td>
          <span class="row" style="gap: 8px">
            {#if p}<Avatar name={p.name} color={p.color} size={24} />{p.name}{/if}
            {#if winners.includes(s.playerId)}<span title="Winner">🏆</span>{/if}
          </span>
        </td>
        <td class="num" class:lead={s.rank === 1}>{s.total}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .num {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  tr.winner td {
    background: color-mix(in srgb, var(--accent) 13%, transparent);
    border-bottom-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
</style>
