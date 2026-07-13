<script lang="ts">
  import { untrack } from 'svelte';
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { bumpOnChange } from '../../motion';
  import { haptic } from '../../haptics';
  import UnoBurst from './UnoBurst.svelte';
  import { handValue, opponentsTotal, readConfig, type UnoInput } from './logic';

  let { input = $bindable(), ctx }: { input: UnoInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));
  const golf = $derived(cfg.mode === 'golf');
  const playerIds = $derived(ctx.players.map((p) => p.id));
  const pot = $derived(opponentsTotal(input, playerIds));

  // Race-to-target header. Totals here are cumulative BEFORE this round. The game ENDS
  // when any total reaches the target (both modes), so the meter tracks the highest total;
  // the crown tracks who's actually winning (max in standard, min in golf).
  const totalsBefore = $derived(ctx.totals ?? {});
  const maxTotal = $derived(
    playerIds.reduce((m, id) => Math.max(m, Number(totalsBefore[id]) || 0), 0),
  );
  const pct = $derived(
    cfg.target > 0 ? Math.min(100, Math.round((maxTotal / cfg.target) * 100)) : 0,
  );
  const leaderId = $derived.by(() => {
    const vals = playerIds.map((id) => Number(totalsBefore[id]) || 0);
    if (!vals.length || vals.every((v) => v === 0)) return null;
    const best = golf ? Math.min(...vals) : Math.max(...vals);
    const i = vals.findIndex((v) => v === best);
    return i >= 0 ? playerIds[i] : null;
  });
  const leaderName = $derived(
    leaderId ? (ctx.players.find((p) => p.id === leaderId)?.name ?? '?') : null,
  );
  const leaderTotal = $derived(leaderId ? Number(totalsBefore[leaderId]) || 0 : 0);

  // Older rounds (and freshly loaded edits) may not carry the per-kind `hands` breakdown.
  // Seed one for every seat so the tally UI always has something to bind to; an old lump
  // sum lands in `numbers` so its total is preserved and stays editable.
  $effect(() => {
    const ids = playerIds;
    untrack(() => {
      if (!input.hands) input.hands = {};
      for (const id of ids) {
        if (!input.hands[id]) {
          input.hands[id] = { numbers: Math.max(0, Number(input.left?.[id]) || 0), actions: 0, wilds: 0 };
        }
      }
    });
  });

  // Keep the authoritative `left` total in lockstep with the per-kind tally, so scoring,
  // stats and history all read a plain number and never need to know about `hands`.
  $effect(() => {
    const c = cfg;
    const out = input.out;
    for (const id of playerIds) {
      input.left[id] = out === id ? 0 : handValue(input.hands?.[id], c);
    }
  });

  // Bump a token so the Uno! burst replays on the row that just went out.
  let outToken = $state(0);

  function handValueOf(id: string): number {
    return input.out === id ? 0 : handValue(input.hands?.[id], cfg);
  }

  function goOut(id: string) {
    if (input.out === id) {
      input.out = null;
    } else {
      input.out = id;
      if (input.hands?.[id]) input.hands[id] = { numbers: 0, actions: 0, wilds: 0 };
      outToken += 1;
      haptic('win');
    }
  }
</script>

<div class="stack">
  <!-- Costume: a little four-colour card fan. Decorative only (aria-hidden); the copy and
       emoji carry every actual signal, so colour is never doing the talking. -->
  <div class="uno-head">
    <span class="fan" aria-hidden="true">
      <span class="mini c-red"></span>
      <span class="mini c-yellow"></span>
      <span class="mini c-green"></span>
      <span class="mini c-blue"></span>
    </span>
    <div class="mode">
      <strong class="modeline">{golf ? '⛳ Everyone banks their own' : '🎉 Winner scoops the table'}</strong>
      <span class="sub">{golf ? 'Lowest total wins' : 'Highest total wins'}</span>
    </div>
  </div>

  {#if cfg.target > 0}
    <div class="race" role="group" aria-label="Race to {cfg.target} points">
      <div class="row spread racetop">
        <span class="racelead">
          {#if leaderName}
            👑 <strong class="ellipsis">{leaderName}</strong>
            <span class="tnum lead" use:bumpOnChange={leaderTotal}>{leaderTotal}</span>
          {:else}
            <span class="sub">Nobody's pulled ahead yet</span>
          {/if}
        </span>
        <span class="sub">ends at <span class="tnum">{cfg.target}</span></span>
      </div>
      <div class="track"><div class="fill" style="width: {pct}%"></div></div>
    </div>
  {/if}

  <div class="row spread">
    <span class="muted prompt">
      {input.out ? 'Now tally the cards left in every other hand.' : 'Who shouted “Uno!” and emptied their hand?'}
    </span>
    {#if !golf && input.out}
      <span class="pill take"><span class="tnum" use:bumpOnChange={pot}>🎉 +{pot}</span></span>
    {/if}
  </div>

  {#each ctx.players as p (p.id)}
    {@const isOut = input.out === p.id}
    <div class="prow" class:out={isOut}>
      <UnoBurst token={isOut ? outToken : 0} scoop={!golf} />

      <div class="row spread head">
        <span class="row who">
          <Avatar name={p.name} color={p.color} />
          <strong class="ellipsis">{p.name}</strong>
        </span>
        {#if isOut}
          <span class="badge sweep">🎉 Went out</span>
        {:else}
          <span class="subtotal tnum" aria-label="{p.name} is holding {handValueOf(p.id)} points">
            {handValueOf(p.id)}<span class="sub">pts</span>
          </span>
        {/if}
      </div>

      <div class="row outrow">
        <button
          type="button"
          class="wentout"
          class:on={isOut}
          aria-pressed={isOut}
          onclick={() => goOut(p.id)}
        >
          {isOut ? '🎉 Went out' : 'Went out?'}
        </button>
      </div>

      {#if isOut}
        <p class="note">
          {golf ? 'Empty hand — banks 0 this round.' : `Scoops the table · +${pot} point${pot === 1 ? '' : 's'}`}
        </p>
      {:else}
        <div class="tally">
          <label class="f">
            <span class="klabel">🔢 Numbers <span class="hint">face value</span></span>
            <input
              type="number"
              min="0"
              inputmode="numeric"
              aria-label="{p.name} number-card face value"
              bind:value={input.hands![p.id].numbers}
            />
          </label>
          <label class="f">
            <span class="klabel">⛔ Actions <span class="hint">×{cfg.actionValue}</span></span>
            <Stepper bind:value={input.hands![p.id].actions} min={0} label="{p.name} action cards" />
          </label>
          <label class="f">
            <span class="klabel">🌈 Wilds <span class="hint">×{cfg.wildValue}</span></span>
            <Stepper bind:value={input.hands![p.id].wilds} min={0} label="{p.name} wild cards" />
          </label>
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .uno-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  /* A tiny fanned deck — pure costume, sits behind the mode copy. */
  .fan {
    flex: none;
    display: inline-flex;
    width: 40px;
    height: 34px;
    position: relative;
  }
  .mini {
    position: absolute;
    top: 4px;
    left: 8px;
    width: 16px;
    height: 24px;
    border-radius: 4px;
    border: 1.5px solid var(--surface);
    transform-origin: bottom center;
  }
  .c-red { background: #d63d3d; transform: rotate(-18deg); }
  .c-yellow { background: #f0b429; transform: rotate(-6deg); left: 12px; }
  .c-green { background: #2fa84f; transform: rotate(6deg); left: 12px; }
  .c-blue { background: #3b78c4; transform: rotate(18deg); }
  .modeline {
    display: block;
    font-size: 1rem;
  }
  .mode .sub {
    font-size: 0.82rem;
  }

  .race {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px;
  }
  .racetop {
    align-items: baseline;
  }
  .racelead {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    font-weight: 700;
  }
  .lead {
    color: var(--accent-ink);
  }
  .track {
    height: 6px;
    border-radius: 999px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 999px;
    background: var(--muted);
  }

  .prompt {
    font-size: 0.9rem;
  }

  .prow {
    position: relative;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  /* The player who went out is the round's winner — the restrained Crown-Gold wash the
     scoreboard uses, co-signalled by the 🎉 badge, never colour alone. */
  .prow.out {
    background: color-mix(in srgb, var(--accent) 13%, var(--surface-2));
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .head {
    align-items: center;
  }
  .who {
    gap: 8px;
    min-width: 0;
  }
  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .subtotal {
    flex: none;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .subtotal .sub {
    margin-left: 3px;
    font-weight: 500;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .badge.sweep {
    flex: none;
    font-weight: 700;
    color: var(--accent-ink);
  }

  .wentout {
    flex: 1;
    min-height: 46px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--muted);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .wentout:hover {
    color: var(--text);
    background: var(--surface-3);
  }
  /* Selected = gold-ink + gold border tint (marks the round winner), NOT a violet fill —
     the one violet action on the screen stays the shell's Save. */
  .wentout.on {
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    color: var(--accent-ink);
  }
  .wentout:active {
    transform: translateY(1px);
  }
  .wentout:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .note {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .tally {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .klabel {
    font-size: 0.78rem;
    color: var(--muted);
    font-weight: 600;
    white-space: nowrap;
  }
  .klabel .hint {
    font-weight: 500;
    opacity: 0.85;
  }
  .f input {
    width: 92px;
    min-height: 46px;
    padding: 11px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .f input:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .take {
    color: var(--good);
    border-color: color-mix(in srgb, var(--good) 40%, var(--border));
    font-weight: 700;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .prow,
    .wentout,
    .fill {
      transition: none;
    }
  }
</style>
