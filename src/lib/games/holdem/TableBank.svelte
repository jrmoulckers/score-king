<script lang="ts">
  import type { ID, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { investedByPlayer, toMoney, type HoldemConfig } from './logic';

  let {
    ctx,
    cfg,
    projection = {},
  }: {
    ctx: RoundContext;
    cfg: HoldemConfig;
    /** Optional per-player preview delta for the event being composed. */
    projection?: Record<ID, number>;
  } = $props();

  const invested = $derived(investedByPlayer(ctx.rounds));

  /** Net now = the player's running total (net position in the tracking unit). */
  function netNow(id: ID): number {
    return (ctx.totals[id] ?? 0) + (projection[id] ?? 0);
  }

  function fmtMoney(amount: number): string {
    const v = Math.round(toMoney(amount, cfg) * 100) / 100;
    const body = Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
    return cfg.unit === 'chips' ? body : `$${body}`;
  }
  function fmtSigned(amount: number): string {
    const v = Math.round(toMoney(amount, cfg) * 100) / 100;
    const body = Number.isInteger(Math.abs(v)) ? Math.abs(v).toLocaleString() : Math.abs(v).toFixed(2);
    const money = cfg.unit === 'chips' ? body : `$${body}`;
    if (v > 0) return `+${money}`;
    if (v < 0) return `−${money}`;
    return money;
  }

  // The chip leader — biggest net right now. Gets the 👑 (Crown Gold), scarce by design.
  const leaderId = $derived.by(() => {
    let best: ID | null = null;
    let bestV = -Infinity;
    for (const p of ctx.players) {
      const v = netNow(p.id);
      if (v > bestV) {
        bestV = v;
        best = p.id;
      }
    }
    // Only crown a real, positive lead (no crown when everyone's even at 0).
    return bestV > 0 ? best : null;
  });

  const onTable = $derived(
    ctx.players.reduce((s, p) => s + (invested[p.id] ?? 0) + (ctx.totals[p.id] ?? 0), 0),
  );
</script>

<section class="bank" aria-label="Table bank">
  <header class="bank-head">
    <span class="section-title">On the table</span>
    <span class="on-table">{fmtMoney(onTable)}</span>
  </header>
  <ul class="rows">
    {#each ctx.players as p (p.id)}
      {@const net = netNow(p.id)}
      <li class="brow" class:leader={leaderId === p.id}>
        <Avatar name={p.name} color={p.color} size={26} />
        <span class="name">{p.name}{#if leaderId === p.id}<span class="crown" title="Chip leader"> 👑</span>{/if}</span>
        <span class="stat">
          <span class="lbl">in</span>
          <span class="val">{fmtMoney(invested[p.id] ?? 0)}</span>
        </span>
        <span
          class="net"
          class:up={net > 0}
          class:down={net < 0}
          title={net > 0 ? 'Up' : net < 0 ? 'Down' : 'Even'}
        >{fmtSigned(net)}</span>
      </li>
    {/each}
  </ul>
</section>

<style>
  .bank {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px;
  }
  .bank-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .on-table {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .brow {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 10px;
    padding: 5px 6px;
    border-radius: var(--radius-sm);
  }
  .brow.leader {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .crown {
    color: var(--accent-ink);
  }
  .stat {
    display: inline-flex;
    gap: 6px;
    align-items: baseline;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .stat .val {
    font-variant-numeric: tabular-nums;
    color: var(--text);
    font-weight: 600;
  }
  .net {
    min-width: 4.5em;
    text-align: right;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .net.up {
    color: var(--good);
  }
  .net.down {
    color: var(--bad);
  }
</style>
