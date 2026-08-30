<script lang="ts">
  import { untrack } from 'svelte';
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { bumpOnChange } from '../../motion';
  import { haptic } from '../../haptics';
  import {
    PHASE_COUNT,
    emptyHand,
    handValue,
    hasWon,
    phaseLabel,
    phasesBefore,
    type Phase10Input,
  } from './logic';

  let { input = $bindable(), ctx }: { input: Phase10Input; ctx: RoundContext } = $props();

  const playerIds = $derived(ctx.players.map((p) => p.id));

  // Each player's phase going INTO this hand — replayed from every earlier hand's
  // `completed` flags (see logic.ts's phasesAfter). Mirrors Spades' bag-count replay:
  // the running state a game needs beyond the plain point sum the shell tracks.
  const phasesEntering = $derived(phasesBefore(ctx.rounds, ctx.roundIndex, playerIds));

  // Older rounds (and freshly loaded edits) may not carry the per-kind `hands`
  // breakdown. Seed one for every seat so the tally UI always has something to
  // bind to; an old lump sum lands in `low` so its total is preserved and stays editable.
  $effect(() => {
    const ids = playerIds;
    untrack(() => {
      if (!input.hands) input.hands = {};
      for (const id of ids) {
        if (!input.hands[id]) {
          input.hands[id] = { ...emptyHand(), low: Math.max(0, Number(input.penalty?.[id]) || 0) };
        }
      }
    });
  });

  // Keep the authoritative `penalty` total in lockstep with the per-kind tally, so
  // scoring, stats and history all read a plain number and never need to know
  // about `hands`. Whoever completed their phase this hand played out clean: 0.
  $effect(() => {
    for (const id of playerIds) {
      input.penalty[id] = input.completed[id] ? 0 : handValue(input.hands?.[id]);
    }
  });

  function toggleCompleted(id: string) {
    input.completed[id] = !input.completed[id];
    if (input.completed[id]) {
      if (input.hands?.[id]) input.hands[id] = emptyHand();
      haptic('win');
    }
  }

  function handValueOf(id: string): number {
    return input.completed[id] ? 0 : handValue(input.hands?.[id]);
  }
</script>

<div class="stack">
  <p class="muted prompt">
    Mark who completed their phase this hand, then tally the cards left in every other hand.
  </p>

  {#each ctx.players as p (p.id)}
    {@const phaseBefore = phasesEntering[p.id] ?? 1}
    {@const wonAlready = hasWon(phaseBefore)}
    {@const done = !!input.completed[p.id]}
    <div class="prow" class:done>
      <div class="row spread head">
        <span class="row who">
          <Avatar name={p.name} color={p.color} />
          <strong class="ellipsis">{p.name}</strong>
        </span>
        <span class="badge" class:crown={wonAlready}>
          {wonAlready ? '🏆 Won' : phaseLabel(phaseBefore)}
        </span>
      </div>

      {#if wonAlready}
        <p class="note">Already cleared Phase 10 — nothing more to track.</p>
      {:else}
        <div class="row outrow">
          <button
            type="button"
            class="wentout"
            class:on={done}
            aria-pressed={done}
            onclick={() => toggleCompleted(p.id)}
          >
            {done
              ? phaseBefore >= PHASE_COUNT
                ? '🏆 Completed · clears Phase 10!'
                : `✅ Completed · advances to Phase ${phaseBefore + 1}`
              : 'Completed phase?'}
          </button>
        </div>

        {#if done}
          <p class="note">Clean hand — banks 0 penalty points.</p>
        {:else}
          <div class="row spread">
            <span class="subtotal tnum" use:bumpOnChange={handValueOf(p.id)}
              >{handValueOf(p.id)}<span class="sub">pts left in hand</span></span
            >
          </div>
          <div class="tally">
            <label class="f">
              <span class="klabel">🔢 1–9 <span class="hint">×5</span></span>
              <Stepper bind:value={input.hands![p.id].low} min={0} label="{p.name} 1 to 9 cards" />
            </label>
            <label class="f">
              <span class="klabel">🔟 10–12 <span class="hint">×10</span></span>
              <Stepper
                bind:value={input.hands![p.id].high}
                min={0}
                label="{p.name} 10 to 12 cards"
              />
            </label>
            <label class="f">
              <span class="klabel">⛔ Skip <span class="hint">×15</span></span>
              <Stepper bind:value={input.hands![p.id].skip} min={0} label="{p.name} skip cards" />
            </label>
            <label class="f">
              <span class="klabel">🌈 Wild <span class="hint">×25</span></span>
              <Stepper bind:value={input.hands![p.id].wild} min={0} label="{p.name} wild cards" />
            </label>
          </div>
        {/if}
      {/if}
    </div>
  {/each}
</div>

<style>
  .prompt {
    font-size: 0.9rem;
  }

  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }
  /* Completed this hand — the restrained Crown-Gold wash the scoreboard uses,
     co-signalled by the ✅ label, never colour alone. */
  .prow.done {
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
  .badge {
    flex: none;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .badge.crown {
    color: var(--accent-ink);
  }

  .subtotal {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .subtotal .sub {
    margin-left: 6px;
    font-weight: 500;
    font-size: 0.78rem;
    color: var(--muted);
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
    transition:
      background 0.15s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }
  .wentout:hover {
    color: var(--text);
    background: var(--surface-3);
  }
  /* Selected = gold-ink + gold border tint, NOT a violet fill — the one violet
     action on the screen stays the shell's Save. */
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
  .tnum {
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .prow,
    .wentout {
      transition: none;
    }
  }
</style>
