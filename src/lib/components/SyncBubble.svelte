<script lang="ts">
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { autoSyncStatus } from '../storage/autosync';
  import { settings } from '../stores/settings';
  import { navigate } from '../router';
  import { relativeTime } from '../util';

  const status = $derived($autoSyncStatus);
  // Persistent header indicator: shown once OneDrive is connected and auto-sync
  // is on. Tapping it takes you to the connection page (Settings).
  const visible = $derived($settings.oneDriveConnected && $settings.autoSync);

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

  // Short label for the compact header pill.
  const label = $derived(
    status === 'syncing'
      ? 'Syncing…'
      : status === 'synced'
        ? 'Synced!'
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
        // Ease toward a cap — no real byte-progress from Graph, so this is a
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
      const t = setTimeout(() => (stickySynced = false), 2200);
      return () => clearTimeout(t);
    }
    stickySynced = false;
  });

  // --- playful click: pop, then navigate to the connection page ---
  let popping = $state(false);
  let navTimer: ReturnType<typeof setTimeout> | undefined;
  function onClick(e: MouseEvent) {
    e.preventDefault();
    if (popping) return;
    popping = true;
    clearTimeout(navTimer);
    navTimer = setTimeout(() => {
      popping = false;
      navigate('/settings');
    }, 300);
  }
</script>

{#if visible}
  <a
    class="syncbubble {tone}"
    class:expanded
    class:pop={popping}
    class:celebrate={stickySynced}
    href="/settings"
    onclick={onClick}
    title={fullLabel}
    aria-label={'Backup status: ' + fullLabel}
    transition:scale={{ duration: 260, start: 0.5, opacity: 0, easing: backOut }}
  >
    {#if showFill}
      <span class="sb-fill" style="width: {Math.round(progress * 100)}%" aria-hidden="true"></span>
    {/if}
    <span class="sb-dot" class:spin={status === 'syncing'}></span>
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
      background 0.18s ease,
      transform 0.12s ease;
  }
  .syncbubble:hover {
    text-decoration: none;
    background: var(--surface-3);
  }
  .syncbubble:active {
    transform: scale(0.94);
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
  .syncbubble.celebrate .sb-dot {
    animation: sb-bounce 0.5s ease;
  }
  .syncbubble.pop {
    animation: sb-pop 0.3s ease;
  }

  @keyframes sb-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes sb-bounce {
    0% {
      transform: scale(0.4);
    }
    55% {
      transform: scale(1.35);
    }
    100% {
      transform: scale(1);
    }
  }
  @keyframes sb-pop {
    0% {
      transform: scale(1) rotate(0);
    }
    35% {
      transform: scale(1.16) rotate(-5deg);
    }
    70% {
      transform: scale(0.95) rotate(4deg);
    }
    100% {
      transform: scale(1) rotate(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sb-dot.spin {
      animation: none;
    }
    .sb-fill {
      transition: none;
    }
    .syncbubble.pop,
    .syncbubble.celebrate .sb-dot {
      animation: none;
    }
  }
</style>
