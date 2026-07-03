<script lang="ts">
  /**
   * Host-side bottom sheet for nearby (serverless) play. Each guest joins with a hand-carried
   * handshake: the host shows an invite (QR / code), the guest shows their reply back, and the
   * host accepts it — no relay, no internet. Repeat per guest to build the leader-hub star.
   */
  import { onMount } from 'svelte';
  import type { NearbyHostControls } from '../live/session';
  import { liveParticipants } from '../live/session';
  import { showToast } from '../stores/toast';
  import Avatar from './Avatar.svelte';
  import SignalShare from './SignalShare.svelte';
  import QrScanner from './QrScanner.svelte';

  let {
    controls,
    onclose,
    onend,
  }: {
    controls: NearbyHostControls;
    onclose: () => void;
    onend: () => void;
  } = $props();

  type Phase = 'idle' | 'preparing' | 'inviting';
  let phase = $state<Phase>('idle');
  let offer = $state('');
  let busy = $state(false);
  let err = $state('');

  const guests = $derived($liveParticipants);

  async function addPlayer() {
    if (phase !== 'idle') return;
    err = '';
    phase = 'preparing';
    try {
      offer = await controls.createInvite();
      phase = 'inviting';
    } catch {
      phase = 'idle';
      showToast('Couldn’t prepare an invite on this device.');
    }
  }

  async function onReply(text: string) {
    if (busy) return;
    busy = true;
    err = '';
    try {
      await controls.acceptAnswer(text);
      showToast('Reply accepted — connecting…');
      offer = '';
      phase = 'idle';
    } catch (e) {
      err = e instanceof Error ? e.message : 'That reply didn’t work — try scanning it again.';
    } finally {
      busy = false;
    }
  }

  function cancelInvite() {
    controls.cancelInvite();
    offer = '';
    err = '';
    phase = 'idle';
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

<div class="sheet" role="dialog" aria-modal="true" aria-label="Nearby play" tabindex="-1" bind:this={sheet}>
  <div class="grabber" aria-hidden="true"></div>

  <div class="row spread">
    <strong style="font-size: 1.05rem">Nearby play</strong>
    <span class="live"><span class="dot" aria-hidden="true"></span>Live · {guests.length}</span>
  </div>

  {#if phase === 'idle'}
    <p class="note">No internet needed — everyone’s on this network. Add each player by trading codes.</p>

    <div class="players">
      {#each guests as p (p.id)}
        <span class="chip"><Avatar name={p.name} color={p.color} size={22} />{p.name}</span>
      {/each}
    </div>

    <button class="btn primary block" onclick={addPlayer}>➕ Add a player</button>
    <button class="btn danger block" onclick={onend}>End live game</button>
  {:else if phase === 'preparing'}
    <div class="prep">
      <div class="spinner" aria-hidden="true"></div>
      <span class="note">Preparing an invite…</span>
    </div>
    <button class="btn ghost block" onclick={cancelInvite}>Cancel</button>
  {:else}
    <div class="step">
      <span class="stepnum" aria-hidden="true">1</span>
      <span>Show this to the player joining:</span>
    </div>
    <SignalShare text={offer} caption="They scan or paste this on their device" />

    <div class="step">
      <span class="stepnum" aria-hidden="true">2</span>
      <span>Then read the reply they show back:</span>
    </div>
    <QrScanner label="their reply" onresult={onReply} />

    {#if err}
      <p class="err" role="alert">{err}</p>
    {/if}
    <button class="btn ghost block" onclick={cancelInvite} disabled={busy}>Cancel</button>
  {/if}
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
  .note {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.45;
  }
  .players {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 12px 5px 6px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    font-size: 0.9rem;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.92rem;
    font-weight: 600;
  }
  .stepnum {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: var(--surface-3);
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 700;
  }
  .prep {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 16px 0;
  }
  .spinner {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: 3px solid var(--surface-3);
    border-top-color: var(--primary);
    animation: spin 0.8s linear infinite;
  }
  .err {
    margin: 0;
    font-size: 0.85rem;
    color: var(--bad);
    line-height: 1.4;
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
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .backdrop {
      animation: none;
    }
    .spinner {
      animation-duration: 2.4s;
    }
  }
</style>
