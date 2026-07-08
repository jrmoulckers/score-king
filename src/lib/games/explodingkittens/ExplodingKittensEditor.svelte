<script lang="ts">
  import type { ID, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { ordinal } from '../../stats/format';
  import type { EKInput } from './logic';

  let { input = $bindable(), ctx }: { input: EKInput; ctx: RoundContext } = $props();

  const trackOrder = $derived(ctx.config.trackOrder !== false);
  const imploding = $derived(!!ctx.config.imploding);

  const outIndex = (id: ID): number => input.order.indexOf(id);
  const isOut = (id: ID): boolean => outIndex(id) >= 0;

  const alive = $derived(ctx.players.filter((p) => !input.order.includes(p.id)));
  // In elimination-order mode the survivor is whoever's left once everyone else has
  // exploded — crowned automatically so entry is a string of single taps.
  const survivorId = $derived(trackOrder ? (alive.length === 1 ? alive[0].id : null) : input.winner);

  function syncWinner() {
    input.winner = alive.length === 1 ? alive[0].id : null;
  }

  function eliminate(id: ID) {
    if (!input.order.includes(id)) input.order = [...input.order, id];
    syncWinner();
  }
  function revive(id: ID) {
    input.order = input.order.filter((x) => x !== id);
    syncWinner();
  }
  // trackOrder off: one tap picks the lone survivor (tap again to clear).
  function crown(id: ID) {
    input.winner = input.winner === id ? null : id;
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="muted">
      {#if trackOrder}
        Tap each kitten as they 💥 explode — the survivor is crowned.
      {:else}
        Tap the last kitten standing 👑
      {/if}
    </span>
    {#if survivorId}
      <span class="pill survived">👑 {ctx.players.find((p) => p.id === survivorId)?.name} survives</span>
    {:else if trackOrder}
      <span class="pill"><span class="num">{alive.length}</span> still in play</span>
    {:else}
      <span class="pill">no survivor yet</span>
    {/if}
  </div>

  {#if imploding}
    <div class="reminder">☠️ <span>Imploding Kitten in play — it can’t be defused.</span></div>
  {/if}

  <div class="stack list">
    {#each ctx.players as p (p.id)}
      {#if survivorId === p.id}
        <div class="krow survivor" aria-label="{p.name} is the last kitten standing">
          <span class="who">
            <Avatar name={p.name} color={p.color} />
            <strong>{p.name}</strong>
          </span>
          <span class="badge crown">👑 Survivor</span>
        </div>
      {:else if trackOrder && isOut(p.id)}
        <button
          type="button"
          class="krow out"
          onclick={() => revive(p.id)}
          aria-label="Bring {p.name} back in — they were the {ordinal(outIndex(p.id) + 1)} out"
        >
          <span class="who">
            <Avatar name={p.name} color={p.color} />
            <span class="name">{p.name}</span>
          </span>
          <span class="badge boom">💥 <span class="num">{ordinal(outIndex(p.id) + 1)}</span> out</span>
        </button>
      {:else if trackOrder}
        <button
          type="button"
          class="krow"
          onclick={() => eliminate(p.id)}
          aria-label="{p.name} exploded"
        >
          <span class="who">
            <Avatar name={p.name} color={p.color} />
            <strong>{p.name}</strong>
          </span>
          <span class="badge action">💥 Out</span>
        </button>
      {:else}
        <button
          type="button"
          class="krow pick"
          class:on={input.winner === p.id}
          onclick={() => crown(p.id)}
          aria-pressed={input.winner === p.id}
        >
          <span class="who">
            <Avatar name={p.name} color={p.color} />
            <strong>{p.name}</strong>
          </span>
          <span class="badge">{input.winner === p.id ? '👑 Survivor' : 'Tap to crown'}</span>
        </button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .list {
    gap: 8px;
  }
  .krow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-height: 56px;
    padding: 10px 12px;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--text);
    font: inherit;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  button.krow:hover {
    background: var(--surface-3);
  }
  button.krow:active {
    transform: translateY(1px);
  }
  button.krow:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .who strong,
  .who .name {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .badge {
    flex: none;
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .badge.action {
    color: var(--text);
  }
  .num {
    font-variant-numeric: tabular-nums;
  }

  /* Eliminated: dimmed and struck, carried by the 💥 chip + rank number, never
     colour alone. Not coral — being out isn't an error, just out. */
  .krow.out {
    background: var(--surface);
    opacity: 0.72;
  }
  .krow.out .name {
    text-decoration: line-through;
    color: var(--muted);
  }
  .badge.boom {
    color: var(--muted);
  }

  /* Survivor: the restrained Crown Gold wash + underline the scoreboard uses for a
     winner — the 👑 and the gold carry it, so gold stays a hint, never a block. */
  .krow.survivor {
    background: color-mix(in srgb, var(--accent) 13%, var(--surface-2));
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .badge.crown {
    color: var(--accent-ink);
  }
  .krow.pick.on {
    background: color-mix(in srgb, var(--accent) 13%, var(--surface-2));
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .krow.pick.on .badge {
    color: var(--accent-ink);
  }

  .pill.survived {
    color: var(--accent-ink);
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }

  .reminder {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
