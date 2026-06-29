<script lang="ts">
  import { autoSyncStatus } from '../storage/autosync';
  import { settings } from '../stores/settings';
  import { pathStore, parseRoute, link } from '../router';
  import { relativeTime } from '../util';

  const status = $derived($autoSyncStatus);
  // The bubble represents auto-sync: only show it once the user has connected
  // OneDrive AND left auto-sync on. The Settings page already has the detailed
  // indicator, so stay out of the way there.
  const route = $derived(parseRoute($pathStore));
  const visible = $derived(
    $settings.oneDriveConnected && $settings.autoSync && route.name !== 'settings',
  );

  const tone = $derived(
    status === 'syncing'
      ? 'busy'
      : status === 'pending' || status === 'error'
        ? 'warn'
        : status === 'offline'
          ? 'off'
          : $settings.lastSync
            ? 'ok'
            : 'idle',
  );

  const label = $derived(
    status === 'syncing'
      ? 'Syncing…'
      : status === 'pending'
        ? 'Sync pending'
        : status === 'offline'
          ? 'Offline'
          : status === 'error'
            ? 'Sync failed — retrying'
            : $settings.lastSync
              ? 'Backed up · ' + relativeTime($settings.lastSync)
              : 'Not backed up yet',
  );

  const fullLabel = $derived(
    status === 'pending'
      ? 'Sync pending — reconnect to OneDrive'
      : status === 'offline'
        ? 'Offline — changes will back up when you reconnect'
        : label,
  );

  // --- progress + post-sync "sticky" label, driven only by `status` ---
  let showProgress = $state(false); // reactive: drives the bar in the template
  let progress = $state(0); // 0..1
  let stickySynced = $state(false); // keep "Backed up" visible briefly after a sync
  // Plain (non-reactive) mirror so the effect can branch on it without
  // subscribing to it — the effect must depend on `status` alone.
  let barShown = false;

  // Expanded = show the text label; collapsed = just the coloured dot.
  const expanded = $derived(
    status === 'syncing' ||
      status === 'pending' ||
      status === 'offline' ||
      status === 'error' ||
      stickySynced,
  );

  $effect(() => {
    const s = status;

    if (s === 'syncing') {
      // Fresh upload: clear any leftover bar so the ">1s" rule applies per-sync.
      showProgress = false;
      progress = 0;
      barShown = false;
      // Only reveal the progress bar if the upload is genuinely slow (>1s).
      const slow = setTimeout(() => {
        barShown = true;
        showProgress = true;
        progress = 0.08;
      }, 1000);
      const tick = setInterval(() => {
        // Ease toward a cap; we have no real byte-progress from Graph, so this
        // is a bounded, reassuring approximation that completes on success.
        if (barShown) progress = Math.min(0.92, progress + (0.92 - progress) * 0.16);
      }, 200);
      return () => {
        clearTimeout(slow);
        clearInterval(tick);
      };
    }

    // Left the syncing state.
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (barShown) {
      if (s === 'synced') {
        progress = 1; // snap to full, then fade the bar out
        timers.push(
          setTimeout(() => {
            showProgress = false;
            progress = 0;
            barShown = false;
          }, 450),
        );
      } else {
        showProgress = false;
        progress = 0;
        barShown = false;
      }
    }
    if (s === 'synced') {
      stickySynced = true;
      timers.push(setTimeout(() => (stickySynced = false), 2500));
    } else {
      stickySynced = false;
    }
    return () => timers.forEach((t) => clearTimeout(t));
  });
</script>

{#if visible}
  <a
    class="syncbubble {tone}"
    class:expanded
    href="/settings"
    use:link
    title={fullLabel}
    aria-label={'Backup status: ' + fullLabel}
  >
    <span class="sb-dot" class:spin={status === 'syncing'}></span>
    {#if expanded}<span class="sb-text">{label}</span>{/if}
    {#if showProgress}
      <span class="sb-progress" aria-hidden="true">
        <span class="sb-bar" style="width: {Math.round(progress * 100)}%"></span>
      </span>
    {/if}
  </a>
{/if}

<style>
  .syncbubble {
    position: fixed;
    right: 14px;
    bottom: calc(86px + env(safe-area-inset-bottom));
    z-index: 40;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: min(72vw, 280px);
    padding: 7px 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 90%, transparent);
    backdrop-filter: blur(8px);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1;
    text-decoration: none;
    overflow: hidden;
    transition:
      padding 0.15s ease,
      background 0.15s ease;
  }
  .syncbubble:hover {
    text-decoration: none;
    background: var(--surface);
  }
  .syncbubble:not(.expanded) {
    padding: 8px;
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

  .sb-dot {
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sb-progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: color-mix(in srgb, var(--tone) 16%, transparent);
  }
  .sb-bar {
    display: block;
    height: 100%;
    width: 0;
    background: var(--tone);
    transition: width 0.2s ease;
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
    .sb-bar {
      transition: none;
    }
  }
</style>
