<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import { bumpOnChange } from '../../motion';
  import { scrabble } from './index';
  import {
    BINGO_BONUS,
    LETTER_GROUPS,
    emptyFinalInput,
    emptyTurnInput,
    finalTallySwing,
    isFinalTally,
    isTurn,
    turnTotal,
    type ScrabbleInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: ScrabbleInput; ctx: RoundContext } = $props();

  const ids = $derived(ctx.players.map((p) => p.id));
  const byId = $derived(new Map(ctx.players.map((p) => [p.id, p])));
  const nameOf = (id: string | null) => (id ? (byId.get(id)?.name ?? '?') : '?');

  let showHelp = $state(false);
  let showLetters = $state(false);

  const chipMultipliers = [1, 5, 10] as const;

  function toTurn() {
    if (isTurn(input)) return;
    input = emptyTurnInput(ids, ctx.roundIndex);
    haptic('tick');
  }
  function toFinal() {
    if (isFinalTally(input)) return;
    input = emptyFinalInput(ids);
    haptic('tick');
  }

  function setPlayer(id: string) {
    if (!isTurn(input)) return;
    if (input.playerId === id) return;
    input.playerId = id;
    haptic('tick');
  }
  function addPoints(amount: number) {
    if (!isTurn(input)) return;
    input.points = Math.max(0, (Number(input.points) || 0) + amount);
    haptic('tick');
  }
  function toggleBingo() {
    if (!isTurn(input)) return;
    input.bingo = !input.bingo;
    haptic(input.bingo ? 'win' : 'tick');
  }

  function setFinisher(id: string) {
    if (!isFinalTally(input)) return;
    input.finisherId = input.finisherId === id ? null : id;
    haptic('tick');
  }

  const swing = $derived(isFinalTally(input) ? finalTallySwing(input, ids) : 0);

  const dirty = $derived(
    isTurn(input)
      ? (input.points ?? 0) > 0 || input.bingo
      : isFinalTally(input) &&
          (input.finisherId != null || Object.values(input.remaining ?? {}).some((v) => v)),
  );

  function clearTurn() {
    if (isTurn(input)) {
      input.points = 0;
      input.bingo = false;
    } else if (isFinalTally(input)) {
      for (const id of ids) input.remaining[id] = 0;
      input.finisherId = null;
    }
    haptic('undo');
  }
</script>

<div class="stack">
  <div class="row spread wrap head">
    <div class="mode-toggle" role="radiogroup" aria-label="What to record">
      <button
        type="button"
        role="radio"
        aria-checked={isTurn(input)}
        class="mode-btn"
        class:on={isTurn(input)}
        onclick={toTurn}
      >
        🔤 Turn {ctx.roundIndex + 1}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={isFinalTally(input)}
        class="mode-btn"
        class:on={isFinalTally(input)}
        onclick={toFinal}
      >
        🏁 Final tally
      </button>
    </div>
    <span class="row" style="gap: 8px">
      {#if dirty}
        <button type="button" class="btn small ghost" onclick={clearTurn}>Clear</button>
      {/if}
      <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
        {showHelp ? 'Hide rules' : 'How to play'}
      </button>
    </span>
  </div>

  {#if showHelp}
    <pre class="help">{scrabble.help}</pre>
  {/if}

  {#if isTurn(input)}
    <section class="panel">
      <p class="sub">Whose turn was it?</p>
      <div class="players" role="radiogroup" aria-label="Active player">
        {#each ctx.players as p (p.id)}
          {@const on = input.playerId === p.id}
          <button
            type="button"
            role="radio"
            aria-checked={on}
            class="player"
            class:on
            onclick={() => setPlayer(p.id)}
          >
            <Avatar name={p.name} color={p.color} />
            <span class="pname">{p.name}</span>
          </button>
        {/each}
      </div>

      <div class="entry">
        <div class="row spread wrap">
          <span class="plabel">Word value this turn</span>
          <span class="ptotal" use:bumpOnChange={turnTotal(input)}>{turnTotal(input)}</span>
        </div>
        <div class="row" style="gap: 10px; align-items: center; flex-wrap: wrap">
          <div class="chips">
            {#each chipMultipliers as m (m)}
              <button type="button" class="chip" onclick={() => addPoints(m)}>+{m}</button>
            {/each}
          </div>
          <Stepper bind:value={input.points} min={0} max={400} label="Word value" />
        </div>
      </div>

      <button type="button" class="bingo" class:on={input.bingo} onclick={toggleBingo}>
        <span class="bmark" aria-hidden="true">{input.bingo ? '✓' : '🎉'}</span>
        <span class="btext">
          <strong>Bingo — all 7 tiles</strong>
          <span class="bsub">Adds +{BINGO_BONUS} on top of the word value</span>
        </span>
      </button>

      <div class="row foot">
        <button type="button" class="btn small ghost" onclick={() => (showLetters = !showLetters)}>
          {showLetters ? 'Hide letter values' : '🔤 Letter values'}
        </button>
      </div>
      {#if showLetters}
        <div class="letters">
          {#each LETTER_GROUPS as g (g.value)}
            <div class="lrow">
              <span class="lval">{g.value}</span>
              <span class="lletters">{g.letters}</span>
            </div>
          {/each}
          <div class="lrow">
            <span class="lval">0</span>
            <span class="lletters">blank</span>
          </div>
        </div>
      {/if}
    </section>
  {:else if isFinalTally(input)}
    {@const fin = input}
    <section class="panel">
      <p class="sub">Who went out — emptied their rack, with the bag empty?</p>
      <div class="players" role="radiogroup" aria-label="Who went out">
        {#each ctx.players as p (p.id)}
          {@const on = fin.finisherId === p.id}
          <button
            type="button"
            role="radio"
            aria-checked={on}
            class="player"
            class:on
            onclick={() => setFinisher(p.id)}
          >
            <Avatar name={p.name} color={p.color} />
            <span class="pname">{p.name}</span>
            {#if on}<span class="badge">went out</span>{/if}
          </button>
        {/each}
      </div>

      {#if fin.finisherId}
        <p class="finisher-note">
          <strong>{nameOf(fin.finisherId)}</strong> gets the sum of everyone else's leftover
          tiles. Enter what's left on each other rack below.
        </p>
        <div class="racks">
          {#each ctx.players.filter((p) => p.id !== fin.finisherId) as p (p.id)}
            <div class="rrow">
              <span class="row" style="gap: 8px; min-width: 0">
                <Avatar name={p.name} color={p.color} />
                <strong class="rname">{p.name}</strong>
              </span>
              <Stepper
                bind:value={fin.remaining[p.id]}
                min={0}
                max={100}
                label={`${p.name} unplayed tile value`}
              />
            </div>
          {/each}
        </div>
        <p class="swing">
          <strong>{nameOf(fin.finisherId)}</strong> gains
          <span class="num" use:bumpOnChange={swing}>+{swing}</span>
          from everyone else's racks.
        </p>
      {:else}
        <p class="finisher-note muted">Pick the player who finished first.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .head {
    align-items: center;
  }
  .mode-toggle {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .mode-btn {
    display: inline-flex;
    align-items: center;
    min-height: 46px;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .mode-btn.on {
    background: var(--surface-3);
    border-color: var(--primary);
    box-shadow: inset 0 0 0 1px var(--primary);
    color: var(--primary);
  }
  .mode-btn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .panel {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sub {
    margin: 0;
    font-weight: 700;
  }
  .players {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .player {
    flex: 1 1 140px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .player.on {
    background: var(--surface-3);
    border-color: var(--primary);
    box-shadow: inset 3px 0 0 var(--primary);
  }
  .player:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .pname {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--primary);
    color: #fff;
  }
  .entry {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .plabel {
    font-weight: 700;
  }
  .ptotal {
    font-weight: 800;
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
  }
  .chips {
    display: flex;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 46px;
    min-height: 46px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .chip:hover {
    background: var(--surface-3);
    border-color: var(--primary);
  }
  .chip:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .bingo {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 8px 12px;
    text-align: left;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  .bingo.on {
    border-color: var(--accent, var(--good));
    background: color-mix(in srgb, var(--accent, var(--good)) 16%, var(--surface));
  }
  .bingo:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .bmark {
    font-size: 1.25rem;
    line-height: 1;
  }
  .btext {
    display: flex;
    flex-direction: column;
  }
  .bsub {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .foot {
    justify-content: flex-end;
  }
  .letters {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    font-size: 0.9rem;
  }
  .lrow {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
  .lval {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    min-width: 1.5em;
    text-align: right;
    color: var(--primary);
  }
  .lletters {
    color: var(--muted);
    letter-spacing: 0.05em;
  }
  .finisher-note {
    margin: 0;
    font-size: 0.9rem;
    color: var(--muted);
    padding: 9px 12px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px dashed var(--border);
  }
  .finisher-note strong {
    color: var(--text);
  }
  .racks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    flex-wrap: wrap;
  }
  .rname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .swing {
    margin: 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .swing .num {
    color: var(--good);
  }
  .help {
    white-space: pre-wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
    font-size: 0.9rem;
    margin: 0;
    font-family: inherit;
    color: var(--muted);
  }
</style>
