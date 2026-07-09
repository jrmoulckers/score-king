<script lang="ts">
  /**
   * The "Share results" sheet for a finished game. One read-only recap, four ways to hand it
   * off: a scannable QR, a copyable link, copyable text, and a rendered image card for group
   * chats. Everything is encoded in the link's fragment, so nothing about the game is ever sent
   * to a server. Reuses the live "Play together" sheet chrome so sharing feels native to the app.
   */
  import { onMount } from 'svelte';
  import type { Player } from '../types';
  import { showToast } from '../stores/toast';
  import {
    recapView,
    encodeRecap,
    recapShareUrl,
    recapText,
    type RecapPayload,
    type RecapView,
  } from '../share/recap';
  import Scoreboard from './Scoreboard.svelte';
  import { focusTrap } from '../a11y/focusTrap';

  let { payload, onclose }: { payload: RecapPayload; onclose: () => void } = $props();

  const view: RecapView = $derived(recapView(payload));
  const previewPlayers: Player[] = $derived(
    view.players.map((p) => ({ id: p.id, name: p.name, color: p.color, createdAt: 0 })),
  );
  const winnerNames = $derived(
    view.winners
      .map((id) => view.players.find((p) => p.id === id)?.name ?? '?')
      .join(' & '),
  );

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  let url = $state('');
  let qr = $state('');
  let building = $state(true);
  let imageBusy = $state(false);

  // Encode the recap into a shareable URL (async: deflate + base64url), then render its QR.
  $effect(() => {
    const p = payload;
    let alive = true;
    building = true;
    url = '';
    qr = '';
    (async () => {
      try {
        const wire = await encodeRecap(p);
        const link = recapShareUrl(wire);
        if (!alive) return;
        url = link;
        building = false;
        const { default: QRCode } = await import('qrcode');
        const dataUrl = await QRCode.toDataURL(link, {
          margin: 1,
          width: 260,
          errorCorrectionLevel: 'L',
        });
        if (alive) qr = dataUrl;
      } catch {
        if (alive) {
          building = false;
          showToast('Couldn’t prepare the share link on this device.');
        }
      }
    })();
    return () => {
      alive = false;
    };
  });

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
    } catch {
      showToast('Couldn’t copy the link');
    }
  }

  async function copyText() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(recapText(view, url));
      showToast('Results copied');
    } catch {
      showToast('Couldn’t copy the results');
    }
  }

  async function shareLink() {
    if (!url) return;
    try {
      await navigator.share({
        title: 'Game results',
        text: recapText(view, url),
        url,
      });
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }

  async function shareImage() {
    if (imageBusy) return;
    imageBusy = true;
    try {
      const { renderRecapCard, recapCardFileName } = await import('../share/card');
      const blob = await renderRecapCard(view);
      const file = new File([blob], recapCardFileName(view), { type: 'image/png' });
      const canShareFiles =
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] });
      if (canShareFiles) {
        try {
          await navigator.share({ files: [file], text: winnerNames ? `🏆 ${winnerNames}` : undefined });
        } catch {
          /* dismissed */
        }
      } else {
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(href);
        showToast('Image saved');
      }
    } catch {
      showToast('Couldn’t create the image on this device.');
    } finally {
      imageBusy = false;
    }
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

<div class="sheet" role="dialog" aria-modal="true" aria-label="Share results" tabindex="-1" bind:this={sheet} use:focusTrap>
  <div class="grabber" aria-hidden="true"></div>

  <div class="row spread">
    <strong style="font-size: 1.05rem">Share results</strong>
    <span class="pill">{view.emoji} {view.title}</span>
  </div>

  {#if winnerNames}
    <div class="hero">🏆 {winnerNames} {view.winners.length > 1 ? 'tie!' : 'wins!'}</div>
  {/if}

  <div class="board">
    <Scoreboard players={previewPlayers} totals={view.totals} lowerIsBetter={view.lowerIsBetter} winners={view.winners} />
  </div>

  <div class="qrwrap">
    {#if qr}
      <div class="qr"><img src={qr} alt="QR code linking to these results" width="200" height="200" /></div>
      <span class="qrhint">Scan to view these results</span>
    {:else}
      <div class="qr placeholder" aria-hidden="true"></div>
      <span class="qrhint">{building ? 'Preparing a shareable link…' : 'Link ready below'}</span>
    {/if}
  </div>

  <button class="btn primary block" onclick={shareImage} disabled={imageBusy}>
    {imageBusy ? 'Making image…' : '🖼️ Share image'}
  </button>

  <div class="row" style="gap: 10px">
    <button class="btn grow" onclick={copyLink} disabled={!url}>🔗 Copy link</button>
    <button class="btn grow" onclick={copyText} disabled={!url}>📋 Copy text</button>
  </div>

  {#if canNativeShare}
    <button class="btn block" onclick={shareLink} disabled={!url}>Share link…</button>
  {/if}

  <p class="note">Read-only — this shares just this game’s final scores, nothing else from your device.</p>

  <button class="btn ghost block" onclick={onclose}>Done</button>
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
    max-height: 88vh;
    overflow-y: auto;
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
  .hero {
    text-align: center;
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--accent-ink);
  }
  .board {
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
    padding: 6px 12px;
  }
  .qrwrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .qr img {
    /* A white quiet zone is required for reliable scanning, so the QR keeps a light card in
       both themes — the same deliberate, function-first exception the live share sheet uses. */
    width: 200px;
    height: 200px;
    padding: 10px;
    border-radius: var(--radius-sm);
    background: #fff;
    box-shadow: var(--shadow);
  }
  .qr.placeholder {
    width: 220px;
    height: 220px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .qrhint {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .note {
    margin: 0;
    font-size: 0.82rem;
    color: var(--muted);
    line-height: 1.45;
    text-align: center;
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
