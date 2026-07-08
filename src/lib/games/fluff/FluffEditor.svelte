<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import { fluff } from './index';
  import {
    diceRemaining,
    onesWild,
    spotOnEnabled,
    startDice,
    type FluffInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: FluffInput; ctx: RoundContext } = $props();

  const start = $derived(startDice(ctx.config));
  const spotOn = $derived(spotOnEnabled(ctx.config));
  const wild = $derived(onesWild(ctx.config));

  // Dice each player still holds going into this challenge.
  const remaining = $derived(
    Object.fromEntries(ctx.players.map((p) => [p.id, diceRemaining(ctx.totals, p.id, start)])),
  );
  const inPlay = $derived(ctx.players.reduce((sum, p) => sum + remaining[p.id], 0));
  const aliveCount = $derived(ctx.players.filter((p) => remaining[p.id] > 0).length);

  let showHelp = $state(false);

  function pick(id: string) {
    if (remaining[id] <= 0) return;
    input.playerId = input.playerId === id ? null : id;
    // A freshly picked player at full dice can only lose one, never gain.
    if (input.playerId && remaining[input.playerId] >= start && input.result === 'gain') {
      input.result = 'lose';
    }
  }

  const selName = $derived(ctx.players.find((p) => p.id === input.playerId)?.name ?? '');
  const before = $derived(input.playerId ? remaining[input.playerId] : 0);
  const after = $derived(
    input.playerId
      ? Math.max(0, Math.min(start, before + (input.result === 'gain' ? 1 : -1)))
      : 0,
  );
  const othersAlive = $derived(aliveCount - (input.playerId ? 1 : 0));

  // A single status line that co-signals with an emoji + words, never colour alone.
  const status = $derived.by(() => {
    if (!input.playerId) {
      return {
        tone: 'muted',
        text: spotOn
          ? 'Tap whoever lost the die this challenge — or won one back.'
          : 'Tap whoever lost the die this challenge.',
      };
    }
    if (input.result === 'gain') {
      if (before >= start) {
        return { tone: 'bad', text: `${selName} already has all ${start} dice.` };
      }
      return { tone: 'good', text: `${selName} wins a die back · ${before} → ${after} 🎲` };
    }
    if (othersAlive === 0) {
      return { tone: 'bad', text: `Only ${selName} left — tap “Finish & record winner”. 🏆` };
    }
    if (after === 0) {
      return othersAlive === 1
        ? { tone: 'good', text: `${selName} is out — that’s game! Last cup standing wins. 🏆` }
        : { tone: 'bad', text: `${selName} is knocked out! 💀 (${before} → 0)` };
    }
    return { tone: 'plain', text: `${selName} loses a die · ${before} → ${after}` };
  });
</script>

<div class="stack">
  <div class="row spread wrap" style="gap: 8px">
    <span class="row wrap" style="gap: 6px">
      <span class="pill">🎲 {inPlay} {inPlay === 1 ? 'die' : 'dice'} in play</span>
      <span class="pill">{aliveCount} still in</span>
    </span>
    <span class="row" style="gap: 6px">
      <span class="pill" title={wild ? 'Ones count as any face' : 'Ones are just ones'}>
        {wild ? '⚀ ones wild' : '⚀ ones tame'}
      </span>
      <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
        Rules
      </button>
    </span>
  </div>

  {#if showHelp}
    <pre class="help">{fluff.help}</pre>
  {/if}

  <div class="roster">
    {#each ctx.players as p (p.id)}
      {@const left = remaining[p.id]}
      {@const out = left <= 0}
      {@const chosen = input.playerId === p.id}
      <button
        type="button"
        class="prow"
        class:chosen
        class:out
        aria-pressed={chosen}
        disabled={out}
        onclick={() => pick(p.id)}
      >
        <span class="who">
          <Avatar name={p.name} color={p.color} />
          <span class="name" class:struck={out}>{p.name}</span>
          {#if chosen}<span class="tag">{input.result === 'gain' ? '✓ won one back' : '✓ lost the die'}</span>{/if}
        </span>
        <span class="dice">
          <span class="pips" aria-hidden="true">
            {#each Array.from({ length: start }) as _, i (i)}
              <span class="pip" class:filled={i < left}></span>
            {/each}
          </span>
          <span class="count">{out ? 'OUT 💀' : left}</span>
        </span>
      </button>
    {/each}
  </div>

  {#if spotOn && input.playerId}
    <Segmented
      label="What happened to {selName}"
      bind:value={input.result}
      options={[
        { value: 'lose', label: '🎲➖ Lost a die' },
        { value: 'gain', label: '🎲➕ Won one back' },
      ]}
    />
  {/if}

  <p class="status" class:score-good={status.tone === 'good'} class:score-bad={status.tone === 'bad'} class:muted={status.tone === 'muted'}>
    {status.text}
  </p>
</div>

<style>
  .roster {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .prow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 46px;
    padding: 10px 12px;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--text);
    cursor: pointer;
    font: inherit;
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.05s ease;
  }
  .prow:hover:not(:disabled) {
    background: var(--surface-3);
  }
  .prow:active:not(:disabled) {
    transform: translateY(1px);
  }
  .prow:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .prow.chosen {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, var(--surface-2));
    box-shadow: inset 0 0 0 1px var(--primary);
  }
  .prow.chosen:hover:not(:disabled) {
    background: color-mix(in srgb, var(--primary) 16%, var(--surface-2));
  }
  .prow.out {
    cursor: default;
    opacity: 0.55;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .name {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name.struck {
    text-decoration: line-through;
    text-decoration-thickness: 1px;
  }
  .tag {
    flex: none;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--primary);
    color: #fff;
  }
  .dice {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
  }
  .pips {
    display: inline-flex;
    gap: 3px;
  }
  .pip {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 1px solid currentColor;
    opacity: 0.4;
  }
  .pip.filled {
    background: currentColor;
    opacity: 1;
  }
  .count {
    min-width: 3.4em;
    text-align: right;
    white-space: nowrap;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .status {
    margin: 2px 2px 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .status.score-good,
  .status.score-bad {
    font-weight: 700;
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
</style>
