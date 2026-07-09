<script lang="ts">
  let {
    value = $bindable(0),
    min = -Infinity,
    max = Infinity,
    step = 1,
    label = '',
  }: { value: number; min?: number; max?: number; step?: number; label?: string } = $props();

  // A meaningful accessible name for the number field and its buttons. Callers
  // pass the thing being counted (usually a player's name) so a screen reader
  // announces "Decrease Ada" rather than a bare "decrease" with no context.
  const fieldLabel = $derived(label || 'Value');
  const decLabel = $derived(label ? `Decrease ${label}` : 'Decrease');
  const incLabel = $derived(label ? `Increase ${label}` : 'Increase');

  function dec() {
    value = Math.max(min, (Number(value) || 0) - step);
  }
  function inc() {
    value = Math.min(max, (Number(value) || 0) + step);
  }
</script>

<div class="stepper">
  <button type="button" class="iconbtn" onclick={dec} disabled={value <= min} aria-label={decLabel}>
    −
  </button>
  <input type="number" bind:value {min} {max} {step} inputmode="numeric" aria-label={fieldLabel} />
  <button type="button" class="iconbtn" onclick={inc} disabled={value >= max} aria-label={incLabel}>
    +
  </button>
</div>

<style>
  .stepper {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .stepper input {
    width: 62px;
    text-align: center;
    padding-left: 4px;
    padding-right: 4px;
    appearance: textfield;
    -moz-appearance: textfield;
  }
  /* Hide the native number spinner — the − / + buttons are the stepper. */
  .stepper input::-webkit-outer-spin-button,
  .stepper input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    appearance: none;
    margin: 0;
  }
</style>
