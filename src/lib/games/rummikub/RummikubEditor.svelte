<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { handPenalty, type RummikubInput } from './logic';
  import { rummikub } from './index';

  let { input = $bindable(), ctx }: { input: RummikubInput; ctx: RoundContext } = $props();

  const jokerValue = $derived(Math.max(0, Number(ctx.config.jokerValue) || 30));
  const fixedRounds = $derived(
    ctx.config.endMode === 'target' ? null : Number(ctx.config.rounds) || 4,
  );

  /** The winner's derived score: the sum of every opponent's leftover tiles. */
  const pot = $derived(
    ctx.players.reduce(
      (sum, p) => (p.id === input.winner ? sum : sum + handPenalty(input.hands[p.id], jokerValue)),
      0,
    ),
  );

  let showHelp = $state(false);

  function setWinner(id: string) {
    input.winner = input.winner === id ? null : id;
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="pill">Round {ctx.roundIndex + 1}{fixedRounds ? ` of ${fixedRounds}` : ''}</span>
    <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
      How to score
    </button>
  </div>

  {#if showHelp}
    <pre class="help">{rummikub.help}</pre>
  {/if}

  <p class="muted hint">
    {input.winner
      ? 'Now enter everyone else’s leftover tiles.'
      : 'Tap whoever went out — emptied their rack.'}
  </p>

  {#each ctx.players as p (p.id)}
    {@const isWinner = input.winner === p.id}
    {@const penalty = handPenalty(input.hands[p.id], jokerValue)}
    <div class="prow" class:winner={isWinner}>
      <div class="row spread">
        <span class="row" style="gap: 8px">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        {#if isWinner}
          <span class="preview score-good">+{pot}</span>
        {:else}
          <span class="preview" class:score-bad={penalty > 0}>{penalty > 0 ? `−${penalty}` : '0'}</span>
        {/if}
      </div>

      <div class="controls">
        <button
          type="button"
          class="toggle"
          class:on={isWinner}
          aria-pressed={isWinner}
          onclick={() => setWinner(p.id)}
        >
          {isWinner ? '🏆 Rummikub!' : 'Went out'}
        </button>

        {#if !isWinner}
          <div class="fields">
            <label class="f">
              Tiles
              <Stepper bind:value={input.hands[p.id].tiles} min={0} />
            </label>
            <label class="f">
              Jokers
              <Stepper bind:value={input.hands[p.id].jokers} min={0} max={2} />
            </label>
          </div>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .prow.winner {
    border-color: var(--primary);
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .toggle {
    min-height: 46px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
  }
  .toggle.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .fields {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .preview {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    margin: 0;
    font-size: 0.9rem;
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
