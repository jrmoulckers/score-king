<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { bumpOnChange } from '../../motion';
  import { haptic } from '../../haptics';
  import { yahtzee } from './index';
  import {
    CATEGORIES,
    SIXES_INDEX,
    UPPER_BONUS,
    UPPER_BONUS_THRESHOLD,
    YAHTZEE_BONUS,
    allowsBonusYahtzees,
    categoryForRound,
    type YahtzeeInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: YahtzeeInput; ctx: RoundContext } = $props();

  const cat = $derived(categoryForRound(ctx.roundIndex));
  const isSixes = $derived(ctx.roundIndex === SIXES_INDEX);
  const bonusRound = $derived(allowsBonusYahtzees(ctx.roundIndex));

  let showHelp = $state(false);

  function scoreFor(id: string): number {
    return Number(input.scores[id]) || 0;
  }

  /** A player's upper subtotal *before* this round — used to preview the 63+ bonus live. */
  function upperBefore(id: string): number {
    return Number(ctx.totals[id]) || 0;
  }

  function upperBonusHits(id: string): boolean {
    if (!isSixes) return false;
    return upperBefore(id) + scoreFor(id) >= UPPER_BONUS_THRESHOLD;
  }

  function bonusYahtzeesFor(id: string): number {
    return Math.max(0, Math.trunc(Number(input.bonusYahtzees?.[id]) || 0));
  }

  /** Preview of this round's total delta for a player (category score + any bonuses). */
  function preview(id: string): number {
    let pts = scoreFor(id);
    if (upperBonusHits(id)) pts += UPPER_BONUS;
    if (bonusRound) pts += bonusYahtzeesFor(id) * YAHTZEE_BONUS;
    return pts;
  }

  function toggleFixed(id: string, hit: boolean) {
    if (!cat?.fixedScore) return;
    if ((scoreFor(id) >= cat.fixedScore) === hit) return;
    input.scores[id] = hit ? cat.fixedScore : 0;
    haptic(hit ? 'save' : 'tick');
  }

  const roundNum = $derived(ctx.roundIndex + 1);
  const total = $derived(CATEGORIES.length);
</script>

{#if cat}
  <div class="stack">
    <div class="head">
      <div class="row spread wrap">
        <h3 class="ttl">
          {cat.emoji} Round {roundNum}/{total} — {cat.label}
        </h3>
        <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
          Rules
        </button>
      </div>
      <p class="hint">
        {cat.hint}
        {#if cat.fixedScore}· all-or-nothing: {cat.fixedScore} or 0{/if}
      </p>
      {#if isSixes}
        <p class="callout">
          ⬆️ Score {UPPER_BONUS_THRESHOLD}+ across Ones–Sixes and the +{UPPER_BONUS} bonus lands
          automatically below.
        </p>
      {/if}
      {#if bonusRound}
        <p class="callout">
          🎉 Rolled an extra Yahtzee after your box was already filled (Joker rule)? Add it here —
          +{YAHTZEE_BONUS} each.
        </p>
      {/if}
    </div>

    {#if showHelp}
      <pre class="help">{yahtzee.help}</pre>
    {/if}

    {#each ctx.players as p (p.id)}
      {@const score = scoreFor(p.id)}
      {@const hitBonus = upperBonusHits(p.id)}
      {@const pts = preview(p.id)}
      <div class="prow">
        <div class="row spread" style="margin-bottom: 10px">
          <span class="row" style="gap: 8px">
            <Avatar name={p.name} color={p.color} />
            <strong>{p.name}</strong>
          </span>
          <span class="preview" use:bumpOnChange={pts}>+{pts}</span>
        </div>

        {#if cat.fixedScore}
          {@const hit = score >= cat.fixedScore}
          <div class="fixed-toggle" role="radiogroup" aria-label={`${p.name} ${cat.label}`}>
            <button
              type="button"
              role="radio"
              aria-checked={!hit}
              class="fchoice"
              class:on={!hit}
              onclick={() => toggleFixed(p.id, false)}
            >
              ✗ 0
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={hit}
              class="fchoice"
              class:on={hit}
              onclick={() => toggleFixed(p.id, true)}
            >
              ✓ +{cat.fixedScore}
            </button>
          </div>
        {:else if cat.face}
          <div class="row spread wrap">
            <span class="flabel">Dice showing {cat.face}</span>
            <Stepper
              bind:value={input.scores[p.id]}
              step={cat.face}
              min={0}
              max={cat.max}
              label={`${p.name} ${cat.label}`}
            />
          </div>
        {:else}
          <div class="row spread wrap">
            <span class="flabel">Score</span>
            <Stepper
              bind:value={input.scores[p.id]}
              min={0}
              max={cat.max}
              label={`${p.name} ${cat.label}`}
            />
          </div>
        {/if}

        {#if isSixes && hitBonus}
          <p class="badge good">🎉 Upper bonus +{UPPER_BONUS}!</p>
        {/if}

        {#if bonusRound && input.bonusYahtzees}
          <div class="row spread wrap bonus-row">
            <span class="flabel">Extra Yahtzees (+{YAHTZEE_BONUS} ea)</span>
            <Stepper
              bind:value={input.bonusYahtzees[p.id]}
              min={0}
              max={5}
              label={`${p.name} extra Yahtzees`}
            />
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .head {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ttl {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .callout {
    margin: 0;
    padding: 9px 12px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--primary) 10%, var(--surface));
    border: 1px dashed color-mix(in srgb, var(--primary) 45%, var(--border));
    font-size: 0.85rem;
  }
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .preview {
    font-weight: 800;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
  }
  .flabel {
    font-size: 0.85rem;
    color: var(--muted);
    font-weight: 600;
  }
  .fixed-toggle {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .fchoice {
    flex: 1 1 0;
    min-height: 46px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition:
      background var(--dur-base) var(--ease-standard),
      color var(--dur-base) var(--ease-standard);
  }
  .fchoice.on {
    background: var(--primary);
    color: #fff;
  }
  .fchoice:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  /* Semantic tint co-signalled by emoji + words — never colour alone. */
  .badge {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
    align-self: flex-start;
  }
  .badge.good {
    background: color-mix(in srgb, var(--good) 16%, var(--surface));
    color: var(--text);
  }
  .bonus-row {
    padding-top: 6px;
    border-top: 1px dashed var(--border);
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
</style>
