<script lang="ts">
  import { clamp } from '../util';
  import { haptic } from '../haptics';
  import { animateMotion } from '../motion';

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
    const next = clamp((Number(value) || 0) - step, min, max);
    if (next !== value) haptic('tick');
    value = next;
  }
  function inc() {
    const next = clamp((Number(value) || 0) + step, min, max);
    if (next !== value) haptic('tick');
    value = next;
  }
  // Keyboard users can type straight into the field; clamp on change so a typed
  // value can't slip past the bounds the − / + buttons enforce.
  function clampTyped() {
    if (value == null || Number.isNaN(Number(value))) return;
    value = clamp(Number(value), min, max);
  }

  // A one-frame "bump" retriggered whenever the value changes, so the number
  // gives a tiny tactile-looking nudge under the thumb. Driven through
  // animateMotion so it retriggers reliably and auto-skips under reduced motion.
  let inputEl: HTMLInputElement | undefined = $state();
  let firstRun = true;
  $effect(() => {
    void value;
    if (firstRun) {
      firstRun = false;
      return;
    }
    if (inputEl) animateMotion(inputEl, { scale: [1, 1.12, 1] }, { duration: 0.14, ease: 'easeOut' });
  });
</script>

<div class="stepper">
  <button type="button" class="iconbtn step-btn" onclick={dec} disabled={value <= min} aria-label={decLabel}>
    −
  </button>
  <input
    type="number"
    bind:value
    bind:this={inputEl}
    {min}
    {max}
    {step}
    inputmode="numeric"
    aria-label={fieldLabel}
    onchange={clampTyped}
  />
  <button type="button" class="iconbtn step-btn" onclick={inc} disabled={value >= max} aria-label={incLabel}>
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
  /* Press feedback on the ± buttons: a subtle scale-in so the signature control
     feels physical under the thumb (hover doesn't exist on the target phone). */
  .step-btn {
    transition: transform var(--dur-press) var(--ease-standard), background var(--dur-base) var(--ease-standard);
  }
  .step-btn:active {
    transform: scale(0.92);
  }
</style>
