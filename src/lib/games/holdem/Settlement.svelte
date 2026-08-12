<script lang="ts">
  import type { ID } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { haptic } from '../../haptics';
  import { settle, toMoney, type HoldemConfig, type Transfer } from './logic';

  const {
    net,
    players,
    cfg,
  }: {
    /** Net position per player in the tracking unit (+ = is owed). */
    net: Record<ID, number>;
    players: { id: ID; name: string; color: string }[];
    cfg: HoldemConfig;
  } = $props();

  const transfers = $derived<Transfer[]>(settle(net));
  const nameOf = (id: ID) => players.find((p) => p.id === id)?.name ?? '—';
  const playerOf = (id: ID) => players.find((p) => p.id === id);

  // Locally-tracked "handed over the cash" state — a table nicety, not persisted.
  const paid = $state<Record<string, boolean>>({});
  const key = (t: Transfer) => `${t.from}>${t.to}`;
  function togglePaid(t: Transfer) {
    const k = key(t);
    paid[k] = !paid[k];
    if (paid[k]) haptic('win');
  }

  function fmtMoney(amount: number): string {
    const v = Math.round(toMoney(amount, cfg) * 100) / 100;
    const body = Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
    return cfg.unit === 'chips' ? `${body} chips` : `$${body}`;
  }
</script>

<div class="settle">
  <div class="section-title">💸 Settle up</div>
  {#if transfers.length === 0}
    <p class="even muted">All square — nobody owes anybody. 🤝</p>
  {:else}
    <ul class="pays">
      {#each transfers as t (key(t))}
        {@const from = playerOf(t.from)}
        {@const to = playerOf(t.to)}
        <li>
          <button
            type="button"
            class="pay"
            class:done={paid[key(t)]}
            aria-pressed={paid[key(t)]}
            onclick={() => togglePaid(t)}
          >
            <span class="who">
              {#if from}<Avatar name={from.name} color={from.color} size={24} />{/if}
              <span class="nm">{nameOf(t.from)}</span>
            </span>
            <span class="arrow" aria-label="pays">→</span>
            <span class="who">
              {#if to}<Avatar name={to.name} color={to.color} size={24} />{/if}
              <span class="nm">{nameOf(t.to)}</span>
            </span>
            <span class="amt">{fmtMoney(t.amount)}</span>
            <span class="check" aria-hidden="true">{paid[key(t)] ? '✓' : ''}</span>
          </button>
        </li>
      {/each}
    </ul>
    <p class="hint muted">Tap a line once the cash changes hands.</p>
  {/if}
</div>

<style>
  .settle {
    margin-top: 4px;
  }
  .even {
    margin: 6px 2px;
  }
  .pays {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pay {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto 1fr auto auto;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 6px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font: inherit;
    cursor: pointer;
    text-align: left;
    transition:
      background var(--dur-base) var(--ease-standard),
      opacity var(--dur-base) var(--ease-standard);
  }
  .pay:active {
    transform: translateY(1px);
  }
  .pay:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .pay.done {
    opacity: 0.55;
  }
  .pay.done .nm,
  .pay.done .amt {
    text-decoration: line-through;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .nm {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .arrow {
    color: var(--muted);
    font-weight: 700;
  }
  .amt {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .check {
    width: 1.2em;
    color: var(--good);
    font-weight: 800;
  }
  .hint {
    margin: 8px 2px 0;
    font-size: 0.85rem;
  }
</style>
