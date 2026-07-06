<script lang="ts">
  let {
    value = $bindable(0),
    min = -Infinity,
    max = Infinity,
    step = 1,
  }: { value: number; min?: number; max?: number; step?: number } = $props();

  function dec() {
    value = Math.max(min, (Number(value) || 0) - step);
  }
  function inc() {
    value = Math.min(max, (Number(value) || 0) + step);
  }
</script>

<div class="stepper">
  <button type="button" class="iconbtn" onclick={dec} disabled={value <= min} aria-label="decrease">
    −
  </button>
  <input type="number" bind:value {min} {max} {step} inputmode="numeric" />
  <button type="button" class="iconbtn" onclick={inc} disabled={value >= max} aria-label="increase">
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
