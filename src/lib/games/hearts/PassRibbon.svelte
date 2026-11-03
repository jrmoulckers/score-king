<script lang="ts">
  import type { PassInfo, PassProgress } from './logic';

  const { info, progress }: { info: PassInfo; progress: PassProgress | null } = $props();
</script>

<div class="pass" class:hold={info.direction === 'hold'}>
  <div class="label">
    <span class="direction" aria-hidden="true">{info.glyph}</span>
    <span>{info.label}</span>
  </div>
  <span class="hint">{info.hint}</span>
  {#if progress}
    <span class="progress">
      Passing cycle {progress.cycle} · Deal {progress.deal} of {progress.cycleLength} (includes Hold)
    </span>
  {/if}
</div>

<style>
  .pass {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .direction {
    flex: none;
    font-size: 1.15rem;
    line-height: 1;
  }
  .pass.hold .direction {
    color: var(--muted);
  }
  .label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .progress {
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .hint {
    font-size: 0.76rem;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
</style>
