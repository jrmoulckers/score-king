<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { haptic } from '../../haptics';
  import HowlReveal from './HowlReveal.svelte';
  import { resolveOutcome, type WerewordsInput } from './logic';
  import { suggestWord } from './words';

  let { input = $bindable(), ctx }: { input: WerewordsInput; ctx: RoundContext } = $props();

  const seerOn = $derived(!!ctx.config.seer);
  const expectedWolves = $derived(Math.max(1, Number(ctx.config.werewolves) || 1));
  const timerMins = $derived(Math.max(1, Number(ctx.config.timer) || 4));
  const wolfCount = $derived(input.werewolves.length);
  const outcome = $derived(resolveOutcome(input));

  let showBriefing = $state(false);
  let showStandings = $state(false);

  // The running "rounds won" race, from the cumulative totals before this round. Purely
  // glanceable ladder energy inside the editor — 👑 marks whoever is reigning right now.
  const standings = $derived.by(() => {
    const rows = ctx.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      wins: Number(ctx.totals[p.id] ?? 0),
    }));
    rows.sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
    return rows;
  });
  const topWins = $derived(standings.length ? standings[0].wins : 0);
  const anyScored = $derived(topWins > 0);

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
    haptic('tick');
  }
  function toggleMayor(id: string) {
    input.mayor = input.mayor === id ? null : id;
    if (input.mayor === id) {
      input.werewolves = input.werewolves.filter((w) => w !== id);
      if (input.seer === id) clearSeer();
    }
    haptic('tick');
  }
  function toggleSeer(id: string) {
    if (input.seer === id) {
      clearSeer();
      haptic('tick');
      return;
    }
    input.seer = id;
    input.werewolfFoundSeer = false;
    input.werewolves = input.werewolves.filter((w) => w !== id);
    if (input.mayor === id) input.mayor = null;
    haptic('tick');
  }

  function setGuessed(g: boolean) {
    input.guessed = g;
    // Only one twist can apply at a time — clear the branch that no longer fits.
    if (g) input.mayorFoundWerewolf = false;
    else input.werewolfFoundSeer = false;
  }

  function rollWord() {
    input.word = suggestWord(Math.floor(Math.random() * 1_000_000_000), input.word);
    haptic('tick');
  }

  const showSeerTwist = $derived(input.guessed && seerOn && input.seer != null);
  const showMayorTwist = $derived(!input.guessed);
  const mayorName = $derived(ctx.players.find((p) => p.id === input.mayor)?.name ?? '');
  const preview = $derived(input.word.trim().toUpperCase());

  // ── The reveal payoff ────────────────────────────────────────────────────────
  // Fire HowlReveal whenever the round's *resolved side* flips — i.e. the table taps
  // guessed/missed or engages a twist — never on mount and never on a mere word edit.
  let revealToken = $state(0);
  let revealPrimed = false;
  let lastSignature = '';
  $effect(() => {
    const sig = `${outcome.team}|${outcome.twist}`;
    if (!revealPrimed) {
      revealPrimed = true;
      lastSignature = sig;
      return;
    }
    if (sig !== lastSignature) {
      lastSignature = sig;
      revealToken += 1;
      haptic('win');
    }
  });
</script>

<div class="stack">
  <!-- The secret word: Werewords' centerpiece, dressed as a little spellbook field. -->
  <div class="spell">
    <div class="spell-top">
      <span class="fieldlabel spell-label">🔮 The secret word</span>
      <button type="button" class="dice" onclick={rollWord} title="Suggest a word">
        🎲 Need a word?
      </button>
    </div>
    <input
      class="spell-input"
      type="text"
      autocapitalize="characters"
      autocomplete="off"
      spellcheck="false"
      placeholder="e.g. PYRAMID"
      bind:value={input.word}
    />
    <span class="spell-preview tnum" class:empty={!preview} aria-hidden="true">
      {preview || 'the Mayor’s magic word'}
    </span>
  </div>

  <!-- Optional table briefing: who wakes, and the yes/no/maybe ritual. Closed by default. -->
  <div class="brief">
    <button
      type="button"
      class="brief-toggle"
      aria-expanded={showBriefing}
      onclick={() => (showBriefing = !showBriefing)}
    >
      <span class="row" style="gap: 8px">
        <span aria-hidden="true">🌙</span>
        <span><strong>Lower the lights</strong> · {expectedWolves} 🐺 · {seerOn ? '🔮 Seer in play' : 'no Seer'}</span>
      </span>
      <span class="muted small">{showBriefing ? 'Hide' : 'How to play'}</span>
    </button>
    {#if showBriefing}
      <div class="brief-body">
        <p class="brief-lead small muted">Douse the lights — here’s the night ritual.</p>
        <ul class="brief-list">
          <li>👑 The <strong>Mayor</strong> knows the word and answers only 👍&nbsp;yes · 👎&nbsp;no · 🤷&nbsp;maybe.</li>
          <li>🏘️ The <strong>Villagers</strong> race the clock to crack it — about {timerMins} min at the table (you run the clock).</li>
          {#if seerOn}<li>🔮 The <strong>Seer</strong> secretly knows the word too, and quietly nudges the town.</li>{/if}
          <li>🐺 The <strong>{expectedWolves === 1 ? 'werewolf' : `${expectedWolves} werewolves`}</strong> {expectedWolves === 1 ? 'also knows' : 'also know'} the word — they blend in and stall.</li>
          <li>🔀 Guessed in time? A wolf can <strong>steal it</strong> by naming the Seer. Out of time? The Mayor can <strong>steal it back</strong> by naming a wolf.</li>
        </ul>
      </div>
    {/if}
  </div>

  <div class="row spread rolehead">
    <span class="muted small">Tap each player’s role — untapped are Villagers.</span>
    <span class="pill tnum" class:score-bad={wolfCount !== expectedWolves}>🐺 pack {wolfCount}/{expectedWolves}</span>
  </div>

  {#each ctx.players as p (p.id)}
    <div class="prow" class:wolfrow={isWolf(p.id)}>
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
          class="rbtn wolf"
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

    <!-- The steal: the game's soul. A dramatic, clearly-labelled flip, co-signalled by
         emoji + label + pressed state (never colour alone). -->
    {#if showSeerTwist}
      <button
        type="button"
        class="twist"
        class:on={input.werewolfFoundSeer}
        aria-pressed={input.werewolfFoundSeer}
        onclick={() => (input.werewolfFoundSeer = !input.werewolfFoundSeer)}
      >
        <span class="twist-emoji" aria-hidden="true">🐺</span>
        <span class="twist-copy">
          <strong>A werewolf sniffed out the Seer</strong>
          <span class="twist-sub muted">…and steals the win from the village</span>
        </span>
        <span class="twist-mark" aria-hidden="true">{input.werewolfFoundSeer ? '✓' : ''}</span>
      </button>
    {:else if showMayorTwist}
      <button
        type="button"
        class="twist"
        class:on={input.mayorFoundWerewolf}
        aria-pressed={input.mayorFoundWerewolf}
        onclick={() => (input.mayorFoundWerewolf = !input.mayorFoundWerewolf)}
      >
        <span class="twist-emoji" aria-hidden="true">🕵️</span>
        <span class="twist-copy">
          <strong>{mayorName ? `${mayorName} (Mayor)` : 'The Mayor'} pointed at a werewolf</strong>
          <span class="twist-sub muted">…and steals the win back for the village</span>
        </span>
        <span class="twist-mark" aria-hidden="true">{input.mayorFoundWerewolf ? '✓' : ''}</span>
      </button>
    {/if}

    <!-- The stage: the outcome banner, with the cinematic reveal layered over it. -->
    <div class="stage">
      <HowlReveal token={revealToken} team={outcome.team} twist={outcome.twist} word={input.word} />
      <div class="banner" class:wolves={outcome.team === 'werewolf'}>
        <div class="verdict">
          <span>{outcome.team === 'werewolf' ? '🐺 Werewolves win' : '🏘️ Villagers win'}</span>
          {#if outcome.twist}<span class="pill twistpill">🔀 Twist!</span>{/if}
        </div>
        <div class="reason muted">{outcome.reason}</div>
      </div>
    </div>
  </div>

  <!-- Optional running ladder: who's reigning in the rounds-won race. Closed by default. -->
  <div class="brief">
    <button
      type="button"
      class="brief-toggle"
      aria-expanded={showStandings}
      onclick={() => (showStandings = !showStandings)}
    >
      <span class="row" style="gap: 8px">
        <span aria-hidden="true">🏆</span>
        <span><strong>Standings</strong> <span class="muted small">· rounds won so far</span></span>
      </span>
      <span class="muted small">{showStandings ? 'Hide' : 'Show'}</span>
    </button>
    {#if showStandings}
      <div class="ladder">
        {#if !anyScored}
          <p class="small muted ladder-empty">No rounds banked yet — the first to crack it takes the lead.</p>
        {/if}
        {#each standings as s, i (s.id)}
          <div class="lrow" class:leader={anyScored && s.wins === topWins}>
            <span class="lrank tnum muted">{i + 1}</span>
            <Avatar name={s.name} color={s.color} size={24} />
            <span class="lname">{s.name}</span>
            {#if anyScored && s.wins === topWins}<span class="lcrown" aria-hidden="true">👑</span>{/if}
            <span class="lwins tnum" class:lead={anyScored && s.wins === topWins}>{s.wins}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /* Secret-word spell field ------------------------------------------------- */
  .spell {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
  }
  .spell-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .spell-label {
    margin-bottom: 0;
  }
  .dice {
    flex: none;
    min-height: 36px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease;
  }
  .dice:hover {
    border-color: var(--primary);
  }
  .dice:active {
    transform: translateY(1px);
  }
  .dice:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .spell-input {
    width: 100%;
    text-align: center;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 700;
  }
  .spell-preview {
    text-align: center;
    font-size: 0.8rem;
    letter-spacing: 0.16em;
    color: var(--muted);
  }
  .spell-preview.empty {
    text-transform: none;
    letter-spacing: normal;
    font-style: italic;
    opacity: 0.75;
  }

  /* Collapsible panels (briefing + standings) ------------------------------- */
  .brief {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .brief-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 46px;
    padding: 10px 12px;
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .brief-toggle:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }
  .brief-body {
    padding: 0 12px 12px;
  }
  .brief-lead {
    margin: 2px 0 8px;
  }
  .brief-list {
    margin: 0;
    padding-left: 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  /* Role rows --------------------------------------------------------------- */
  .rolehead {
    margin-top: 2px;
  }
  .small {
    font-size: 0.85rem;
  }
  .prow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  /* Wolf rows take on a subtle night tint — always paired with the 🐺 label + pressed
     wolf button, so the hidden side is never signalled by colour alone. */
  .wolfrow {
    background: color-mix(in srgb, var(--primary) 12%, var(--surface-2));
    border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
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
  .rbtn:active {
    transform: translateY(1px);
  }
  .rbtn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  /* Result + twist ---------------------------------------------------------- */
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
  .ch:active {
    transform: translateY(1px);
  }
  .ch:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .twist {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 46px;
    padding: 10px 14px;
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .twist:hover {
    border-color: var(--primary);
  }
  .twist.on {
    background: var(--primary);
    border-style: solid;
    border-color: var(--primary-strong);
    color: #fff;
  }
  .twist:active {
    transform: translateY(1px);
  }
  .twist:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .twist-emoji {
    font-size: 1.4rem;
    line-height: 1;
    flex: none;
  }
  .twist-copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1 1 auto;
  }
  .twist-sub {
    font-size: 0.8rem;
  }
  .twist.on .twist-sub {
    color: color-mix(in srgb, #fff 82%, transparent);
  }
  .twist-mark {
    flex: none;
    width: 1.2rem;
    text-align: center;
    font-weight: 800;
  }

  /* Outcome stage + banner -------------------------------------------------- */
  .stage {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius);
  }
  .banner {
    position: relative;
    z-index: 2;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
  }
  .banner.wolves {
    background: color-mix(in srgb, var(--primary) 10%, var(--surface-2));
    border-color: color-mix(in srgb, var(--primary) 36%, var(--border));
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

  /* Standings ladder -------------------------------------------------------- */
  .ladder {
    padding: 0 8px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ladder-empty {
    padding: 2px 4px 6px;
  }
  .lrow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 10px;
  }
  .lrow.leader {
    background: color-mix(in srgb, var(--accent) 13%, transparent);
  }
  .lrank {
    width: 1.2rem;
    text-align: center;
    font-size: 0.85rem;
  }
  .lname {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lcrown {
    flex: none;
    font-size: 0.9rem;
  }
  .lwins {
    flex: none;
    font-weight: 700;
    min-width: 1.5rem;
    text-align: right;
  }

  .tnum {
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .dice:active,
    .rbtn:active,
    .ch:active,
    .twist:active {
      transform: none;
    }
  }
</style>
