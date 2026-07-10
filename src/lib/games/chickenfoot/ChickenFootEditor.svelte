<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import { chickenfoot } from './index';
  import DominoCountdown from './DominoCountdown.svelte';
  import FeatherBurst from './FeatherBurst.svelte';
  import DreadStamp from './DreadStamp.svelte';
  import {
    blankValue,
    playerRoundScore,
    roundPipTotal,
    startDouble,
    totalRounds,
    type ChickenFootInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: ChickenFootInput; ctx: RoundContext } = $props();

  const blankVal = $derived(blankValue(ctx.config));
  const rounds = $derived(totalRounds(ctx.config));
  const roundNum = $derived(ctx.roundIndex + 1);
  const start = $derived(startDouble(ctx.config));
  const pipTotal = $derived(roundPipTotal(input, ctx.players, blankVal));
  const blocked = $derived(input.outId === null);
  const outName = $derived(ctx.players.find((p) => p.id === input.outId)?.name ?? '');
  let showHelp = $state(false);

  // Delight tokens, bumped only by a real user tap (never on mount / edit-open), so a
  // fresh go-out flings feathers and a fresh double-blank slams the goose-egg stamp.
  let featherTokens = $state<Record<string, number>>({});
  let dreadTokens = $state<Record<string, number>>({});

  function setOut(id: string) {
    const turningOn = input.outId !== id;
    input.outId = turningOn ? id : null;
    if (turningOn) {
      input.pips[id] = 0;
      if (input.blankId === id) input.blankId = null;
      featherTokens = { ...featherTokens, [id]: (featherTokens[id] ?? 0) + 1 };
      haptic('tick');
    }
  }

  function setBlank(id: string) {
    const turningOn = input.blankId !== id;
    input.blankId = turningOn ? id : null;
    if (turningOn) {
      if (input.outId === id) input.outId = null;
      if (blankVal > 0) {
        dreadTokens = { ...dreadTokens, [id]: (dreadTokens[id] ?? 0) + 1 };
        haptic('tick');
      }
    }
  }

  function quickAdd(id: string, n: number) {
    input.pips[id] = Math.max(0, (Number(input.pips[id]) || 0) + n);
    haptic('tick');
  }

  function score(id: string): number {
    return playerRoundScore(input, id, blankVal);
  }
</script>

<div class="stack">
  <DominoCountdown {start} current={input.double} round={roundNum} total={rounds} />

  <div class="row spread">
    <span class="tally" title="Total pips being dumped on the table this round">
      🦴 <strong class="num">{pipTotal}</strong> {pipTotal === 1 ? 'pip' : 'pips'} on the table
    </span>
    <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
      Rules
    </button>
  </div>

  {#if showHelp}
    <pre class="help">{chickenfoot.help}</pre>
  {:else if blocked}
    <p class="hint muted">
      🚫 No one’s out yet — tap 🐔 when someone empties their hand, or leave it unset for a blocked round.
    </p>
  {:else}
    <p class="hint muted">🐔 {outName} went out — everyone else totals up their leftover bones.</p>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const out = input.outId === p.id}
    <div class="prow" class:isout={out}>
      <FeatherBurst token={featherTokens[p.id] ?? 0} />
      <DreadStamp token={dreadTokens[p.id] ?? 0} value={blankVal} />
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
        <div class="emptyhand">🐔 Went out — empty hand, 0 points!</div>
      {:else}
        <div class="row spread">
          <span class="plabel">Pips left</span>
          <Stepper bind:value={input.pips[p.id]} min={0} label={`${p.name} pips`} />
        </div>
        <div class="row quickadd">
          <button type="button" class="qchip" onclick={() => quickAdd(p.id, 5)}>+5</button>
          <button type="button" class="qchip" onclick={() => quickAdd(p.id, 10)}>+10</button>
          <button
            type="button"
            class="qchip clear"
            onclick={() => quickAdd(p.id, -(Number(input.pips[p.id]) || 0))}
            disabled={!(Number(input.pips[p.id]) > 0)}
          >
            Clear
          </button>
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
            🥚 Double-blank <span class="sub">(+{blankVal})</span>
          </button>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  /* Live "pips on the table" tally — the round's stakes at a glance. The 🦴 and the
     blocked-round wording co-signal beyond colour; the number is tabular so it never
     jitters as pips land. Never gold/violet, which the shell reserves. */
  .tally {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .tally .num {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin: 0;
    font-size: 0.85rem;
  }

  .prow {
    position: relative;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
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

  /* Quick-add chips: dump a big hand in a couple of taps instead of many stepper nudges.
     The stepper stays the precise control; these are the fast path. */
  .quickadd {
    gap: 6px;
    margin-top: 8px;
    justify-content: flex-end;
  }
  .qchip {
    min-height: 46px;
    min-width: 52px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    transition: transform var(--dur-press) var(--ease-standard), background var(--dur-base) var(--ease-standard);
  }
  .qchip:active {
    transform: scale(0.94);
  }
  .qchip.clear {
    color: var(--muted);
    font-weight: 600;
  }
  .qchip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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
