<script lang="ts">
  import { scale } from 'svelte/transition';
  import { autoSyncStatus } from '../storage/autosync';
  import { settings } from '../stores/settings';
  import { navigate } from '../router';
  import { animateMotion } from '../motion';
  import { relativeTime } from '../util';

  const status = $derived($autoSyncStatus);
  // Persistent header indicator: shown once OneDrive is connected and auto-sync
  // is on. Tapping it takes you to the connection page (Settings).
  const visible = $derived($settings.oneDriveConnected && $settings.autoSync);

  const tone = $derived(
    status === 'syncing'
      ? 'busy'
      : status === 'pending' || status === 'error' || status === 'conflict'
        ? 'warn'
        : status === 'offline'
          ? 'off'
          : $settings.lastSync
            ? 'ok'
            : 'idle',
  );

  // Short label for the compact header pill.
  const label = $derived(
    status === 'syncing'
      ? 'Syncing…'
      : status === 'synced'
        ? 'Synced!'
        : status === 'conflict'
          ? 'Conflict'
          : status === 'pending'
            ? 'Pending'
            : status === 'offline'
              ? 'Offline'
              : status === 'error'
                ? 'Retrying…'
                : $settings.lastSync
                  ? 'Backed up'
                  : 'Not backed up',
  );

  // Full description for the tooltip / screen readers.
  const fullLabel = $derived(
    status === 'syncing'
      ? 'Backing up to OneDrive…'
      : status === 'conflict'
        ? 'Backup changed on another device — tap to resolve'
        : status === 'pending'
          ? 'Sync pending — reconnect to OneDrive'
          : status === 'offline'
            ? 'Offline — changes will back up when you reconnect'
            : status === 'error'
              ? 'Sync failed — will retry shortly'
              : $settings.lastSync
                ? 'Backed up · ' + relativeTime($settings.lastSync)
                : 'Not backed up yet',
  );

  // --- progress fill (slow >1s syncs only); never carries into the synced state ---
  let showFill = $state(false);
  let progress = $state(0); // 0..1
  let stickySynced = $state(false); // briefly celebrate a completed sync
  // Plain (non-reactive) mirror so the effect can branch on it without
  // subscribing to it — the effect must depend on `status` alone.
  let barShown = false;

  let dotEl: HTMLSpanElement | undefined = $state();

  const expanded = $derived(
    status === 'syncing' ||
      status === 'pending' ||
      status === 'offline' ||
      status === 'error' ||
      status === 'conflict' ||
      stickySynced,
  );

  $effect(() => {
    const s = status;

    if (s === 'syncing') {
      showFill = false;
      progress = 0;
      barShown = false;
      // Reveal the fill only if the upload is genuinely slow (>1s).
      const slow = setTimeout(() => {
        barShown = true;
        showFill = true;
        progress = 0.1;
      }, 1000);
      const tick = setInterval(() => {
        // Ease toward a cap — Graph gives no byte-progress, so this is a
        // bounded, reassuring approximation.
        if (barShown) progress = Math.min(0.92, progress + (0.92 - progress) * 0.16);
      }, 200);
      return () => {
        clearTimeout(slow);
        clearInterval(tick);
      };
    }

    // Any non-syncing state: drop the fill immediately (no carry-over into "Synced!").
    showFill = false;
    progress = 0;
    barShown = false;

    if (s === 'synced') {
      stickySynced = true;
      // Springy celebration on the green dot.
      if (dotEl) {
        animateMotion(
          dotEl,
          { scale: [0.3, 1.4, 0.9, 1] },
          { duration: 0.5, ease: 'easeOut' },
        );
      }
      const t = setTimeout(() => (stickySynced = false), 2200);
      return () => clearTimeout(t);
    }
    stickySynced = false;
  });

  // Springy entrance (Motion) — runs once when the pill mounts.
  function enter(node: HTMLElement) {
    animateMotion(
      node,
      { opacity: [0, 1], scale: [0.5, 1.08, 1], rotate: [-8, 2, 0] },
      { duration: 0.5, ease: 'easeOut' },
    );
  }

  // --- playful click: pop with a spring, then navigate to the connection page ---
  let popping = $state(false);
  function onClick(e: MouseEvent, node: HTMLElement) {
    e.preventDefault();
    if (popping) return;
    popping = true;
    const controls = animateMotion(
      node,
      { scale: [1, 1.18, 0.92, 1], rotate: [0, -7, 6, 0] },
      { duration: 0.36, ease: 'easeOut' },
    );
    controls.finished.finally(() => {
      popping = false;
      navigate('/settings');
    });
  }
</script>

{#if visible}
  <a
    class="syncbubble {tone}"
    class:expanded
    class:celebrate={stickySynced}
    href="/settings"
    onclick={(e) => onClick(e, e.currentTarget)}
    use:enter
    title={fullLabel}
    aria-label={'Backup status: ' + fullLabel}
    out:scale={{ duration: 200, start: 0.7, opacity: 0 }}
  >
    {#if showFill}
      <span class="sb-fill" style="width: {Math.round(progress * 100)}%" aria-hidden="true"></span>
    {/if}
    <span class="sb-dot" class:spin={status === 'syncing'} bind:this={dotEl}></span>
    {#if expanded}<span class="sb-text">{label}</span>{/if}
  </a>
{/if}

<style>
  .syncbubble {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 168px;
    padding: 6px 11px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface-2) 80%, transparent);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.78rem;
    line-height: 1.15;
    text-decoration: none;
    overflow: hidden;
    transition:
      padding 0.18s ease,
      background 0.18s ease;
  }
  .syncbubble:hover {
    text-decoration: none;
    background: var(--surface-3);
  }
  .syncbubble:not(.expanded) {
    padding: 7px;
  }

  .syncbubble.busy {
    --tone: #f7b955;
  }
  .syncbubble.warn {
    --tone: var(--bad, #f87171);
  }
  .syncbubble.off {
    --tone: var(--muted);
  }
  .syncbubble.ok {
    --tone: #29c785;
  }
  .syncbubble.idle {
    --tone: var(--muted);
  }

  /* Translucent progress fill across the whole bubble (left -> right).
     For a bottom -> top fill instead: set `top: auto; height: <pct>; width: 100%`. */
  .sb-fill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 0;
    background: color-mix(in srgb, #f7b955 34%, transparent);
    transition: width 0.2s ease;
    z-index: 0;
  }

  .sb-dot {
    position: relative;
    z-index: 1;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--tone);
    flex: none;
  }
  .sb-dot.spin {
    width: 12px;
    height: 12px;
    background: none;
    border: 2px solid color-mix(in srgb, var(--tone) 28%, transparent);
    border-top-color: var(--tone);
    animation: sb-spin 0.7s linear infinite;
  }

  .sb-text {
    position: relative;
    z-index: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .syncbubble.celebrate {
    border-color: color-mix(in srgb, #29c785 55%, var(--border));
  }

  @keyframes sb-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sb-dot.spin {
      animation: none;
    }
    .sb-fill {
      transition: none;
    }
  }
</style>
