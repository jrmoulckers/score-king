<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { bumpOnChange } from '../../motion';
  import { haptic } from '../../haptics';
  import { ginRummy } from './index';
  import {
    boxCounts,
    opponentOf,
    readConfig,
    scoreHand,
    scoreRound,
    type GinRummyInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: GinRummyInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));
  const byId = $derived(new Map(ctx.players.map((p) => [p.id, p])));
  const opponentId = $derived(opponentOf(ctx.players, input.knockerId ?? null));

  const hand = $derived(scoreHand(input, ctx.players, ctx.config));
  const priorRounds = $derived(
    ctx.rounds.filter((r) => r.index < ctx.roundIndex).sort((a, b) => a.index - b.index),
  );
  const deltas = $derived(scoreRound(input, ctx.players, ctx.config, ctx.totals, priorRounds));
  const boxes = $derived(boxCounts(priorRounds, ctx.players, ctx.config));

  const rawTotals = $derived(
    Object.fromEntries(
      ctx.players.map((p) => [p.id, (ctx.totals[p.id] ?? 0) + (hand?.deltas[p.id] ?? 0)]),
    ),
  );
  /** Whether recording this hand ends the whole game (crosses the target). */
  const gameEnds = $derived(cfg.target > 0 && Object.values(rawTotals).some((t) => t >= cfg.target));
  const settlementAdded = $derived(
    gameEnds
      ? Object.fromEntries(
          ctx.players.map((p) => [p.id, (deltas[p.id] ?? 0) - (hand?.deltas[p.id] ?? 0)]),
        )
      : null,
  );

  let showHelp = $state(false);

  function setKnocker(id: string) {
    if (input.knockerId === id) return;
    input.knockerId = id;
    haptic('tick');
  }

  function toggleGin() {
    input.gin = !input.gin;
    if (input.gin && input.knockerId) input.deadwood[input.knockerId] = 0;
    haptic('tick');
  }

  const dirty = $derived(
    !!input.knockerId || Object.values(input.deadwood ?? {}).some((v) => (v ?? 0) > 0),
  );

  function clearHand() {
    input.knockerId = null;
    input.gin = false;
    for (const p of ctx.players) input.deadwood[p.id] = 0;
    haptic('undo');
  }

  /** A player's total boxes (hands won) through and including this hand. */
  function boxesFor(id: string): number {
    return (boxes[id] ?? 0) + ((hand?.deltas[id] ?? 0) > 0 ? 1 : 0);
  }

  const outcomeLabel = $derived.by(() => {
    if (!hand) return null;
    if (hand.outcome === 'gin') return { emoji: '💅', text: 'Gin!' };
    if (hand.outcome === 'knock') return { emoji: '🚪', text: 'Knocked' };
    return { emoji: '🔁', text: 'Undercut!' };
  });
</script>

<div class="stack">
  <section class="deal">
    <div class="row spread wrap head">
      <h3 class="ttl">🍸 Hand {ctx.roundIndex + 1} — who knocked?</h3>
      <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
        How to score
      </button>
    </div>

    <div class="knockers" role="radiogroup" aria-label="Who knocked or went gin">
      {#each ctx.players as p (p.id)}
        {@const on = input.knockerId === p.id}
        <button
          type="button"
          role="radio"
          aria-checked={on}
          class="knocker"
          class:on
          onclick={() => setKnocker(p.id)}
        >
          <Avatar name={p.name} color={p.color} />
          <span class="kname">{p.name}</span>
          {#if on}<span class="badge">knocked</span>{/if}
        </button>
      {/each}
    </div>

    <button
      type="button"
      class="gin"
      class:on={input.gin}
      disabled={!input.knockerId}
      onclick={toggleGin}
    >
      <span class="gmark" aria-hidden="true">{input.gin ? '✓' : '💅'}</span>
      <span class="gtext">
        <strong>Went gin</strong>
        <span class="gsub">Zero deadwood — no lay-offs, +{cfg.ginBonus} bonus</span>
      </span>
    </button>

    {#if showHelp}
      <pre class="help">{ginRummy.help}</pre>
    {/if}
  </section>

  {#if input.knockerId}
    <section class="deadwood">
      <h4 class="dttl">Deadwood</h4>
      <div class="dgrid">
        {#each ctx.players as p (p.id)}
          {@const isKnocker = p.id === input.knockerId}
          {@const forcedZero = isKnocker && input.gin}
          <div class="drow">
            <span class="dwho row wrap">
              <Avatar name={p.name} color={p.color} />
              <span>{p.name}</span>
            </span>
            {#if forcedZero}
              <span class="dzero">0 — gin</span>
            {:else}
              <Stepper
                bind:value={input.deadwood[p.id]}
                min={0}
                max={100}
                label={`${p.name} deadwood`}
              />
            {/if}
          </div>
        {/each}
      </div>
      {#if !input.gin}
        <p class="hint">
          Knocking is only legal with {cfg.maxKnockDeadwood} or fewer deadwood — mark Gin instead
          if {byId.get(input.knockerId)?.name ?? 'the knocker'} melded everything.
        </p>
      {/if}
    </section>
  {/if}

  {#if hand && outcomeLabel}
    <section class="result" class:gin={hand.outcome === 'gin'} class:cut={hand.outcome === 'undercut'}>
      <p class="rline" use:bumpOnChange={hand.margin}>
        <span aria-hidden="true">{outcomeLabel.emoji}</span>
        <strong>{outcomeLabel.text}</strong>
        {#if hand.outcome === 'undercut'}
          {byId.get(opponentId ?? '')?.name ?? 'Opponent'} takes the hand — +{hand.margin}
        {:else}
          {byId.get(hand.knockerId)?.name ?? 'Knocker'} scores +{hand.margin}
        {/if}
      </p>
      {#if gameEnds && settlementAdded}
        <p class="settle">
          🏆 That's the game! Settlement bonuses land now:
          {#each ctx.players as p (p.id)}
            {@const added = settlementAdded[p.id] ?? 0}
            {#if added > 0}
              <span class="sitem"
                >{p.name} +{added} ({boxesFor(p.id)} box{boxesFor(p.id) === 1 ? '' : 'es'})</span
              >
            {/if}
          {/each}
        </p>
      {/if}
      <p class="totals">
        {#each ctx.players as p (p.id)}
          <span class="tline">
            {p.name}: {ctx.totals[p.id] ?? 0} → <strong>{(ctx.totals[p.id] ?? 0) + (deltas[p.id] ?? 0)}</strong>
          </span>
        {/each}
      </p>
    </section>
  {/if}

  {#if dirty}
    <div class="row foot">
      <button type="button" class="btn small ghost" onclick={clearHand}>Clear this hand</button>
    </div>
  {/if}
</div>

<style>
  .deal {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    align-items: center;
  }
  .ttl {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }
  .knockers {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .knocker {
    flex: 1 1 140px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--dur-base) var(--ease-standard);
  }
  .knocker:hover {
    background: var(--surface-3);
  }
  .knocker.on {
    background: var(--surface-3);
    border-color: var(--primary);
    box-shadow: inset 3px 0 0 var(--primary);
  }
  .knocker:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .kname {
    flex: 1;
    text-align: left;
  }
  .badge {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--primary);
    color: #fff;
  }
  .gin {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 8px 12px;
    text-align: left;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  .gin:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .gin.on {
    border-color: var(--good);
    background: color-mix(in srgb, var(--good) 12%, var(--surface));
  }
  .gin:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .gmark {
    font-size: 1.25rem;
    line-height: 1;
  }
  .gtext {
    display: flex;
    flex-direction: column;
  }
  .gsub {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .deadwood {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .dttl {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 700;
  }
  .dgrid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .drow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px;
  }
  .dwho {
    gap: 8px;
    align-items: center;
    font-weight: 600;
  }
  .dzero {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--good);
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .result {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .result.gin {
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
  }
  .result.cut {
    border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
  }
  .rline {
    margin: 0;
    font-size: 0.95rem;
  }
  .settle {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sitem {
    font-weight: 600;
    color: var(--text);
  }
  .totals {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .totals strong {
    color: var(--text);
  }
  .foot {
    justify-content: flex-end;
  }
  .help {
    white-space: pre-wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
    font-size: 0.9rem;
    margin: 0;
    font-family: inherit;
    color: var(--muted);
  }
</style>
