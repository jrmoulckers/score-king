<script lang="ts">
  import { initials, resolvePlayerColor, textOn } from '../util';
  import { settings } from '../stores/settings';
  let {
    name,
    color,
    size = 28,
  }: { name: string; color: string; size?: number } = $props();

  const resolved = $derived(resolvePlayerColor(color, $settings.colorBlind));
  const ink = $derived(textOn(resolved));
</script>

<span
  class="avatar"
  style="--c:{resolved}; --ink:{ink}; width:{size}px; height:{size}px; font-size:{Math.round(size * 0.38)}px"
  title={name}
>
  {initials(name)}
</span>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--c);
    color: var(--ink);
    font-weight: 700;
    flex: none;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
  }
</style>
