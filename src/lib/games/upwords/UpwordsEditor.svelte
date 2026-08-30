<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import { upwords } from './index';
  import {
    MAX_STACK_HEIGHT,
    createEndgameInput,
    createTurnInput,
    emptyWordEntry,
    endgamePenalty,
    turnScore,
    wordScore,
    type UpwordsInput,
    type UpwordsWordEntry,
  } from './logic';

  let { input = $bindable(), ctx }: { input: UpwordsInput; ctx: RoundContext } = $props();

  let showHelp = $state(false);

  const isTurn = $derived(input.mode === 'turn');
  const total = $derived(isTurn ? turnScore(input) : 0);
  const activeName = $derived(
    ctx.players.find((p) => p.id === input.activePlayerId)?.name ?? null,
  );

  function setMode(mode: 'turn' | 'endgame') {
    if (input.mode === mode) return;
    const ids = ctx.players.map((p) => p.id);
    input =
      mode === 'endgame'
        ? createEndgameInput(ids)
        : createTurnInput(ids, ctx.players[ctx.roundIndex % (ctx.players.length || 1)]?.id ?? null);
  }

  function setActive(id: string) {
    input.activePlayerId = id;
    haptic('tick');
  }

  function addWord() {
    input.words = [...input.words, emptyWordEntry()];
    haptic('tick');
  }
  function removeWord(i: number) {
    input.words = input.words.filter((_, idx) => idx !== i);
  }
  function setFlat(entry: UpwordsWordEntry, flat: boolean) {
    entry.flat = flat;
    if (!flat && entry.stackHeight < entry.letters) entry.stackHeight = entry.letters;
  }
</script>

<div class="stack">
  <div class="row spread head">
    <span class="row" style="gap: 8px; flex-wrap: wrap">
      <span class="pill">Round {ctx.roundIndex + 1}</span>
      <span class="pill">🗼 Upwords</span>
    </span>
    <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
      How to score
    </button>
  </div>

  {#if showHelp}
    <pre class="help">{upwords.help}</pre>
  {/if}

  <div class="modes" role="group" aria-label="Round type">
    <button
      type="button"
      class="modebtn"
      class:on={isTurn}
      aria-pressed={isTurn}
      onclick={() => setMode('turn')}
    >
      ✍️ Turn
    </button>
    <button
      type="button"
      class="modebtn"
      class:on={!isTurn}
      aria-pressed={!isTurn}
      onclick={() => setMode('endgame')}
    >
      🏁 End of game
    </button>
  </div>

  {#if isTurn}
    <div class="section">
      <p class="muted hint">Whose turn is this?</p>
      <div class="players" role="group" aria-label="Active player">
        {#each ctx.players as p (p.id)}
          <button
            type="button"
            class="pchip"
            class:on={input.activePlayerId === p.id}
            aria-pressed={input.activePlayerId === p.id}
            onclick={() => setActive(p.id)}
          >
            <Avatar name={p.name} color={p.color} />
            <span>{p.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="section words">
      <div class="row spread">
        <p class="muted hint">Words formed this turn</p>
        <button type="button" class="btn small ghost" onclick={addWord}>+ Add word</button>
      </div>

      {#each input.words as w, i (i)}
        <div class="wordrow">
          <div class="row spread top">
            <strong>Word {i + 1}</strong>
            <span class="preview tabnum">+{wordScore(w)}</span>
          </div>

          <div class="field">
            <span class="flabel">Letters</span>
            <Stepper bind:value={w.letters} min={2} max={15} label={`word ${i + 1} letters`} />
          </div>

          <div class="toggle2" role="group" aria-label={`Word ${i + 1} height`}>
            <button
              type="button"
              class="tbtn"
              class:on={w.flat}
              aria-pressed={w.flat}
              onclick={() => setFlat(w, true)}
            >
              🟩 Flat (2/letter)
            </button>
            <button
              type="button"
              class="tbtn"
              class:on={!w.flat}
              aria-pressed={!w.flat}
              onclick={() => setFlat(w, false)}
            >
              🟪 Stacked
            </button>
          </div>

          {#if !w.flat}
            <div class="field">
              <span class="flabel">Total tile height (sum of every letter’s stack)</span>
              <Stepper
                bind:value={w.stackHeight}
                min={w.letters}
                max={w.letters * MAX_STACK_HEIGHT}
                label={`word ${i + 1} tile height`}
              />
            </div>
          {/if}

          {#if input.words.length > 1}
            <button
              type="button"
              class="btn small ghost remove"
              onclick={() => removeWord(i)}
              aria-label={`Remove word ${i + 1}`}
            >
              Remove
            </button>
          {/if}
        </div>
      {/each}
    </div>

    <div class="section bonuses">
      <label class="checkline">
        <input type="checkbox" bind:checked={input.quBonus} />
        <span>Used the "Qu" tile in a flat word (+2)</span>
      </label>
      <label class="checkline">
        <input type="checkbox" bind:checked={input.bingo} />
        <span>Played all 7 rack tiles this turn — bingo! (+20)</span>
      </label>
    </div>

    <div class="totalbar">
      <span>{activeName ?? 'Pick a player'}</span>
      <span class="tabnum total">+{total}</span>
    </div>
  {:else}
    <div class="section">
      <p class="muted hint">Enter tiles left unplayed on each rack — each costs 5 points.</p>
      {#each ctx.players as p (p.id)}
        {@const tiles = input.unplayedTiles[p.id] ?? 0}
        <div class="prow">
          <span class="row" style="gap: 8px">
            <Avatar name={p.name} color={p.color} />
            <strong>{p.name}</strong>
          </span>
          <Stepper
            bind:value={input.unplayedTiles[p.id]}
            min={0}
            max={7}
            label={`${p.name} unplayed tiles`}
          />
          <span class="preview tabnum" class:score-bad={tiles > 0}>
            {endgamePenalty(tiles)}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .head {
    flex-wrap: wrap;
    gap: 8px;
  }
  .help {
    white-space: pre-wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    font-size: 0.85rem;
    margin: 0;
    font-family: inherit;
    color: var(--muted);
  }
  .hint {
    margin: 0;
    font-size: 0.9rem;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .modes {
    display: flex;
    gap: 8px;
  }
  .modebtn,
  .tbtn {
    flex: 1;
    min-height: 46px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
    transition:
      background var(--dur-base) var(--ease-standard),
      border-color var(--dur-base) var(--ease-standard);
  }
  /* Active-mode / active-choice uses the semantic good accent — never Royal Violet
     (reserved for the single primary Save action) nor Crown Gold (leader/winner only). */
  .modebtn.on,
  .tbtn.on {
    background: color-mix(in srgb, var(--good) 20%, var(--surface));
    border-color: var(--good);
  }

  .players {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .pchip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 46px;
    padding: 6px 12px 6px 6px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
  }
  .pchip.on {
    background: color-mix(in srgb, var(--good) 20%, var(--surface));
    border-color: var(--good);
  }

  .wordrow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .top {
    align-items: baseline;
  }
  .preview {
    font-weight: 800;
    font-size: 1.05rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .flabel {
    font-weight: 600;
  }
  .toggle2 {
    display: flex;
    gap: 8px;
  }
  .remove {
    align-self: flex-start;
    color: var(--bad);
  }

  .bonuses {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
  }
  .checkline {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    font-weight: 600;
  }
  .checkline input {
    width: 20px;
    height: 20px;
  }

  .totalbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    border-radius: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    font-weight: 800;
  }
  .total {
    font-size: 1.3rem;
    color: var(--good);
  }

  .prow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
  }
  .tabnum {
    font-variant-numeric: tabular-nums;
  }
  .score-bad {
    color: var(--bad);
  }

  @media (prefers-reduced-motion: reduce) {
    .modebtn,
    .tbtn {
      transition: none;
    }
  }
</style>
