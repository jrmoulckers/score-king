<script lang="ts">
  /**
   * The single host sheet for "Play together". One chrome, one roster, two swappable bodies:
   * an **online** invite (share a code / link / QR over the relay, or same-browser) and a
   * **nearby** hand-carried handshake (QR offer ⇄ reply, no internet). The host expresses one
   * intent — play together — and picks online vs nearby here, rather than up front. The engine
   * underneath is the same host-authoritative session either way.
   */
  import { onMount } from 'svelte';
  import { showToast } from '../stores/toast';
  import { liveParticipants, type NearbyHostControls } from '../live/session';
  import Avatar from './Avatar.svelte';
  import SignalShare from './SignalShare.svelte';
  import QrScanner from './QrScanner.svelte';
  import { focusTrap } from '../a11y/focusTrap';

  let {
    mode,
    code,
    link,
    remote = false,
    controls = null,
    canGoOnline = true,
    canGoNearby = false,
    onclose,
    onend,
    onswitch,
  }: {
    mode: 'online' | 'nearby';
    code: string;
    link: string;
    /** True when the online session runs over the relay — i.e. the link works cross-device. */
    remote?: boolean;
    /** Present only in nearby mode: drives the per-guest offer/answer handshake. */
    controls?: NearbyHostControls | null;
    canGoOnline?: boolean;
    canGoNearby?: boolean;
    onclose: () => void;
    onend: () => void;
    onswitch: (to: 'online' | 'nearby') => void;
  } = $props();

  const roster = $derived($liveParticipants);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // ── Online body ────────────────────────────────────────────────────────────
  // A scannable QR only when a relay makes the link reachable from another device; showing one
  // for a same-browser session would be a lie (a scanning phone can't join).
  let qr = $state('');
  $effect(() => {
    const target = link;
    if (mode !== 'online' || !remote || !target) {
      qr = '';
      return;
    }
    let alive = true;
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

  // ── Nearby body ──────────────────────────────────────────────────────────────
  type Phase = 'idle' | 'preparing' | 'inviting';
  let phase = $state<Phase>('idle');
  let offer = $state('');
  let busy = $state(false);
  let err = $state('');

  async function addPlayer() {
    if (!controls || phase !== 'idle') return;
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
    if (!controls || busy) return;
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
    controls?.cancelInvite();
    offer = '';
    err = '';
    phase = 'idle';
  }

  // Switching transports disconnects anyone already joined, so guard it with the same inline
  // themed confirm the app uses for destructive actions — never a native window.confirm (a
  // DESIGN non-negotiable). Only when someone besides the host is present.
  let confirmSwitch = $state<null | 'online' | 'nearby'>(null);
  function requestSwitch(to: 'online' | 'nearby') {
    if (roster.length > 1) confirmSwitch = to;
    else onswitch(to);
  }

  // Ending closes the game for every guest at once, so guard it with an inline confirm when
  // there's more than just the host present — mirroring the app's confirm/undo pattern for
  // destructive actions rather than ending on a single stray tap.
  let confirmEnd = $state(false);
  function requestEnd() {
    if (roster.length > 1) confirmEnd = true;
    else onend();
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

<div class="sheet" role="dialog" aria-modal="true" aria-label="Play together" tabindex="-1" bind:this={sheet} use:focusTrap>
  <div class="grabber" aria-hidden="true"></div>

  <div class="row spread">
    <strong style="font-size: 1.05rem">Play together</strong>
    <span class="live"><span class="dot" aria-hidden="true"></span>Live · {roster.length}</span>
  </div>

  {#if roster.length}
    <div class="players">
      {#each roster as p (p.id)}
        <span class="chip">
          {#if p.role === 'leader'}<span title="Host" aria-label="Host">👑</span>{/if}
          <Avatar name={p.name} color={p.color} size={22} />{p.name}
          {#if p.role !== 'leader' && !p.playerId}<span class="tag">watching</span>{/if}
        </span>
      {/each}
    </div>
  {/if}

  {#if mode === 'online'}
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

    {#if remote}
      <button class="btn {canNativeShare ? '' : 'primary'} block" onclick={() => copy(link, 'Link')}>
        🔗 Copy link
      </button>
      {#if canNativeShare}
        <button class="btn primary block" onclick={share}>Share…</button>
      {/if}
    {/if}
    <div class="row" style="gap: 10px">
      <button class="btn grow" onclick={() => copy(code, 'Code')}>Copy code</button>
      <button class="btn {remote ? '' : 'primary'} grow" onclick={openPlayerTab}>Open a player tab</button>
    </div>

    {#if remote}
      <p class="note">
        Scan the code or share the link — anyone can join from their own device, wherever they are.
      </p>
    {:else}
      <p class="note">
        This game lives in this browser only — “Open a player tab” adds a player on this device. To
        invite other devices, set a relay URL in Settings → Advanced, or switch to nearby below.
      </p>
    {/if}
  {:else}
    {#if phase === 'idle'}
      <p class="note">No internet needed — everyone’s on this network. Add each player by trading codes.</p>
      <button class="btn primary block" onclick={addPlayer}>➕ Add a player</button>
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
  {/if}

  {#if confirmSwitch}
    <div class="endconfirm">
      <p class="note">
        Switching to {confirmSwitch === 'nearby' ? 'nearby' : 'online'} disconnects the
        {roster.length - 1}
        {roster.length - 1 === 1 ? 'player' : 'players'} who already joined — they’ll need a fresh invite. Continue?
      </p>
      <div class="row" style="gap: 10px">
        <button class="btn grow" onclick={() => (confirmSwitch = null)}>Keep this game</button>
        <button
          class="btn grow"
          onclick={() => {
            const to = confirmSwitch;
            confirmSwitch = null;
            if (to) onswitch(to);
          }}
        >
          Switch anyway
        </button>
      </div>
    </div>
  {:else if mode === 'online' && canGoNearby}
    <button class="switch" onclick={() => requestSwitch('nearby')}>📡 No internet? Switch to nearby</button>
  {:else if mode === 'nearby' && canGoOnline}
    <button class="switch" onclick={() => requestSwitch('online')}>🌐 Switch to online — share a link</button>
  {/if}

  {#if confirmEnd}
    <div class="endconfirm">
      <p class="note">End the game for everyone? Guests drop out — your scoreboard stays safe on this device.</p>
      <div class="row" style="gap: 10px">
        <button class="btn grow" onclick={() => (confirmEnd = false)}>Keep playing</button>
        <button class="btn danger grow" onclick={onend}>End for everyone</button>
      </div>
    </div>
  {:else}
    <button class="btn danger block" onclick={requestEnd}>End live game</button>
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
  .tag {
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
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
    text-indent: 0.32em;
    font-variant-numeric: tabular-nums;
  }
  .qr {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .qr img {
    /* A white quiet zone is required for reliable scanning, so the QR keeps a light card in
       both themes — a deliberate exception to the surface ramp, for function. */
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
  .note {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.45;
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
  .switch {
    width: 100%;
    min-height: 46px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: transparent;
    border: 1px dashed var(--border);
    color: var(--muted);
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
  }
  .switch:hover {
    border-color: var(--primary);
    color: var(--text);
  }
  .endconfirm {
    display: flex;
    flex-direction: column;
    gap: 10px;
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
