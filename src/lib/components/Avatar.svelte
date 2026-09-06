<script lang="ts">
  import { initials, resolvePlayerColor, textOn } from '../util';
  import { settings } from '../stores/settings';
  import { players } from '../stores/players';
  import { sanitizePlayerAppearance } from '../profile';
  import type { ID, PlayerAppearance } from '../types';

  const {
    name,
    color,
    playerId,
    appearance,
    size = 28,
    decorative = false,
  }: {
    name: string;
    color: string;
    playerId?: ID;
    appearance?: PlayerAppearance;
    size?: number;
    decorative?: boolean;
  } = $props();

  const resolved = $derived(resolvePlayerColor(color, $settings.colorBlind));
  const storedAppearance = $derived.by(() => {
    if (appearance) return appearance;
    if (playerId) return $players.find((player) => player.id === playerId)?.appearance;
    const matches = $players.filter((player) => player.name === name && player.color === color);
    return matches.length === 1 ? matches[0].appearance : undefined;
  });
  const profile = $derived(sanitizePlayerAppearance(storedAppearance));
  const style = $derived(profile?.style ?? 'solid');
  const resolved2 = $derived(resolvePlayerColor(profile?.color2 ?? color, $settings.colorBlind));
  const imageSource = $derived(style === 'image' ? profile?.image : undefined);
  const ink = $derived(textOn(resolved));
  let imageFailed = $state(false);

  $effect(() => {
    imageSource;
    imageFailed = false;
  });
</script>

<span
  class="avatar"
  class:gradient={style === 'gradient'}
  class:tie-dye={style === 'tie-dye'}
  class:photo={Boolean(imageSource && !imageFailed)}
  style="--c:{resolved}; --c2:{resolved2}; --ink:{ink}; width:{size}px; height:{size}px; font-size:{Math.round(
    size * 0.38,
  )}px"
  title={decorative ? undefined : name}
  role={decorative ? undefined : 'img'}
  aria-label={decorative ? undefined : name}
  aria-hidden={decorative ? 'true' : undefined}
>
  {#if imageSource && !imageFailed}
    <img src={imageSource} alt="" onerror={() => (imageFailed = true)} />
  {:else}
    <span class="initials">{initials(name)}</span>
  {/if}
  {#if profile?.emoji && size >= 20}
    <span class="emoji-badge" aria-hidden="true">{profile.emoji}</span>
  {/if}
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
    position: relative;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bg) 55%, transparent);
  }
  .avatar.gradient {
    background: linear-gradient(135deg, var(--c) 8%, var(--c2) 92%);
  }
  .avatar.tie-dye {
    background:
      radial-gradient(circle at 18% 22%, var(--c2) 0 12%, transparent 13% 30%),
      radial-gradient(
        circle at 78% 20%,
        color-mix(in srgb, var(--c) 48%, var(--c2)) 0 14%,
        transparent 15% 34%
      ),
      radial-gradient(circle at 72% 82%, var(--c2) 0 13%, transparent 14% 34%),
      radial-gradient(
        circle at 20% 78%,
        color-mix(in srgb, var(--c) 70%, white) 0 10%,
        transparent 11% 30%
      ),
      var(--c);
  }
  .avatar img {
    width: 100%;
    height: 100%;
    border-radius: inherit;
    object-fit: cover;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bg) 55%, transparent);
  }
  .initials {
    display: grid;
    place-items: center;
    width: 72%;
    height: 72%;
    border-radius: 50%;
    background: var(--c);
    line-height: 1;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 16%, transparent);
  }
  .emoji-badge {
    position: absolute;
    right: -12%;
    bottom: -10%;
    display: grid;
    place-items: center;
    width: 48%;
    height: 48%;
    min-width: 10px;
    min-height: 10px;
    border: max(1px, 0.05em) solid var(--surface, #fff);
    border-radius: 50%;
    background: var(--surface, #fff);
    font-size: 0.68em;
    line-height: 1;
    box-shadow: 0 2px 5px color-mix(in srgb, var(--bg) 65%, transparent);
  }
</style>
