<script lang="ts">
  import { prefersReducedMotion } from '../../motion';
  import Avatar from '../../components/Avatar.svelte';

  /**
   * The digital role token. The Storyteller taps a seat and hands the phone over;
   * this full-screen private card shows that player ONLY their own character — a
   * two-step reveal (a "pass to {name}" cover first) keeps the next player from
   * peeking. An evil player also learns their fellow evil and who the Demon is,
   * exactly as they would on the first night. Honors the privacy principle: the
   * Grimoire's true roles never share a screen with the person being revealed to.
   *
   * The flip is decorative — the card content carries all meaning — so under
   * reduced motion it simply crossfades. Escape or the "hand it back" button
   * closes it and returns the Storyteller to the Grimoire.
   */
  export interface RevealData {
    name: string;
    color: string;
    role: string;
    team: 'good' | 'evil';
    isDemon: boolean;
    /** Names of the other evil seats (evil viewer only). */
    fellowEvil: string[];
    /** The Demon's name, if flagged (evil viewer only). */
    demonName: string | null;
  }

  let { reveal, onclose }: { reveal: RevealData | null; onclose: () => void } = $props();

  const reduced = prefersReducedMotion();
  let shown = $state(false);

  // A fresh reveal always starts hidden behind the "pass the phone" cover.
  $effect(() => {
    reveal;
    shown = false;
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={reveal ? onKey : undefined} />

{#if reveal}
  <div class="scrim" role="dialog" aria-modal="true" aria-label={`${reveal.name}'s character`}>
    {#if !shown}
      <div class="cover" class:still={reduced}>
        <span class="hush" aria-hidden="true">🤫</span>
        <p class="pass">Pass the phone to</p>
        <span class="who">
          <Avatar name={reveal.name} color={reveal.color} size={28} />
          <strong class="wname">{reveal.name}</strong>
        </span>
        <p class="sub">Everyone else, look away.</p>
        <button type="button" class="btn primary block reveal-btn" onclick={() => (shown = true)}>
          🎭 Reveal my character
        </button>
        <button type="button" class="btn block ghost" onclick={onclose}>Cancel</button>
      </div>
    {:else}
      <div class="card" class:evil={reveal.team === 'evil'} class:still={reduced}>
        <span class="badge" aria-hidden="true">{reveal.team === 'evil' ? '😈' : '🕯️'}</span>
        <p class="youare">You are</p>
        <strong class="role">{reveal.role || 'Not assigned yet'}</strong>
        <span class="team-lbl">
          {#if reveal.isDemon}
            😈 The Demon
          {:else if reveal.team === 'evil'}
            😈 Evil — Minion
          {:else}
            😇 Good — you serve the town
          {/if}
        </span>

        {#if reveal.team === 'evil'}
          <div class="intel">
            {#if reveal.demonName}
              <p class="intel-line"><span class="ilabel">The Demon</span> <span class="iname">{reveal.demonName}</span></p>
            {/if}
            {#if reveal.fellowEvil.length}
              <p class="intel-line">
                <span class="ilabel">Your evil</span>
                <span class="iname">{reveal.fellowEvil.join(', ')}</span>
              </p>
            {:else if !reveal.demonName}
              <p class="intel-line muted">No other evil flagged in the Grimoire yet.</p>
            {/if}
          </div>
        {:else}
          <p class="flavor">Sleep well — and trust no one. 🌙</p>
        {/if}

        <button type="button" class="btn primary block" onclick={onclose}>👀 Hide &amp; hand it back</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 20px;
    background: color-mix(in srgb, var(--bg) 82%, black);
    backdrop-filter: blur(6px);
  }
  .cover,
  .card {
    width: min(360px, 100%);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
  }
  .card {
    animation: flip-in 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  }
  .cover {
    animation: fade-in 0.25s ease-out both;
  }
  .card.still,
  .cover.still {
    animation: fade-in 0.2s ease-out both;
  }

  .hush {
    font-size: 2.4rem;
    line-height: 1;
  }
  .pass {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .wname {
    font-size: 1.25rem;
    font-weight: 800;
  }
  .sub {
    margin: 0 0 6px;
    color: var(--muted);
    font-size: 0.82rem;
  }
  .reveal-btn {
    margin-top: 4px;
  }

  .badge {
    font-size: 2.6rem;
    line-height: 1;
    filter: drop-shadow(0 0 14px color-mix(in srgb, var(--good) 45%, transparent));
  }
  .card.evil .badge {
    filter: drop-shadow(0 0 14px color-mix(in srgb, var(--bad) 45%, transparent));
  }
  .youare {
    margin: 0;
    color: var(--muted);
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
  }
  .role {
    font-size: 1.6rem;
    font-weight: 800;
    line-height: 1.15;
  }
  .team-lbl {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text);
  }
  .flavor {
    margin: 4px 0 8px;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .intel {
    width: 100%;
    margin: 6px 0 8px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .intel-line {
    margin: 0;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.9rem;
  }
  .intel-line.muted {
    justify-content: center;
    color: var(--muted);
    font-size: 0.82rem;
  }
  .ilabel {
    color: var(--muted);
  }
  .iname {
    font-weight: 700;
    text-align: right;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes flip-in {
    0% { opacity: 0; transform: perspective(700px) rotateY(-90deg) scale(0.94); }
    60% { opacity: 1; transform: perspective(700px) rotateY(8deg) scale(1); }
    100% { opacity: 1; transform: perspective(700px) rotateY(0deg) scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .card,
    .cover {
      animation: fade-in 0.2s ease-out both;
    }
  }
</style>
