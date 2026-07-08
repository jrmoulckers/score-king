<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { chickenfoot } from './index';
  import { blankValue, doubleLabel, playerRoundScore, totalRounds, type ChickenFootInput } from './logic';

  let { input = $bindable(), ctx }: { input: ChickenFootInput; ctx: RoundContext } = $props();

  const blankVal = $derived(blankValue(ctx.config));
  const rounds = $derived(totalRounds(ctx.config));
  const roundNum = $derived(ctx.roundIndex + 1);
  let showHelp = $state(false);

  function setOut(id: string) {
    input.outId = input.outId === id ? null : id;
    if (input.outId === id) {
      input.pips[id] = 0;
      if (input.blankId === id) input.blankId = null;
    }
  }

  function setBlank(id: string) {
    input.blankId = input.blankId === id ? null : id;
    if (input.blankId === id && input.outId === id) input.outId = null;
  }

  function score(id: string): number {
    return playerRoundScore(input, id, blankVal);
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="row" style="gap: 8px">
      <span class="pill">Round {roundNum} of {rounds}</span>
      <span class="tile" class:blank={input.double === 0} title={doubleLabel(input.double)}>
        <span class="half">{input.double}</span>
        <span class="bar" aria-hidden="true"></span>
        <span class="half">{input.double}</span>
      </span>
    </span>
    <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
      Rules
    </button>
  </div>

  {#if showHelp}
    <pre class="help">{chickenfoot.help}</pre>
  {:else}
    <p class="hint muted">Log each hand’s leftover pips, then tap 🐔 for whoever went out.</p>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const out = input.outId === p.id}
    <div class="prow" class:isout={out}>
      <div class="row spread" style="margin-bottom: 10px">
        <span class="row" style="gap: 8px">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        <span
          class="preview"
          class:score-good={score(p.id) === 0}
          class:score-bad={score(p.id) > 0}
        >
          {score(p.id) > 0 ? '+' : ''}{score(p.id)}
        </span>
      </div>

      {#if out}
        <div class="emptyhand">🐔 Went out — empty hand, 0 points</div>
      {:else}
        <div class="row spread">
          <span class="plabel">Pips left</span>
          <Stepper bind:value={input.pips[p.id]} min={0} />
        </div>
      {/if}

      <div class="row toggles">
        <button
          type="button"
          class="toggle out"
          class:on={out}
          aria-pressed={out}
          onclick={() => setOut(p.id)}
        >
          🐔 Went out
        </button>
        {#if blankVal > 0}
          <button
            type="button"
            class="toggle blank"
            class:on={input.blankId === p.id}
            aria-pressed={input.blankId === p.id}
            disabled={out}
            onclick={() => setBlank(p.id)}
          >
            ⬜ Double-blank <span class="sub">(+{blankVal})</span>
          </button>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  /* A little domino showing the double this round is built on — the personality moment,
     built from the surface ramp (never gold/violet, which are reserved). */
  .tile {
    display: inline-flex;
    align-items: stretch;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    overflow: hidden;
  }
  .tile .half {
    min-width: 22px;
    padding: 5px 7px;
    text-align: center;
  }
  .tile.blank .half {
    color: var(--muted);
  }
  .tile .bar {
    width: 1px;
    background: var(--border);
  }

  .hint {
    margin: 0;
    font-size: 0.85rem;
  }

  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
  }
  /* Went-out is the good outcome (lowest pips) — co-signal it with a calm green edge,
     never color alone: the 🐔, the "empty hand" line and the 0 all say it too. */
  .prow.isout {
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
  }

  .preview {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .emptyhand {
    color: var(--good);
    font-weight: 700;
    padding: 3px 0;
  }

  .plabel {
    color: var(--muted);
    font-size: 0.85rem;
  }

  .toggles {
    gap: 8px;
    margin-top: 10px;
  }
  .toggle {
    flex: 1;
    min-height: 46px;
    padding: 9px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .toggle .sub {
    color: var(--muted);
    font-weight: 500;
  }
  /* Selected states use the semantic palette (good / bad), keeping Royal Violet for the
     shell's one Save action and Crown Gold for the leader alone. */
  .toggle.out.on {
    background: color-mix(in srgb, var(--good) 20%, var(--surface));
    border-color: var(--good);
  }
  .toggle.blank.on {
    background: color-mix(in srgb, var(--bad) 20%, var(--surface));
    border-color: var(--bad);
  }
  .toggle.blank.on .sub {
    color: var(--bad);
  }

  .help {
    white-space: pre-wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    font-size: 0.85rem;
    margin: 0;
    font-family: inherit;
    color: var(--muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .toggle {
      transition: none;
    }
  }
</style>
