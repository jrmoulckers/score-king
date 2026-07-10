<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import { bumpOnChange, popIn } from '../../motion';
  import {
    deltaOf,
    projectedTotal,
    reachedTarget,
    readConfig,
    remainingToTarget,
    targetProgress,
    type TallyInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: TallyInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));
  const round = $derived(ctx.roundIndex + 1);
  const low = $derived(cfg.direction === 'low');

  // Quick-add chips scaled to the game's point step (×1 / ×5 / ×10), so counting to a big
  // target is a tap or two rather than a hundred nudges. The signature stepper stays for
  // fine control and negatives (games that subtract).
  const chipMultipliers = [1, 5, 10] as const;

  function before(id: string): number {
    return Number(ctx.totals[id]) || 0;
  }
  function delta(id: string): number {
    return deltaOf(input, id);
  }
  function projected(id: string): number {
    return projectedTotal(before(id), delta(id));
  }
  // "Good for this player" = moving toward winning: up in a high-score game, down in a
  // low-score game. The signed number and arrow co-signal the change, so colour is never
  // the only cue.
  function helps(id: string): boolean {
    const d = delta(id);
    return d !== 0 && (low ? d < 0 : d > 0);
  }
  function hurts(id: string): boolean {
    const d = delta(id);
    return d !== 0 && (low ? d > 0 : d < 0);
  }
  function signed(n: number): string {
    return n > 0 ? `+${n}` : `${n}`;
  }
  function remaining(id: string): number | null {
    return remainingToTarget(projected(id), cfg.target);
  }
  // "Getting close" tension: within three steps of the target. Amber (a sanctioned
  // attention colour), always paired with the 🎯 icon and the "N to go" words.
  function closing(id: string): boolean {
    const r = remaining(id);
    return r != null && r <= cfg.step * 3;
  }

  function add(id: string, amount: number) {
    input.deltas[id] = (Number(input.deltas[id]) || 0) + amount;
    haptic('tick');
  }
  function reset(id: string) {
    input.deltas[id] = 0;
  }

  // Milestone celebration: fire the win haptic the moment a player's projected total first
  // crosses the target *this* round (they were below it before). The gold "🎯 Reached!"
  // badge pops in on mount via use:popIn; the haptic is the tactile half. Tracked per id so
  // stepping back below and over again re-celebrates, and an already-won player (before ≥
  // target when the editor opens) never fake-celebrates.
  let celebrated: Record<string, boolean> = $state({});
  $effect(() => {
    for (const p of ctx.players) {
      const reached = reachedTarget(projected(p.id), cfg.target);
      const freshCross = reached && before(p.id) < cfg.target;
      if (freshCross && !celebrated[p.id]) {
        celebrated[p.id] = true;
        haptic('win');
      } else if (!reached && celebrated[p.id]) {
        celebrated[p.id] = false;
      }
    }
  });
</script>

<div class="stack">
  <div class="row spread head">
    <span class="row" style="gap: 8px; flex-wrap: wrap">
      <span class="pill">Round {round}</span>
      <span class="pill">{low ? '⬇️ Lowest wins' : '⬆️ Highest wins'}</span>
      {#if cfg.target > 0}
        <span class="pill">🎯 to {cfg.target}</span>
      {/if}
      {#if cfg.step !== 1}
        <span class="pill">±{cfg.step}/tap</span>
      {/if}
    </span>
  </div>

  {#each ctx.players as p (p.id)}
    {@const pr = projected(p.id)}
    {@const rem = remaining(p.id)}
    {@const prog = targetProgress(pr, cfg.target)}
    <div class="prow">
      <div class="row spread top">
        <span class="row who" style="gap: 8px; min-width: 0">
          <Avatar name={p.name} color={p.color} />
          <strong class="ellipsis">{p.name}</strong>
        </span>
        <span class="tally">
          <span class="cur">{before(p.id)}</span>
          <span class="arrow" aria-hidden="true">→</span>
          <span
            class="proj"
            class:score-good={helps(p.id)}
            class:score-bad={hurts(p.id)}
            use:bumpOnChange={pr}
          >{pr}</span>
          {#if delta(p.id) !== 0}
            <span class="dchip" class:score-good={helps(p.id)} class:score-bad={hurts(p.id)}>
              {signed(delta(p.id))}
            </span>
          {/if}
        </span>
      </div>

      {#if cfg.target > 0}
        <div class="target">
          <div class="meter" aria-hidden="true">
            <div
              class="fill"
              class:reached={reachedTarget(pr, cfg.target)}
              style="transform: scaleX({prog ?? 0})"
            ></div>
          </div>
          <div class="tstat tabnum">
            {#if reachedTarget(pr, cfg.target)}
              <span class="reached" use:popIn>🎯 Reached!</span>
            {:else if rem != null}
              <span class="togo" class:close={closing(p.id)}>🎯 {rem} to go</span>
            {/if}
            <span class="ratio">{pr} / {cfg.target}</span>
          </div>
        </div>
      {/if}

      <div class="entry">
        <div class="chips">
          {#each chipMultipliers as m (m)}
            <button type="button" class="chip" onclick={() => add(p.id, cfg.step * m)}>
              +{cfg.step * m}
            </button>
          {/each}
          <button
            type="button"
            class="chip reset"
            onclick={() => reset(p.id)}
            disabled={delta(p.id) === 0}
            aria-label={`Reset ${p.name} to no change`}
            title="Reset to no change"
          >↺</button>
        </div>
        <Stepper bind:value={input.deltas[p.id]} step={cfg.step} label={p.name} />
      </div>
    </div>
  {/each}
</div>

<style>
  .head {
    flex-wrap: wrap;
    gap: 8px;
  }
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tally {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    flex: none;
  }
  .tally .cur,
  .tally .arrow {
    color: var(--muted);
  }
  .tally .proj {
    font-weight: 800;
    font-size: 1.2rem;
  }
  /* The signed round delta, restated as a chip so the change reads without relying on
     colour: the +/− sign carries it, the tint just reinforces. */
  .dchip {
    font-size: 0.78rem;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--muted);
  }
  .score-good {
    color: var(--good);
  }
  .score-bad {
    color: var(--bad);
  }
  .dchip.score-good {
    background: color-mix(in srgb, var(--good) 18%, var(--surface-3));
  }
  .dchip.score-bad {
    background: color-mix(in srgb, var(--bad) 18%, var(--surface-3));
  }

  /* Target progress: a slim neutral meter that climbs the surface ramp, turning Crown Gold
     only when the target is reached — the one moment gold is earned (this player has won). */
  .target {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .meter {
    height: 5px;
    border-radius: 999px;
    background: var(--surface);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    width: 100%;
    border-radius: 999px;
    transform-origin: left center;
    background: color-mix(in srgb, var(--text) 42%, var(--surface-3));
    transition: transform var(--dur-base, 0.18s) var(--ease-standard, ease);
  }
  .fill.reached {
    background: var(--accent);
  }
  .tstat {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.8rem;
  }
  .tabnum {
    font-variant-numeric: tabular-nums;
  }
  .togo {
    color: var(--muted);
    font-weight: 600;
  }
  .togo.close {
    color: var(--warn);
  }
  .reached {
    color: var(--accent-ink);
    font-weight: 800;
  }
  .ratio {
    color: var(--muted);
    font-weight: 700;
  }

  .entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 46px;
    min-height: 46px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, transform var(--dur-press, 0.09s) ease;
  }
  .chip:hover {
    background: var(--surface-3);
    border-color: var(--primary);
  }
  .chip:active {
    transform: scale(0.94);
  }
  .chip:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .chip.reset {
    color: var(--muted);
    font-size: 1.15rem;
  }
  .chip:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .chip.reset:hover:not(:disabled) {
    color: var(--text);
  }
</style>
