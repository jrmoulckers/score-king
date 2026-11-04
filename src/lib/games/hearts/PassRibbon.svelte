<script lang="ts">
  import type { PassInfo, PassProgress } from './logic';

  const { info, progress }: { info: PassInfo; progress: PassProgress | null } = $props();
</script>

<div class="pass" class:hold={info.direction === 'hold'}>
  <div class="header">
    <div class="label">
      <span>{info.label}</span>
      <span class="direction" aria-hidden="true">{info.glyph}</span>
    </div>
    {#if progress}
      <span class="progress">
        <span>Cycle {progress.cycle}</span>
        <span>Pass {progress.deal}/{progress.cycleLength}</span>
      </span>
    {/if}
  </div>
  <span class="hint">{info.hint}</span>
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
  .header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 3px 12px;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .progress {
    display: flex;
    flex-direction: column;
    margin-left: auto;
    max-width: 100%;
    text-align: right;
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
