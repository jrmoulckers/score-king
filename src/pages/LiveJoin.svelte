<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getModule } from '../lib/games/registry';
  import { navigate, link } from '../lib/router';
  import { normalizeJoinCode } from '../lib/util';
  import {
    joinSession,
    leaveSession,
    currentSelf,
    isLiveSupported,
    liveStatus,
    liveReplica,
    liveParticipants,
    liveError,
    liveEndReason,
    endedTitle,
    endedBody,
  } from '../lib/live/session';
  import ReplicaBoard from '../lib/components/ReplicaBoard.svelte';

  let { code }: { code: string } = $props();
  const joinCode = $derived(normalizeJoinCode(code));
  const supported = isLiveSupported();

  let everConnected = $state(false);

  const replica = $derived($liveReplica);
  const gmodule = $derived(replica ? getModule(replica.game.type) : undefined);

  $effect(() => {
    if ($liveStatus === 'guest') everConnected = true;
  });

  async function leave() {
    await leaveSession();
    navigate('/');
  }

  onMount(() => {
    if (!supported) return;
    void joinSession(joinCode, currentSelf('guest'));
  });
  onDestroy(() => {
    void leaveSession();
  });
</script>

{#if !supported}
  <div class="empty">
    <h2>Live play isn’t available here</h2>
    <p class="muted">This browser can’t run live games. You can still keep score on your own.</p>
    <a class="btn primary" href="/" use:link>Back to games</a>
  </div>
{:else if $liveStatus === 'guest' && replica && gmodule}
  <div class="row spread" style="margin: 10px 4px 6px">
    <span class="row" style="gap: 10px">
      <span style="font-size: 1.7rem">{gmodule.emoji}</span>
      <span>
        <div><strong>{gmodule.name}</strong></div>
        <div class="muted" style="font-size: 0.8rem">Live game · code {joinCode}</div>
      </span>
    </span>
    <span class="live" aria-label={`${$liveParticipants.length} connected`}>
      <span class="dot" aria-hidden="true"></span>{$liveParticipants.length}
    </span>
  </div>

  <ReplicaBoard />

  <button class="btn ghost block" style="margin-top: 14px" onclick={leave}>Leave game</button>
{:else if $liveStatus === 'error'}
  <div class="empty" role="alert">
    <h2>Couldn’t join</h2>
    <p class="muted">{$liveError ?? 'That live game isn’t reachable.'}</p>
    <a class="btn primary" href="/" use:link>Back to games</a>
    <p class="muted reassure">No worries — you can still keep score on your own device.</p>
  </div>
{:else if everConnected}
  <div class="empty" role="status">
    <h2>{endedTitle($liveEndReason)}</h2>
    <p class="muted">{endedBody($liveEndReason)}</p>
    <a class="btn primary" href="/" use:link>Back to games</a>
  </div>
{:else}
  <div class="empty" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true"></div>
    <h2>Joining game {joinCode}…</h2>
    <p class="muted">Connecting you to the host.</p>
    <button class="btn ghost" onclick={leave}>Cancel</button>
    <p class="muted reassure">Live play is optional — every game still works fully offline.</p>
  </div>
{/if}

<style>
  .reassure {
    margin-top: 4px;
    font-size: 0.82rem;
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
  .spinner {
    width: 30px;
    height: 30px;
    margin: 0 auto 10px;
    border-radius: 999px;
    border: 3px solid var(--surface-3);
    border-top-color: var(--primary);
    animation: spin 0.8s linear infinite;
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
