<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import { kingscorners } from './index';
  import { MAX_KINGS, penaltyFor, wentOutIds, type KingsCornersInput } from './logic';

  let { input = $bindable(), ctx }: { input: KingsCornersInput; ctx: RoundContext } = $props();

  const ids = $derived(ctx.players.map((p) => p.id));
  const outs = $derived(new Set(wentOutIds(input, ids)));

  function penalty(id: string): number {
    return penaltyFor(input, id);
  }

  function markWentOut(id: string) {
    input.kingsLeft[id] = 0;
    input.othersLeft[id] = 0;
    haptic('win'); // a clean hand is the round's own small victory
  }

  // Whether the draft holds anything worth clearing — gates the "Clear hand" reset so it
  // only appears once you've started entering, never on an untouched round.
  const dirty = $derived(ids.some((id) => penalty(id) > 0));
  function clearHand() {
    for (const id of ids) {
      input.kingsLeft[id] = 0;
      input.othersLeft[id] = 0;
    }
    haptic('undo');
  }

  let showHelp = $state(false);
</script>

<div class="stack">
  <div class="row spread wrap">
    <span class="muted hint">Fewer points is better — race to empty your hand.</span>
    <span class="row" style="gap: 8px">
      {#if dirty}
        <button type="button" class="btn small ghost" onclick={clearHand}>Clear hand</button>
      {/if}
      <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
        {showHelp ? 'Hide rules' : 'How to play'}
      </button>
    </span>
  </div>

  {#if showHelp}
    <pre class="help">{kingscorners.help}</pre>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const went = outs.has(p.id)}
    {@const pts = penalty(p.id)}
    <div class="prow" class:went-out={went}>
      <div class="row spread" style="margin-bottom: 10px">
        <span class="row" style="gap: 8px; min-width: 0">
          <Avatar name={p.name} color={p.color} />
          <strong class="pname">{p.name}</strong>
        </span>
        <span class="preview-wrap">
          <span class="preview" class:score-good={pts === 0} class:score-bad={pts > 0}
            >{pts}</span
          >
          {#if went}
            <span class="outcome score-good">👑 went out</span>
          {:else if pts > 0}
            <span class="outcome">🂡 {pts} left</span>
          {/if}
        </span>
      </div>

      <div class="steppers">
        <div class="stepper-field">
          <span class="field-label">Kings left</span>
          <Stepper
            bind:value={input.kingsLeft[p.id]}
            min={0}
            max={MAX_KINGS}
            label={`${p.name} Kings left`}
          />
        </div>
        <div class="stepper-field">
          <span class="field-label">Other cards left</span>
          <Stepper
            bind:value={input.othersLeft[p.id]}
            min={0}
            max={51}
            label={`${p.name} other cards left`}
          />
        </div>
      </div>

      <button
        type="button"
        class="btn small ghost grow"
        onclick={() => markWentOut(p.id)}
        disabled={went}
      >
        👑 {p.name} went out (0 cards left)
      </button>
    </div>
  {/each}
</div>

<style>
  .hint {
    font-size: 0.85rem;
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
  /* A clean, zero-penalty hand is the round's own small win — semantic green,
     never Crown Gold (reserved for the game's overall leader/winner). */
  .prow.went-out {
    border-color: color-mix(in srgb, var(--good) 55%, var(--border));
    background: color-mix(in srgb, var(--good) 8%, var(--surface-2));
  }
  .pname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preview-wrap {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex: none;
  }
  .preview {
    font-weight: 800;
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
  }
  .outcome {
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--muted);
    text-align: right;
    white-space: nowrap;
  }
  .steppers {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .stepper-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field-label {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--muted);
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
