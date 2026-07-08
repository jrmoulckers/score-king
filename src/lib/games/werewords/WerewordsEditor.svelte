<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { resolveOutcome, type WerewordsInput } from './logic';

  let { input = $bindable(), ctx }: { input: WerewordsInput; ctx: RoundContext } = $props();

  const seerOn = $derived(!!ctx.config.seer);
  const expectedWolves = $derived(Math.max(1, Number(ctx.config.werewolves) || 1));
  const wolfCount = $derived(input.werewolves.length);
  const outcome = $derived(resolveOutcome(input));

  function isWolf(id: string): boolean {
    return input.werewolves.includes(id);
  }
  function roleLabel(id: string): string {
    if (isWolf(id)) return 'Werewolf';
    if (input.mayor === id) return 'Mayor';
    if (input.seer === id) return 'Seer';
    return 'Villager';
  }

  function clearSeer() {
    input.seer = null;
    input.werewolfFoundSeer = false;
  }

  function toggleWolf(id: string) {
    if (isWolf(id)) {
      input.werewolves = input.werewolves.filter((w) => w !== id);
    } else {
      input.werewolves = [...input.werewolves, id];
      if (input.mayor === id) input.mayor = null;
      if (input.seer === id) clearSeer();
    }
  }
  function toggleMayor(id: string) {
    input.mayor = input.mayor === id ? null : id;
    if (input.mayor === id) {
      input.werewolves = input.werewolves.filter((w) => w !== id);
      if (input.seer === id) clearSeer();
    }
  }
  function toggleSeer(id: string) {
    if (input.seer === id) {
      clearSeer();
      return;
    }
    input.seer = id;
    input.werewolfFoundSeer = false;
    input.werewolves = input.werewolves.filter((w) => w !== id);
    if (input.mayor === id) input.mayor = null;
  }

  function setGuessed(g: boolean) {
    input.guessed = g;
    // Only one twist can apply at a time — clear the branch that no longer fits.
    if (g) input.mayorFoundWerewolf = false;
    else input.werewolfFoundSeer = false;
  }

  const showSeerTwist = $derived(input.guessed && seerOn && input.seer != null);
  const showMayorTwist = $derived(!input.guessed);
  const mayorName = $derived(ctx.players.find((p) => p.id === input.mayor)?.name ?? '');
</script>

<div class="stack">
  <label class="field">
    <span class="fieldlabel">🔮 Secret word</span>
    <input
      type="text"
      autocapitalize="characters"
      autocomplete="off"
      spellcheck="false"
      placeholder="e.g. PYRAMID"
      bind:value={input.word}
    />
  </label>

  <div class="row spread">
    <span class="muted">Tap each player’s role — untapped are Villagers.</span>
    <span class="pill" class:score-bad={wolfCount !== expectedWolves}>🐺 {wolfCount}/{expectedWolves}</span>
  </div>

  {#each ctx.players as p (p.id)}
    <div class="prow">
      <span class="who">
        <Avatar name={p.name} color={p.color} />
        <span class="name">
          <strong>{p.name}</strong>
          <span class="role muted">{roleLabel(p.id)}</span>
        </span>
      </span>
      <span class="roles">
        <button
          type="button"
          class="rbtn"
          class:on={input.mayor === p.id}
          aria-pressed={input.mayor === p.id}
          aria-label={`${p.name}: Mayor`}
          title="Mayor"
          onclick={() => toggleMayor(p.id)}
        >👑</button>
        {#if seerOn}
          <button
            type="button"
            class="rbtn"
            class:on={input.seer === p.id}
            aria-pressed={input.seer === p.id}
            aria-label={`${p.name}: Seer`}
            title="Seer"
            onclick={() => toggleSeer(p.id)}
          >🔮</button>
        {/if}
        <button
          type="button"
          class="rbtn"
          class:on={isWolf(p.id)}
          aria-pressed={isWolf(p.id)}
          aria-label={`${p.name}: Werewolf`}
          title="Werewolf"
          onclick={() => toggleWolf(p.id)}
        >🐺</button>
      </span>
    </div>
  {/each}

  <div class="result">
    <span class="fieldlabel">Did the village crack it in time?</span>
    <div class="choice" role="radiogroup" aria-label="Did the village guess the word in time?">
      <button
        type="button"
        role="radio"
        aria-checked={input.guessed}
        class="ch"
        class:on={input.guessed}
        onclick={() => setGuessed(true)}
      >✅ Guessed it</button>
      <button
        type="button"
        role="radio"
        aria-checked={!input.guessed}
        class="ch"
        class:on={!input.guessed}
        onclick={() => setGuessed(false)}
      >⏳ Ran out of time</button>
    </div>

    {#if showSeerTwist}
      <button
        type="button"
        class="twist"
        class:on={input.werewolfFoundSeer}
        aria-pressed={input.werewolfFoundSeer}
        onclick={() => (input.werewolfFoundSeer = !input.werewolfFoundSeer)}
      >
        🐺 A werewolf then named the Seer
      </button>
    {:else if showMayorTwist}
      <button
        type="button"
        class="twist"
        class:on={input.mayorFoundWerewolf}
        aria-pressed={input.mayorFoundWerewolf}
        onclick={() => (input.mayorFoundWerewolf = !input.mayorFoundWerewolf)}
      >
        🕵️ {mayorName ? `${mayorName} (Mayor)` : 'The Mayor'} then named a werewolf
      </button>
    {/if}

    <div class="banner" class:wolves={outcome.team === 'werewolf'}>
      <div class="verdict">
        <span>{outcome.team === 'werewolf' ? '🐺 Werewolves win' : '🏘️ Villagers win'}</span>
        {#if outcome.twist}<span class="pill twistpill">🔀 Twist!</span>{/if}
      </div>
      <div class="reason muted">{outcome.reason}</div>
    </div>
  </div>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
  }
  .prow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 12px;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .name {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
    min-width: 0;
  }
  .name strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .role {
    font-size: 0.75rem;
  }
  .roles {
    display: inline-flex;
    gap: 6px;
    flex: none;
  }
  .rbtn {
    min-width: 46px;
    height: 46px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font-size: 1.15rem;
    cursor: pointer;
    filter: grayscale(0.55);
    opacity: 0.75;
    transition: background 0.12s ease, border-color 0.12s ease, opacity 0.12s ease, filter 0.12s ease;
  }
  .rbtn:hover {
    border-color: var(--primary);
  }
  .rbtn.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    filter: none;
    opacity: 1;
  }
  .rbtn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .result {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 4px;
  }
  .choice {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .ch {
    flex: 1 1 0;
    min-height: 46px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .ch:hover {
    color: var(--text);
  }
  .ch.on {
    background: var(--primary);
    color: #fff;
  }
  .ch:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .twist {
    min-height: 46px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    font-weight: 700;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease, border-color 0.12s ease;
  }
  .twist:hover {
    border-color: var(--primary);
  }
  .twist.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .twist:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .banner {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px 14px;
  }
  .verdict {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-weight: 800;
    font-size: 1.05rem;
  }
  .twistpill {
    flex: none;
  }
  .reason {
    font-size: 0.85rem;
    margin-top: 2px;
  }
</style>
