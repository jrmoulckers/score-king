<script lang="ts">
  import { untrack } from 'svelte';
  import { scoreRow } from './logic';

  const { initialRound, maxRounds }: { initialRound: number; maxRounds: number } = $props();
  const startingRound = untrack(() => Math.max(1, Math.min(initialRound, maxRounds)));
  let round = $state(startingRound);
  let bid = $state(Math.min(2, startingRound));
  let won = $state<number[]>(
    Array.from({ length: Math.min(2, startingRound) }, (_, index) => index),
  );
  const actual = $derived(won.length);
  const score = $derived(scoreRow({ bid, actual, bonus: 0 }, round, true));
  const matched = $derived(bid === actual);
  const signed = $derived(score >= 0 ? `+${score}` : `−${Math.abs(score)}`);
  const verdict = $derived(
    matched
      ? 'Bid matched'
      : bid === 0
        ? 'Zero bid missed'
        : `${Math.abs(actual - bid)} ${actual > bid ? 'over' : 'under'} your bid`,
  );
  const equation = $derived(
    bid === 0
      ? `${matched ? '10' : '−10'} × round ${round} = ${signed}`
      : matched
        ? `${bid} × 20 = ${Math.abs(score)}`
        : `${Math.abs(actual - bid)} × −10 = ${signed}`,
  );
  const id = $props.id();

  function setRound(value: number) {
    round = value;
    bid = Math.min(bid, value);
    won = won.filter((index) => index < value);
  }
  function toggle(index: number) {
    won = won.includes(index) ? won.filter((value) => value !== index) : [...won, index];
  }
  function reset() {
    setRound(startingRound);
    bid = Math.min(2, startingRound);
    won = Array.from({ length: bid }, (_, index) => index);
  }
  $effect(() => {
    if (round > maxRounds) setRound(maxRounds);
  });
</script>

<section class="example" data-help-example aria-labelledby={`${id}-title`}>
  <div class="heading">
    <h3 id={`${id}-title`}>Try an example</h3>
    <label class="round"
      >Round
      <select
        aria-label="Example round"
        value={round}
        onchange={(event) => setRound(Number(event.currentTarget.value))}
      >
        {#each Array.from({ length: maxRounds }, (_, index) => index + 1) as value (value)}
          <option {value}>{value}</option>
        {/each}
      </select>
    </label>
  </div>
  <div class="bid">
    <label for={`${id}-bid`}>Your bid</label>
    <select id={`${id}-bid`} aria-label="Example bid" bind:value={bid}>
      {#each Array.from({ length: round + 1 }, (_, index) => index) as value (value)}
        <option {value}>{value}</option>
      {/each}
    </select>
    <span>tricks</span>
  </div>
  <div class="tricks-heading">
    <strong id={`${id}-tricks`}>Tap the tricks you won</strong>
    <button type="button" class="text-button" disabled={!actual} onclick={() => (won = [])}
      >Clear</button
    >
  </div>
  <div class="tricks" role="group" aria-labelledby={`${id}-tricks`}>
    {#each Array.from({ length: round }, (_, index) => index) as index (index)}
      <button
        type="button"
        class="trick"
        aria-label={`Trick ${index + 1}`}
        aria-pressed={won.includes(index)}
        onclick={() => toggle(index)}
      >
        <span class="number" aria-hidden="true">{index + 1}</span>
        {#if won.includes(index)}<span class="check" aria-hidden="true">✓</span>{/if}
      </button>
    {/each}
  </div>
  <div class="result" role="status" aria-live="polite" aria-atomic="true">
    <div>
      <span class="sr-only">Bid {bid} · Won {actual}</span>
      <strong class="score" class:negative={score < 0} data-help-score
        >{signed}<span>{' points'}</span></strong
      >
    </div>
    <div class="reason"><strong>{verdict}</strong><span>{equation}</span></div>
  </div>
  <div class="bottom">
    <span>Bonuses excluded.</span><button type="button" class="text-button" onclick={reset}
      >Reset example</button
    >
  </div>
</section>

<style>
  .example {
    min-width: 0;
  }
  .heading,
  .tricks-heading,
  .result,
  .bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  h3 {
    font-size: 1rem;
    margin: 0;
  }
  .round {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 0.8rem;
  }
  .round select {
    width: 62px;
    min-height: 46px;
    padding: 8px;
    font-size: 0.9rem;
  }
  .bid {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
    font-size: 0.9rem;
  }
  .bid label {
    font-weight: 700;
  }
  .bid select {
    width: 78px;
    min-height: 46px;
    padding: 8px 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .bid > span {
    color: var(--muted);
  }
  .tricks-heading {
    margin-top: 16px;
    font-size: 0.9rem;
  }
  .text-button {
    display: inline-flex;
    align-items: center;
    min-height: 46px;
    padding: 4px 0;
    background: transparent;
    color: var(--text);
    border: 0;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .text-button:hover {
    text-decoration: underline;
  }
  .text-button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
  }
  .tricks {
    display: grid;
    grid-template-columns: repeat(5, minmax(46px, 1fr));
    gap: 14px 12px;
    max-width: 360px;
    padding: 12px 2px 6px;
  }
  .trick {
    position: relative;
    isolation: isolate;
    display: grid;
    place-items: center;
    min-height: 90px;
    padding: 10px 3px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--muted);
    cursor: pointer;
    transition:
      transform var(--dur-base) var(--ease-out),
      background var(--dur-base) var(--ease-out);
  }
  .trick::before {
    content: '';
    position: absolute;
    inset: 3px -2px -3px 2px;
    z-index: -1;
    border: 1px solid var(--border);
    border-radius: inherit;
    background: var(--surface);
  }
  .trick:hover {
    transform: translateY(-3px);
    color: var(--text);
  }
  .number {
    font-size: 1.25rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .check {
    position: absolute;
    top: 4px;
    right: 7px;
    font-size: 0.9rem;
  }
  .trick[aria-pressed='true'] {
    background: var(--text);
    color: var(--bg);
    border-color: var(--text);
    transform: translateY(-4px);
  }
  .trick[aria-pressed='true']::before {
    background: var(--text);
  }
  .result {
    margin-top: 28px;
    gap: 16px;
  }
  .score {
    font-size: 1.6rem;
    line-height: 1.2;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--good);
  }
  .score.negative {
    color: var(--bad);
  }
  :global(html[data-theme='light']) .score {
    color: var(--text);
  }
  .score > span {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text);
  }
  .reason {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: right;
    font-size: 0.9rem;
  }
  .reason > span {
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .bottom {
    margin-top: 12px;
  }
  .bottom > span {
    color: var(--muted);
    font-size: 0.8rem;
  }
  @media (max-width: 440px) {
    .bid {
      margin-top: 14px;
    }
    .tricks {
      gap: 10px 7px;
    }
    .trick {
      min-height: 76px;
    }
    .result {
      margin-top: 20px;
      gap: 10px;
    }
    .reason {
      font-size: 0.8rem;
    }
  }
  @media (max-width: 360px) {
    .tricks {
      gap: 10px 5px;
    }
    .bottom {
      flex-wrap: wrap;
      gap: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .trick {
      transition: none;
    }
  }
  @media (forced-colors: active) {
    .trick[aria-pressed='true'] {
      outline: 2px solid Highlight;
    }
  }
</style>
