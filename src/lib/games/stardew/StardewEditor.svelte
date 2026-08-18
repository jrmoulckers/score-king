<script lang="ts">
  import type { RoundContext } from '../../types';
  import Stepper from '../../components/Stepper.svelte';
  import { bumpOnChange, popIn } from '../../motion';
  import {
    EVAL_CATEGORIES,
    MAX_CANDLES,
    MAX_EVALUATION,
    STARDEW_HELP,
    candleTier,
    candleVerdict,
    evaluationScore,
    maxSeasons,
    priorCategoryTotals,
    scoreForTier,
    seasonLabel,
    seasonPoints,
    targetCandles,
    type CategoryKey,
    type StardewSeasonInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: StardewSeasonInput; ctx: RoundContext } = $props();

  const prior = $derived(priorCategoryTotals(ctx.rounds, ctx.roundIndex));
  // Every seat holds the identical total in this co-op game, so the group score is
  // just "the" total — there is no leader to pick out and no gap to close.
  const priorScore = $derived(evaluationScore(ctx.totals));
  const thisSeason = $derived(seasonPoints(input));
  const projected = $derived(priorScore + thisSeason);
  const tier = $derived(candleTier(projected));
  const target = $derived(targetCandles(ctx.config));
  const won = $derived(tier >= target);
  const label = $derived(seasonLabel(ctx.roundIndex));
  const totalSeasons = $derived(maxSeasons(ctx.config));
  const toTarget = $derived(Math.max(0, scoreForTier(target) - projected));
  const candles = $derived(
    Array.from({ length: MAX_CANDLES }, (_, i) => ({
      lit: i < tier,
      isTarget: i + 1 === target,
    })),
  );

  let showHelp = $state(false);

  function cumulative(key: CategoryKey): number {
    return (prior[key] ?? 0) + (Number(input[key]) || 0);
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="pill">{label.emoji} {label.name} · Year {label.year}</span>
    <span class="row" style="gap: 8px">
      <span class="pill">Season {ctx.roundIndex + 1} of {totalSeasons}</span>
      <button
        type="button"
        class="btn small ghost"
        onclick={() => (showHelp = !showHelp)}
        aria-expanded={showHelp}
      >
        Evaluation
      </button>
    </span>
  </div>

  {#if showHelp}
    <pre class="help">{STARDEW_HELP}</pre>
  {/if}

  <!--
    Grandpa's Evaluation meter. Progress is Win Green because it is *progress*, not
    standing; Crown Gold appears only once the group has actually secured its target
    tier — at that moment the whole table is the winner, which is precisely what gold
    is reserved for. Every colour cue is co-signalled by the 🕯️/🏆 glyph, the lit/unlit
    shape, and the "n of 4 lit" text.
  -->
  <div class="meter" class:won aria-live="polite">
    <div class="row spread">
      <span class="overline">Grandpa's Evaluation</span>
      <span class="score" class:lead={won}>
        <span use:bumpOnChange={projected}>{projected}</span><span class="max"
          >/{MAX_EVALUATION}</span
        >
      </span>
    </div>
    <div class="candles" role="img" aria-label="{tier} of {MAX_CANDLES} candles lit">
      {#each candles as c, i (i)}
        <span class="candle" class:lit={c.lit} class:target={c.isTarget}>
          <span class="flame" aria-hidden="true">🕯️</span>
        </span>
      {/each}
    </div>
    <div class="row spread verdict">
      <span class="verdict-text">
        {#if won}<span class="trophy" aria-hidden="true" use:popIn>🏆</span>{/if}
        {candleVerdict(tier)}
      </span>
      <span class="muted goal">
        {#if won}
          Target met · {tier} of {MAX_CANDLES} lit
        {:else}
          <span class="num">{toTarget}</span> more for {target}
          {target === 1 ? 'candle' : 'candles'}
        {/if}
      </span>
    </div>
  </div>

  <p class="shared">
    <span aria-hidden="true">🤝</span> One farm, one score — this season adds
    <strong>+{thisSeason}</strong> for every seat at the table.
  </p>

  {#each EVAL_CATEGORIES as c (c.key)}
    {@const done = cumulative(c.key)}
    {@const maxed = done >= c.cap}
    <div class="crow">
      <div class="label">
        <span class="emoji" aria-hidden="true">{c.emoji}</span>
        <span class="stack tight">
          <strong>{c.label}</strong>
          <span class="muted hint">{c.hint}</span>
        </span>
      </div>
      <div class="right">
        <span class="tally" class:maxed>
          {done}<span class="cap">/{c.cap}</span>
          {#if maxed}<span class="sr-only">— complete</span><span class="check" aria-hidden="true"
              >✓</span
            >{/if}
        </span>
        <Stepper
          bind:value={input[c.key]}
          min={0}
          max={c.cap - (prior[c.key] ?? 0)}
          label={c.label}
        />
      </div>
    </div>
  {/each}
</div>

<style>
  .meter {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition:
      background 0.2s ease,
      border-color 0.2s ease;
  }
  /* The group's victory moment — the one place Crown Gold appears in this game. */
  .meter.won {
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .overline {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .score {
    font-weight: 800;
    font-size: 1.5rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  /* Gold only for the won state, per the Crown Gold rule. */
  .score.lead {
    color: var(--accent-ink);
  }
  .score .max {
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 700;
  }
  .candles {
    display: flex;
    gap: 8px;
  }
  .candle {
    flex: 1 1 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
    line-height: 1;
    padding: 10px 0;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  /* Unlit candles are dimmed *and* shrunk, so the lit/unlit split survives greyscale. */
  .candle .flame {
    display: block;
    filter: grayscale(1);
    opacity: 0.35;
    transform: scale(0.82);
    transition:
      filter 0.2s ease,
      opacity 0.2s ease,
      transform 0.2s ease;
  }
  .candle.lit .flame {
    filter: none;
    opacity: 1;
    transform: none;
  }
  /* Progress is Win Green — it means "going well", not "winning". */
  .candle.lit {
    background: color-mix(in srgb, var(--good) 14%, var(--surface));
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
  }
  .meter.won .candle.lit {
    background: color-mix(in srgb, var(--accent) 16%, var(--surface));
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  /* Non-colour cue for the goal candle, so the target reads without relying on hue. */
  .candle.target {
    box-shadow: inset 0 -3px 0 0 var(--muted);
  }
  .verdict {
    font-size: 0.9rem;
    font-weight: 600;
    gap: 10px;
  }
  .verdict-text {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .trophy {
    flex: none;
    line-height: 1;
  }
  .goal {
    flex: none;
    font-weight: 600;
    font-size: 0.8rem;
    text-align: right;
  }
  .goal .num {
    font-variant-numeric: tabular-nums;
    color: var(--text);
    font-weight: 700;
  }
  .shared {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .shared strong {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .crow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .label .emoji {
    font-size: 1.4rem;
    line-height: 1;
    flex: none;
  }
  .stack.tight {
    gap: 2px;
  }
  .hint {
    font-size: 0.75rem;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: none;
  }
  .tally {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    min-width: 34px;
    text-align: right;
    white-space: nowrap;
  }
  /* A completed category is called out by the ✓ glyph as well as the colour. */
  .tally.maxed {
    color: var(--good);
  }
  .tally .cap {
    color: var(--muted);
    font-weight: 700;
    font-size: 0.8rem;
  }
  .tally .check {
    margin-left: 3px;
    font-size: 0.8rem;
  }
  .help {
    white-space: pre-wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
    font-size: 0.85rem;
    margin: 0;
    font-family: inherit;
    color: var(--muted);
    line-height: 1.5;
  }
  /* Calm alternative: the state change still lands, it just arrives instantly. */
  @media (prefers-reduced-motion: reduce) {
    .meter,
    .candle .flame {
      transition: none;
    }
  }
</style>
