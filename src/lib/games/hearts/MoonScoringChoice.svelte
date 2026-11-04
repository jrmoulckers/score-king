<script lang="ts">
  import type { RoundContext } from '../../types';
  import { haptic } from '../../haptics';
  import { moonPoints, shooter, type HeartsInput, type MoonRule } from './logic';

  const {
    input = $bindable(),
    ctx,
    saveArea = false,
    editing = false,
  }: {
    input: HeartsInput;
    ctx: RoundContext;
    saveArea?: boolean;
    editing?: boolean;
  } = $props();

  const moon = $derived(shooter(input, ctx.config));
  const moonName = $derived(ctx.players.find((player) => player.id === moon)?.name ?? '');
  const value = $derived(moonPoints(ctx.config));

  function choose(rule: MoonRule) {
    input.moonRule = rule;
    haptic('tick');
  }
</script>

{#if moon}
  <div class="moon-scoring" class:save-area={saveArea}>
    <p class="hint">Choose how to score the moon.</p>
    <div
      class="moon-choice row wrap"
      role="group"
      aria-label={saveArea ? 'Moon scoring before saving' : 'How this moon scores'}
    >
      <button
        type="button"
        class="btn small ghost"
        aria-pressed={input.moonRule === 'add26'}
        onclick={() => choose('add26')}>Everyone else +{value}</button
      >
      <button
        type="button"
        class="btn small ghost"
        aria-pressed={input.moonRule === 'subtract'}
        onclick={() => choose('subtract')}>{moonName} takes −{value}</button
      >
    </div>
    {#if saveArea}
      <p class="muted hint">{editing ? 'Changes not saved yet.' : 'Round not saved yet.'}</p>
    {/if}
  </div>
{/if}

<style>
  .moon-scoring {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hint {
    margin: 0;
    font-size: 0.9rem;
  }
  .moon-choice {
    gap: 8px;
  }
  .moon-choice .btn {
    min-height: 46px;
  }
  .moon-choice .btn[aria-pressed='true'] {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    font-weight: 700;
  }
  .save-area {
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
</style>
