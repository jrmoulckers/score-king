<script lang="ts">
  import type { ID, RoundContext } from '../../types';
  import { untrack } from 'svelte';
  import Avatar from '../../components/Avatar.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import { animateMotion } from '../../motion';
  import { haptic } from '../../haptics';
  import FluffCups from './FluffCups.svelte';
  import DiceBurst from './DiceBurst.svelte';
  import { fluff } from './index';
  import {
    diceRemaining,
    onesWild,
    palificoEnabled,
    palificoTriggeredBy,
    spotOnEnabled,
    startDice,
    type FluffInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: FluffInput; ctx: RoundContext } = $props();

  const start = $derived(startDice(ctx.config));
  const spotOn = $derived(spotOnEnabled(ctx.config));
  const wild = $derived(onesWild(ctx.config));
  const palifico = $derived(palificoEnabled(ctx.config));

  const ids = $derived(ctx.players.map((p) => p.id));

  // Dice each player still holds going into this challenge.
  const remaining = $derived(
    Object.fromEntries(ctx.players.map((p) => [p.id, diceRemaining(ctx.totals, p.id, start)])),
  );
  const aliveCount = $derived(ctx.players.filter((p) => remaining[p.id] > 0).length);

  let showHelp = $state(false);

  // Per-row burst tokens + flavor so the DiceBurst overlay replays on the right row when a
  // die is lost (🎲/💀), won back (🎲✨) or a game is decided (👑🎲🎉). Bumped imperatively
  // on tap for an immediate, tactile payoff — motion-only, so reduced motion just skips it.
  let rowToken = $state<Record<ID, number>>({});
  let rowKind = $state<Record<ID, 'lose' | 'gain' | 'crown'>>({});
  function fire(id: ID, kind: 'lose' | 'gain' | 'crown') {
    rowKind[id] = kind;
    rowToken[id] = (rowToken[id] ?? 0) + 1;
  }

  function pick(id: string) {
    if (remaining[id] <= 0) return;
    const deselect = input.playerId === id;
    input.playerId = deselect ? null : id;
    if (deselect) return;

    // A freshly picked player at full dice can only lose one, never gain.
    if (remaining[id] >= start && input.result === 'gain') input.result = 'lose';

    const gaining = input.result === 'gain';
    const before = remaining[id];
    const willBe = gaining ? Math.min(start, before + 1) : Math.max(0, before - 1);

    // Does this loss knock the table down to a single survivor? If so, crown them.
    const survivorsAfter = aliveCount - (!gaining && willBe === 0 ? 1 : 0);
    if (!gaining && willBe === 0 && survivorsAfter === 1) {
      const survivor = ctx.players.find((p) => p.id !== id && remaining[p.id] > 0);
      fire(id, 'lose');
      if (survivor) fire(survivor.id, 'crown');
      haptic('win');
    } else {
      fire(id, gaining ? 'gain' : 'lose');
      haptic(gaining ? 'tick' : 'save');
    }
  }

  // Replay the burst when the spot-on control flips lose ↔ gain for the *same* selected
  // player (the tap itself is handled in pick, so we only react to a real toggle).
  let prevSel: ID | null = untrack(() => input.playerId);
  let prevResult = untrack(() => input.result);
  $effect(() => {
    const pid = input.playerId;
    const r = input.result;
    if (pid && pid === prevSel && r !== prevResult) {
      fire(pid, r === 'gain' ? 'gain' : 'lose');
      haptic(r === 'gain' ? 'tick' : 'save');
    }
    prevSel = pid;
    prevResult = r;
  });

  const selName = $derived(ctx.players.find((p) => p.id === input.playerId)?.name ?? '');
  const before = $derived(input.playerId ? remaining[input.playerId] : 0);
  const after = $derived(
    input.playerId
      ? Math.max(0, Math.min(start, before + (input.result === 'gain' ? 1 : -1)))
      : 0,
  );
  const othersAlive = $derived(aliveCount - (input.playerId ? 1 : 0));

  // Live projection of every cup, folding in the pending pick, so the rack updates the
  // instant a player is tapped.
  const projRemaining = $derived(
    Object.fromEntries(
      ctx.players.map((p) => [p.id, p.id === input.playerId ? after : remaining[p.id]]),
    ),
  );
  const aliveAfter = $derived(ctx.players.filter((p) => projRemaining[p.id] > 0));
  const winnerId = $derived(aliveAfter.length === 1 ? aliveAfter[0].id : null);
  const winnerName = $derived(
    winnerId ? (ctx.players.find((p) => p.id === winnerId)?.name ?? null) : null,
  );

  const seats = $derived(
    ctx.players.map((p) => {
      const rem = projRemaining[p.id];
      const state: 'alive' | 'brink' | 'out' | 'winner' =
        winnerId === p.id ? 'winner' : rem <= 0 ? 'out' : rem === 1 ? 'brink' : 'alive';
      return { id: p.id, name: p.name, color: p.color, remaining: rem, start, state };
    }),
  );
  const cupsLeft = $derived(aliveAfter.length);
  const diceInPlay = $derived(ctx.players.reduce((sum, p) => sum + projRemaining[p.id], 0));

  // Palifico — the first player to drop to a single die. `palificoTriggeredBy` reads the
  // recorded history (so it survives a deleted round); the pending pick can *declare* it
  // live the moment a tap first brings someone to one die.
  const palificoAlreadyId = $derived(palifico ? palificoTriggeredBy(ctx.rounds, ids, start) : null);
  const pendingPalificoId = $derived(
    palifico && !palificoAlreadyId && input.playerId && input.result === 'lose' && after === 1
      ? input.playerId
      : null,
  );
  // Keep the callout up for the whole time the first one-die cup is on the brink.
  const palificoActiveId = $derived(
    pendingPalificoId ??
      (palificoAlreadyId && remaining[palificoAlreadyId] === 1 ? palificoAlreadyId : null),
  );
  const palificoName = $derived(
    palificoActiveId ? (ctx.players.find((p) => p.id === palificoActiveId)?.name ?? null) : null,
  );
  const isFreshPalifico = $derived(pendingPalificoId != null);

  // A little rotating table patter while nobody's picked yet — deterministic per challenge
  // so it doesn't flicker, whimsical without ever getting in the way of the tap.
  const PROMPTS = [
    'Cups up! 🎲 Who got caught bluffing?',
    'Someone’s fibbing… tap whoever lost the die.',
    'Liar, liar! 🔥 Who’s down a die?',
    'Reveal! Whose cup just lost one?',
    'Bluff called — who pays a die?',
    'Shake, peek, lie. Who slipped up? 🎲',
  ];
  const prompt = $derived(PROMPTS[ctx.roundIndex % PROMPTS.length]);

  // A single status line that co-signals with an emoji + words, never colour alone.
  const status = $derived.by(() => {
    if (!input.playerId) {
      return {
        tone: 'muted',
        text: spotOn ? `${prompt} (or tap someone who won one back)` : prompt,
      };
    }
    if (input.result === 'gain') {
      if (before >= start) {
        return { tone: 'bad', text: `${selName} already has all ${start} dice.` };
      }
      return { tone: 'good', text: `${selName} claws a die back · ${before} → ${after} 🎲✨` };
    }
    if (othersAlive === 0) {
      return { tone: 'bad', text: `Only ${selName} left — tap “Finish & record winner”. 🏆` };
    }
    if (after === 0) {
      return othersAlive === 1
        ? { tone: 'good', text: `${selName} is out — that’s game! Last cup standing wins. 🏆` }
        : { tone: 'bad', text: `${selName} is knocked out! 💀 (${before} → 0)` };
    }
    if (pendingPalificoId) {
      return { tone: 'plain', text: `${selName} drops to one die — Palifico! 🎯 (${before} → ${after})` };
    }
    return { tone: 'plain', text: `${selName} loses a die · ${before} → ${after}` };
  });

  // Svelte action: shake a row when a die is lost, a gentle pop when one is won back or a
  // game is crowned. Motion-only decoration — the burst, count and copy already carry the
  // outcome — so it auto-skips under reduced motion via animateMotion.
  function reactOn(node: HTMLElement, arg: { token: number; kind: 'lose' | 'gain' | 'crown' }) {
    let prev = arg.token;
    const run = (kind: 'lose' | 'gain' | 'crown') => {
      if (kind === 'lose') {
        animateMotion(
          node,
          { x: [0, -5, 5, -3, 3, 0], rotate: [0, -1.5, 1.5, -1, 0.6, 0] },
          { duration: 0.4, ease: 'easeOut' },
        );
      } else {
        animateMotion(
          node,
          { scale: [1, kind === 'crown' ? 1.18 : 1.1, 1] },
          { duration: kind === 'crown' ? 0.4 : 0.26, ease: 'easeOut' },
        );
      }
    };
    return {
      update(next: { token: number; kind: 'lose' | 'gain' | 'crown' }) {
        if (next.token !== prev && next.token > 0) run(next.kind);
        prev = next.token;
      },
    };
  }
</script>

<div class="stack">
  <FluffCups {seats} {cupsLeft} {diceInPlay} {wild} {palificoName} {winnerName} />

  <div class="row spread wrap" style="gap: 8px">
    <span class="pill" title={wild ? 'Ones count as any face' : 'Ones are just ones'}>
      {wild ? '⚀ ones wild' : '⚀ ones tame'}
    </span>
    <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
      Rules
    </button>
  </div>

  {#if showHelp}
    <pre class="help">{fluff.help}</pre>
  {/if}

  {#if palificoName}
    <div class="palifico" class:fresh={isFreshPalifico}>
      🎯
      <span>
        <strong>Palifico{isFreshPalifico ? ' declared!' : ''}</strong>
        {palificoName} is down to a single die — this round fixes one face and ones aren’t wild.
      </span>
    </div>
  {/if}

  <div class="roster">
    {#each ctx.players as p (p.id)}
      {@const left = remaining[p.id]}
      {@const out = left <= 0}
      {@const chosen = input.playerId === p.id}
      {@const brink = !out && left === 1}
      {@const isPali = palificoActiveId === p.id}
      <div class="prow-wrap" use:reactOn={{ token: rowToken[p.id] ?? 0, kind: rowKind[p.id] ?? 'lose' }}>
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
            {#if chosen}
              <span class="tag">{input.result === 'gain' ? '✓ won one back' : '✓ lost the die'}</span>
            {:else if isPali}
              <span class="tag pali">🎯 Palifico</span>
            {:else if brink}
              <span class="tag brink">😬 last die</span>
            {/if}
          </span>
          <span class="count">{out ? 'OUT 💀' : left}</span>
        </button>
        <DiceBurst token={rowToken[p.id] ?? 0} kind={rowKind[p.id] ?? 'lose'} />
      </div>
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
  .prow-wrap {
    position: relative;
    width: 100%;
    will-change: transform;
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
    border-radius: var(--radius);
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
  /* Brink / Palifico tags are informational, not the primary action — surface + semantic
     tint, co-signalled by emoji + words, never the shell's Royal Violet. */
  .tag.brink {
    background: color-mix(in srgb, var(--warn) 22%, var(--surface-3));
    color: var(--text);
  }
  .tag.pali {
    background: color-mix(in srgb, var(--warn) 30%, var(--surface-3));
    color: var(--text);
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
  /* Palifico callout — an amber-edged banner for Perudo's signature moment. The 🎯 and the
     words carry it (never colour alone); a fresh declaration deepens the edge a touch. */
  .palifico {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--warn) 9%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
    color: var(--text);
    font-size: 0.86rem;
    line-height: 1.35;
  }
  .palifico.fresh {
    border-color: color-mix(in srgb, var(--warn) 65%, var(--border));
    background: color-mix(in srgb, var(--warn) 14%, var(--surface));
  }
  .palifico strong {
    font-weight: 800;
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
