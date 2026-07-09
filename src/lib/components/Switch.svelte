<script lang="ts">
  // A themed on/off switch. It renders a native checkbox with role="switch" so
  // assistive tech announces "on/off" instead of "checked/unchecked"; the
  // accessible name comes from the surrounding <label> row (or the `label` prop
  // when used without one). Controlled: the parent owns the value via `checked`
  // and reacts to `onchange`.
  let {
    checked = false,
    disabled = false,
    label = '',
    onchange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    label?: string;
    onchange?: (value: boolean) => void;
  } = $props();
</script>

<span class="switch">
  <input
    type="checkbox"
    role="switch"
    {checked}
    {disabled}
    aria-label={label || undefined}
    onchange={(e) => onchange?.(e.currentTarget.checked)}
  />
  <span class="track"><span class="thumb"></span></span>
</span>

<style>
  .switch {
    position: relative;
    display: inline-flex;
    flex: none;
  }
  .switch input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .switch input:disabled {
    cursor: not-allowed;
  }
  .track {
    width: 46px;
    height: 26px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    display: inline-flex;
    align-items: center;
    padding: 2px;
    transition: background 0.15s ease;
  }
  .thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s ease;
  }
  .switch input:checked + .track {
    background: var(--primary);
    border-color: var(--primary);
  }
  .switch input:checked + .track .thumb {
    transform: translateX(20px);
  }
  .switch input:focus-visible + .track {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
</style>
