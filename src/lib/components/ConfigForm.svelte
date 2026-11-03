<script lang="ts">
  import type { ConfigField } from '../types';

  let { fields, config = $bindable() }: { fields: ConfigField[]; config: Record<string, any> } =
    $props();
  const formId = $props.id();

  // Only fields whose condition holds for the current draft show at all — irrelevant
  // knobs (e.g. blinds when we're only tracking buy-ins) simply aren't there.
  const visible = $derived(fields.filter((f) => (f.showIf ? f.showIf(config) : true)));
  const basic = $derived(visible.filter((f) => !f.advanced));
  const advanced = $derived(visible.filter((f) => f.advanced));
</script>

{#snippet field(f: ConfigField)}
  {@const rules = f.rulesSummary?.(config) ?? []}
  {@const descriptionId = f.help || rules.length ? `${formId}-${f.key}-description` : undefined}
  <div>
    {#if f.type === 'boolean'}
      <label class="row" style="gap: 10px; cursor: pointer">
        <input
          type="checkbox"
          bind:checked={config[f.key]}
          aria-describedby={descriptionId}
          style="width: auto; min-height: 0"
        />
        <span>{f.label}</span>
      </label>
    {:else if f.type === 'select'}
      <label for={f.key}>{f.label}</label>
      <select id={f.key} bind:value={config[f.key]} aria-describedby={descriptionId}>
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
        aria-describedby={descriptionId}
      />
    {/if}
    {#if descriptionId}
      <div id={descriptionId} class="muted field-description">
        {#if rules.length}
          <ul class="rules-summary" aria-label={`${f.label} rules`} role="list">
            {#each rules as rule, index (index)}
              <li>
                {#if index > 0}<span aria-hidden="true"> · </span>{/if}<span>{rule}</span>
              </li>
            {/each}
          </ul>
        {/if}
        {#if f.help}<div>{f.help}</div>{/if}
      </div>
    {/if}
  </div>
{/snippet}

<div class="stack">
  {#each basic as f (f.key)}
    {@render field(f)}
  {/each}

  {#if advanced.length}
    <details class="advanced">
      <summary>
        <svg
          class="chev"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="m6 4 4 4-4 4" />
        </svg>
        Advanced options
        <span class="count">{advanced.length}</span>
      </summary>
      <div class="stack adv-body">
        {#each advanced as f (f.key)}
          {@render field(f)}
        {/each}
      </div>
    </details>
  {/if}
</div>

<style>
  .field-description {
    font-size: 0.8rem;
    margin-top: 4px;
  }
  .rules-summary {
    padding: 0;
    margin: 0;
    list-style: none;
    font-variant-numeric: tabular-nums;
  }
  .rules-summary li {
    display: inline;
  }
  /* A quiet disclosure that keeps rarely-touched knobs out of the way until asked for.
     No new violet fill, no gold — it climbs the surface ramp, matching the setup card. */
  .advanced {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .advanced > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 0 12px;
    cursor: pointer;
    font-weight: 600;
    color: var(--text);
    list-style: none;
    user-select: none;
  }
  .advanced > summary::-webkit-details-marker {
    display: none;
  }
  .chev {
    display: block;
    flex: none;
    color: var(--muted);
    transition: transform var(--dur-base, 0.2s) var(--ease-standard, ease);
  }
  .advanced[open] > summary .chev {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
  .count {
    margin-left: auto;
    min-width: 22px;
    height: 22px;
    padding: 0 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill, 999px);
    background: var(--surface-3);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .advanced > summary:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
    border-radius: var(--radius-sm);
  }
  .adv-body {
    padding: 0 12px 12px;
  }
</style>
