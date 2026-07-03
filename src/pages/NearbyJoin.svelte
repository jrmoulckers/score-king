<script lang="ts">
  /**
   * Guest side of nearby (serverless) play at /nearby. The guest reads the host's invite
   * (scan or paste), shows a reply back for the host to read, and — once the host accepts it —
   * drops into the same shared ReplicaBoard used by relay play. No code, no server, no internet.
   */
  import { onDestroy } from 'svelte';
  import { getModule } from '../lib/games/registry';
  import { navigate, link } from '../lib/router';
  import {
    joinSessionNearby,
    leaveSession,
    currentSelf,
    isNearbySupported,
    liveStatus,
    liveReplica,
    liveParticipants,
    liveError,
    type NearbyGuestControls,
  } from '../lib/live/session';
  import ReplicaBoard from '../lib/components/ReplicaBoard.svelte';
  import QrScanner from '../lib/components/QrScanner.svelte';
  import SignalShare from '../lib/components/SignalShare.svelte';

  const supported = isNearbySupported();

  let phase = $state<'scan' | 'reply'>('scan');
  let answer = $state('');
  let err = $state('');
  let busy = $state(false);
  let everConnected = $state(false);
  let controls: NearbyGuestControls | null = null;

  const replica = $derived($liveReplica);
  const gmodule = $derived(replica ? getModule(replica.game.type) : undefined);

  $effect(() => {
    if ($liveStatus === 'guest') everConnected = true;
  });

  async function begin() {
    if (!supported) return;
    controls = await joinSessionNearby(currentSelf('guest'));
  }

  async function onOffer(text: string) {
    if (busy) return;
    if (!controls) await begin();
    if (!controls) return;
    busy = true;
    err = '';
    try {
      answer = await controls.acceptInvite(text);
      phase = 'reply';
    } catch (e) {
      err = e instanceof Error ? e.message : 'That invite didn’t work — ask the host for a fresh one.';
    } finally {
      busy = false;
    }
  }

  async function restart() {
    await leaveSession();
    answer = '';
    err = '';
    everConnected = false;
    phase = 'scan';
    await begin();
  }

  async function leave() {
    await leaveSession();
    navigate('/');
  }

  void begin();
  onDestroy(() => {
    void leaveSession();
  });
</script>

{#if !supported}
  <div class="empty">
    <h2>Nearby play isn’t available here</h2>
    <p class="muted">This browser can’t connect device-to-device. You can still keep score on your own.</p>
    <a class="btn primary" href="/" use:link>Back to games</a>
  </div>
{:else if $liveStatus === 'guest' && replica && gmodule}
  <div class="row spread" style="margin: 10px 4px 6px">
    <span class="row" style="gap: 10px">
      <span style="font-size: 1.7rem">{gmodule.emoji}</span>
      <span>
        <div><strong>{gmodule.name}</strong></div>
        <div class="muted" style="font-size: 0.8rem">Nearby game</div>
      </span>
    </span>
    <span class="live"><span class="dot" aria-hidden="true"></span>{$liveParticipants.length}</span>
  </div>

  <ReplicaBoard />

  <button class="btn ghost block" style="margin-top: 14px" onclick={leave}>Leave game</button>
{:else if $liveStatus === 'error'}
  <div class="empty">
    <h2>Couldn’t connect</h2>
    <p class="muted">{$liveError ?? 'The nearby game isn’t reachable.'}</p>
    <button class="btn primary" onclick={restart}>Try again</button>
    <a class="btn ghost" href="/" use:link style="margin-top: 8px">Back to games</a>
  </div>
{:else if everConnected}
  <div class="empty">
    <h2>The game ended</h2>
    <p class="muted">The host closed the session.</p>
    <a class="btn primary" href="/" use:link>Back to games</a>
  </div>
{:else}
  <div class="join">
    <div class="row spread" style="margin: 10px 4px 2px">
      <strong style="font-size: 1.1rem">Join a nearby game</strong>
      <a class="muted" href="/" use:link style="font-size: 0.85rem">Cancel</a>
    </div>

    {#if phase === 'scan'}
      <div class="step">
        <span class="stepnum" aria-hidden="true">1</span>
        <span>Read the host’s invite:</span>
      </div>
      <QrScanner label="the host’s invite" onresult={onOffer} />
      {#if err}
        <p class="err" role="alert">{err}</p>
      {/if}
    {:else}
      <div class="step">
        <span class="stepnum" aria-hidden="true">2</span>
        <span>Show this reply to the host:</span>
      </div>
      <SignalShare text={answer} caption="The host scans or pastes this to connect you" />
      <div class="waiting">
        <div class="spinner" aria-hidden="true"></div>
        <span class="muted">Waiting for the host to connect you…</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .join {
    display: flex;
    flex-direction: column;
    gap: 14px;
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
  .waiting {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .spinner {
    width: 22px;
    height: 22px;
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
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 2.4s;
    }
  }
</style>
