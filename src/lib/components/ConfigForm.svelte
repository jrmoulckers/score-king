<script lang="ts">
  import type { ConfigField } from '../types';

  let {
    fields,
    config = $bindable(),
  }: { fields: ConfigField[]; config: Record<string, any> } = $props();
</script>

<div class="stack">
  {#each fields as f (f.key)}
    <div>
      {#if f.type === 'boolean'}
        <label class="row" style="gap: 10px; cursor: pointer">
          <input type="checkbox" bind:checked={config[f.key]} style="width: auto; min-height: 0" />
          <span>{f.label}</span>
        </label>
      {:else if f.type === 'select'}
        <label for={f.key}>{f.label}</label>
        <select id={f.key} bind:value={config[f.key]}>
          {#each f.options as o (o.value)}
            <option value={o.value}>{o.label}</option>
          {/each}
        </select>
      {:else}
        <label for={f.key}>{f.label}</label>
        <input
          id={f.key}
          type="number"
          bind:value={config[f.key]}
          min={f.min}
          max={f.max}
          step={f.step ?? 1}
        />
      {/if}
      {#if f.help}
        <div class="muted" style="font-size: 0.8rem; margin-top: 4px">{f.help}</div>
      {/if}
    </div>
  {/each}
</div>
