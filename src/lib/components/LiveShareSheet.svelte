<script lang="ts">
  import { onMount } from 'svelte';
  import { showToast } from '../stores/toast';

  let {
    code,
    link,
    count,
    remote = false,
    onclose,
    onend,
  }: {
    code: string;
    link: string;
    count: number;
    /** True when the session runs over the relay — i.e. the link genuinely works cross-device. */
    remote?: boolean;
    onclose: () => void;
    onend: () => void;
  } = $props();

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // A scannable QR only when a relay makes the link reachable from another device; showing one
  // for a same-browser BroadcastChannel session would be a lie (a scanning phone can't join).
  let qr = $state('');
  $effect(() => {
    const target = link;
    if (!remote || !target) {
      qr = '';
      return;
    }
    let alive = true;
    // Lazy-load qrcode only when a host actually needs a scannable code — keeps it out of the
    // core bundle (like the OneDrive chunk), since most sessions never open this sheet.
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(target, { margin: 1, width: 240, errorCorrectionLevel: 'M' }),
      )
      .then((url) => {
        if (alive) qr = url;
      })
      .catch(() => {
        if (alive) qr = '';
      });
    return () => {
      alive = false;
    };
  });

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copied`);
    } catch {
      showToast(`Couldn’t copy — it’s ${text}`);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Join my game', text: `Join code ${code}`, url: link });
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }

  function openPlayerTab() {
    window.open(link, '_blank', 'noopener');
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  let sheet = $state<HTMLDivElement | null>(null);
  onMount(() => sheet?.focus());
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="backdrop"
  role="button"
  tabindex="-1"
  aria-label="Close"
  onclick={onclose}
  onkeydown={(e) => e.key === 'Enter' && onclose()}
></div>

<div
  class="sheet"
  role="dialog"
  aria-modal="true"
  aria-label="Play together"
  tabindex="-1"
  bind:this={sheet}
>
  <div class="grabber" aria-hidden="true"></div>

  <div class="row spread">
    <strong style="font-size: 1.05rem">Play together</strong>
    <span class="live"><span class="dot" aria-hidden="true"></span>Live · {count}</span>
  </div>

  <div class="codebox">
    <span class="codelabel">Join code</span>
    <span class="code">{code}</span>
  </div>

  {#if remote && qr}
    <div class="qr">
      <img src={qr} alt="QR code to join the game" width="150" height="150" />
      <span class="qrhint">Scan to join</span>
    </div>
  {/if}

  <button class="btn {canNativeShare ? '' : 'primary'} block" onclick={() => copy(link, 'Link')}>
    🔗 Copy link
  </button>
  {#if canNativeShare}
    <button class="btn primary block" onclick={share}>Share…</button>
  {/if}
  <div class="row" style="gap: 10px">
    <button class="btn grow" onclick={() => copy(code, 'Code')}>Copy code</button>
    <button class="btn grow" onclick={openPlayerTab}>Open a player tab</button>
  </div>

  {#if remote}
    <p class="note">
      Scan the code or share the link — anyone can join from their own device, wherever they are.
    </p>
  {:else}
    <p class="note">
      Others on this browser can join right now — open the link in another tab or window.
      Joining from a different device turns on once a relay is configured.
    </p>
  {/if}

  <button class="btn danger block" onclick={onend}>End live game</button>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    border: 0;
    width: 100%;
    cursor: pointer;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    animation: fade 0.16s ease-out;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 61;
    margin: 0 auto;
    max-width: var(--maxw);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px calc(20px + env(safe-area-inset-bottom));
    background: var(--surface);
    border: 1px solid var(--border);
    border-bottom: 0;
    border-radius: var(--radius) var(--radius) 0 0;
    box-shadow: var(--shadow);
    animation: rise 0.2s ease-out;
  }
  .sheet:focus {
    outline: none;
  }
  .grabber {
    align-self: center;
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: var(--surface-3);
    margin-bottom: 2px;
  }
  .live {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 0.85rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--good);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--good) 22%, transparent);
  }
  .codebox {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 16px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .codelabel {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .code {
    font-size: 2.1rem;
    font-weight: 800;
    letter-spacing: 0.32em;
    /* trailing letter-spacing pads the right; nudge back to keep it centered */
    text-indent: 0.32em;
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.45;
  }
  .qr {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .qr img {
    /* A white quiet zone is required for reliable scanning, so the QR keeps a light card
       in both themes — a deliberate exception to the surface ramp, for function. */
    width: 150px;
    height: 150px;
    padding: 10px;
    border-radius: var(--radius-sm);
    background: #fff;
    box-shadow: var(--shadow);
  }
  .qrhint {
    font-size: 0.8rem;
    color: var(--muted);
  }
  @keyframes rise {
    from {
      transform: translateY(12px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .backdrop {
      animation: none;
    }
  }
</style>
