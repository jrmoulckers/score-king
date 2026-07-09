<script lang="ts">
  type Option = { value: string; label: string };

  let {
    label,
    value = $bindable(),
    options,
  }: { label: string; value: string; options: Option[] } = $props();

  let groupEl: HTMLDivElement;

  function move(to: number) {
    const next = (to + options.length) % options.length;
    value = options[next].value;
    const btns = groupEl?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    btns?.[next]?.focus();
  }

  function onKeydown(e: KeyboardEvent) {
    const idx = options.findIndex((o) => o.value === value);
    if (idx < 0) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        move(idx + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        move(idx - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(options.length - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
  }
</script>

<div
  class="segmented"
  role="radiogroup"
  aria-label={label}
  tabindex="-1"
  bind:this={groupEl}
  onkeydown={onKeydown}
>
  {#each options as o (o.value)}
    <button
      type="button"
      role="radio"
      aria-checked={value === o.value}
      tabindex={value === o.value ? 0 : -1}
      class="seg"
      class:on={value === o.value}
      onclick={() => (value = o.value)}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .seg {
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
    transition: background var(--dur-base) var(--ease-standard), color var(--dur-base) var(--ease-standard), transform var(--dur-press) var(--ease-standard);
  }
  .seg:hover {
    color: var(--text);
  }
  .seg:active {
    transform: translateY(1px);
  }
  .seg.on {
    background: var(--primary);
    color: #fff;
  }
  .seg:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
</style>
