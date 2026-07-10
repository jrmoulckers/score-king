<script lang="ts">
  import type { ID, RoundContext } from '../../types';
  import { untrack } from 'svelte';
  import Avatar from '../../components/Avatar.svelte';
  import { ordinal } from '../../stats/format';
  import { animateMotion, popIn } from '../../motion';
  import { haptic } from '../../haptics';
  import KittenCountdown from './KittenCountdown.svelte';
  import KaboomBurst from './KaboomBurst.svelte';
  import type { EKInput } from './logic';

  let { input = $bindable(), ctx }: { input: EKInput; ctx: RoundContext } = $props();

  const trackOrder = $derived(ctx.config.trackOrder !== false);
  const trackDefuses = $derived(!!ctx.config.trackDefuses);
  const imploding = $derived(!!ctx.config.imploding);

  const outIndex = (id: ID): number => input.order.indexOf(id);
  const isOut = (id: ID): boolean => outIndex(id) >= 0;

  const alive = $derived(ctx.players.filter((p) => !input.order.includes(p.id)));
  // In elimination-order mode the survivor is whoever's left once everyone else has
  // exploded — crowned automatically so entry is a string of single taps.
  const survivorId = $derived(trackOrder ? (alive.length === 1 ? alive[0].id : null) : input.winner);

  // Live ribbing: the first to blow (💥) and — once a match is decided — the runner-up
  // who was one draw from surviving (😾). Personality that lands at the table, not just
  // buried in Stats later.
  const firstOutId = $derived(input.order[0] ?? null);
  const runnerUpId = $derived(
    survivorId && input.order.length ? input.order[input.order.length - 1] : null,
  );

  // Seats for the countdown costume: alive 🐱 / exploded 💥 / survivor 👑.
  const seats = $derived(
    ctx.players.map((p) => {
      const oi = outIndex(p.id);
      const state: 'alive' | 'out' | 'survivor' =
        survivorId === p.id ? 'survivor' : oi >= 0 ? 'out' : 'alive';
      return { id: p.id, name: p.name, color: p.color, state, outRank: oi >= 0 ? oi + 1 : 0 };
    }),
  );
  const aliveCount = $derived(seats.filter((s) => s.state === 'alive').length);
  const survivorName = $derived(
    survivorId ? (ctx.players.find((p) => p.id === survivorId)?.name ?? null) : null,
  );

  // Per-row explosion tokens (bump → the 💥 burst replays on that row) and a single
  // token for the last-kitten-standing win blast.
  let boomToken = $state<Record<ID, number>>({});
  let crownToken = $state(0);

  // Don't fire the win beat for a survivor that was already crowned when this editor
  // opened (e.g. editing a finished match) — only for a fresh crowning during entry.
  let prevSurvivor: ID | null = untrack(() => survivorId);
  $effect(() => {
    const s = survivorId;
    if (s && s !== prevSurvivor) {
      crownToken += 1;
      haptic('win');
    }
    prevSurvivor = s;
  });

  function syncWinner() {
    input.winner = alive.length === 1 ? alive[0].id : null;
  }

  function eliminate(id: ID) {
    if (!input.order.includes(id)) {
      input.order = [...input.order, id];
      boomToken[id] = (boomToken[id] ?? 0) + 1;
      haptic('save');
    }
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

  function defuseCount(id: ID): number {
    return input.defuses?.[id] ?? 0;
  }
  function defuse(id: ID) {
    const d = { ...(input.defuses ?? {}) };
    d[id] = (d[id] ?? 0) + 1;
    input.defuses = d;
    haptic('tick');
  }
  function undefuse(id: ID) {
    const d = { ...(input.defuses ?? {}) };
    const next = (d[id] ?? 0) - 1;
    if (next > 0) d[id] = next;
    else delete d[id];
    input.defuses = d;
  }

  // Svelte action: a quick shake when a row explodes (token bumps). Motion-only — the
  // 💥 chip, struck name and rank already carry "out" — so it auto-skips under reduced
  // motion via animateMotion.
  function shakeOn(node: HTMLElement, token: number) {
    let prev = token;
    return {
      update(next: number) {
        if (next !== prev && next > 0) {
          animateMotion(
            node,
            { x: [0, -5, 5, -3, 3, 0], rotate: [0, -1.5, 1.5, -1, 0.6, 0] },
            { duration: 0.4, ease: 'easeOut' },
          );
        }
        prev = next;
      },
    };
  }
</script>

<div class="stack">
  <KittenCountdown {seats} {aliveCount} {survivorName} {imploding} />

  {#if imploding}
    <div class="reminder menace">
      ☠️ <span><strong>Imploding Kitten in play.</strong> No defuse for this one — flip it and you’re gone.</span>
    </div>
  {/if}

  <span class="prompt muted">
    {#if survivorId}
      🎉 Match over — the last kitten reigns. Save it to bank the win.
    {:else if trackOrder}
      Tap each kitten the instant it goes 💥 — I’ll crown the survivor.
    {:else}
      Tap the last kitten standing 👑
    {/if}
  </span>

  <div class="stack list">
    {#each ctx.players as p (p.id)}
      {@const dc = defuseCount(p.id)}
      <div class="krow-wrap" use:shakeOn={boomToken[p.id] ?? 0}>
        {#if survivorId === p.id}
          <div class="krow survivor" aria-label="{p.name} is the last kitten standing">
            <span class="who">
              <Avatar name={p.name} color={p.color} />
              <strong>{p.name}</strong>
            </span>
            <span class="badge crown" use:popIn>👑 Survivor</span>
          </div>
          <KaboomBurst token={crownToken} crown />
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
              {#if firstOutId === p.id}
                <span class="rib first">first to blow 🙀</span>
              {:else if runnerUpId === p.id}
                <span class="rib close">so close 😾</span>
              {/if}
            </span>
            <span class="badge boom">💥 <span class="num">{ordinal(outIndex(p.id) + 1)}</span> out</span>
          </button>
          <KaboomBurst token={boomToken[p.id] ?? 0} />
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

        {#if trackDefuses}
          <div class="defuse" class:used={dc > 0}>
            {#if dc > 0}
              <button
                type="button"
                class="dbtn minus"
                onclick={() => undefuse(p.id)}
                aria-label="Undo a defuse for {p.name}"
              >−</button>
            {/if}
            <button
              type="button"
              class="dbtn add"
              onclick={() => defuse(p.id)}
              aria-label="{p.name} defused a kitten — {dc} so far"
              title="Cheated death — logged a Defuse"
            >🛡 <span class="num">{dc}</span></button>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if trackDefuses}
    <span class="hint muted">🛡 Tap when someone Defuses an Exploding Kitten — it feeds the “deaths cheated” stat.</span>
  {/if}
</div>

<style>
  .list {
    gap: 8px;
  }
  .prompt {
    font-size: 0.88rem;
  }
  .krow-wrap {
    position: relative;
    display: flex;
    align-items: stretch;
    gap: 8px;
    width: 100%;
    will-change: transform;
  }
  .krow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 56px;
    padding: 10px 12px;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
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

  /* Live ribbing — a small playful tag next to the name. Text + emoji carry it; kept
     muted so it's a wink, never a shout, and never colour alone. */
  .rib {
    flex: none;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--muted);
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    white-space: nowrap;
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

  /* Defuse control — a compact secondary stepper, never the primary action (that
     stays the shell's one violet Save). Surface-ramp only. */
  .defuse {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .dbtn {
    min-width: 44px;
    height: 44px;
    padding: 0 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    font: inherit;
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .dbtn:hover {
    background: var(--surface-3);
  }
  .dbtn:active {
    transform: translateY(1px);
  }
  .dbtn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .dbtn.minus {
    min-width: 40px;
    color: var(--muted);
  }
  .defuse.used .dbtn.add {
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
    color: var(--text);
  }

  .hint {
    font-size: 0.78rem;
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
  /* Imploding gets a touch of menace — a loss-coral edge, co-signalled by the ☠️ and
     the words, never colour alone. */
  .reminder.menace {
    border-color: color-mix(in srgb, var(--bad) 45%, var(--border));
    background: color-mix(in srgb, var(--bad) 8%, var(--surface));
  }
  .reminder.menace strong {
    color: var(--text);
  }
</style>
