<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import { hearts } from './index';
  import HeartsMeter from './HeartsMeter.svelte';
  import MoonRise from './MoonRise.svelte';
  import PassRibbon from './PassRibbon.svelte';
  import {
    HEARTS_TOTAL,
    QUEEN_POINTS,
    endgameInfo,
    heartsRemaining,
    heartsTotal,
    outcomeFor,
    passingFor,
    previewDelta,
    readConfig,
    shooter,
    wrongWayPlayers,
    type HeartsInput,
    type MoonRule,
  } from './logic';

  let { input = $bindable(), ctx }: { input: HeartsInput; ctx: RoundContext } = $props();

  if (input.wrongWayPlayerIds == null) input.wrongWayPlayerIds = [];

  const cfg = $derived(readConfig(ctx.config));
  const variantJack = $derived(cfg.variantJack);
  const ids = $derived(ctx.players.map((p) => p.id));
  const wrongWay = $derived(new Set(wrongWayPlayers(input)));
  const priorWrongWay = $derived.by(() =>
    ctx.players
      .map((player) => ({
        player,
        rounds: ctx.rounds
          .filter((round) => round.index !== ctx.roundIndex)
          .filter((round) => wrongWayPlayers(round.input as HeartsInput).includes(player.id))
          .map((round) => round.index + 1)
          .sort((a, b) => a - b),
      }))
      .filter((entry) => entry.rounds.length > 0),
  );

  const pass = $derived(
    cfg.passing ? passingFor(ctx.roundIndex, ids.length, cfg.passCardCount) : null,
  );

  // How close the game is to ending, from the standings going into this hand. The
  // strip stays hidden early and only surfaces as the finish nears (or a single
  // hand could trip it), so the shoot-the-moon call gains real stakes late-game.
  const endgame = $derived(endgameInfo(ctx.totals, ids, ctx.config));
  const atRiskName = $derived(ctx.players.find((p) => p.id === endgame.atRiskId)?.name ?? '');
  const showEndgame = $derived(
    endgame.imminent || endgame.reached || endgame.atRiskTotal >= endgame.end * 0.6,
  );

  const placed = $derived(heartsTotal(input));
  const remaining = $derived(heartsRemaining(input));
  // The full penalty pool for the meter: hearts placed + the Queen's 13 once she lands.
  const points = $derived(placed + (input.queen ? QUEEN_POINTS : 0));
  const moon = $derived(shooter(input));
  const moonName = $derived(ctx.players.find((p) => p.id === moon)?.name ?? '');
  const moonChoicePending = $derived(
    !!moon && input.moonRule !== 'subtract' && input.moonRule !== 'add26',
  );
  const swing = $derived(
    input.moonRule === 'subtract'
      ? `${moonName} takes −26`
      : input.moonRule === 'add26'
        ? 'everyone else takes +26'
        : 'choose how it scores below',
  );

  const previews = $derived(
    Object.fromEntries(ids.map((id) => [id, previewDelta(input, id, ids, ctx.config)])),
  );
  const outcomes = $derived(
    Object.fromEntries(ids.map((id) => [id, outcomeFor(input, id, ids, ctx.config)])),
  );

  let showHelp = $state(false);
  let showOtherStats = $state(wrongWayPlayers(input).length > 0);
  let moonToken = $state(0);
  let prevMoon: string | null = null;
  let ready = false;

  // Prime the moon baseline on first render so re-opening a round that already
  // holds a moon preserves its choice and doesn't celebrate on mount. After that,
  // any newly detected shooter must make their own scoring choice.
  $effect(() => {
    if (!ready) {
      prevMoon = moon;
      ready = true;
      return;
    }
    if (moon && moon !== prevMoon) {
      input.moonRule = undefined;
      moonToken += 1;
      haptic('win');
    }
    prevMoon = moon;
  });

  const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0');

  function setQueen(id: string) {
    const on = input.queen !== id;
    input.queen = on ? id : null;
    if (on) haptic('tick'); // a small beat of dread as the Queen lands
  }
  function setJack(id: string) {
    input.jack = input.jack === id ? null : id;
    haptic('tick');
  }
  function takeRest(id: string) {
    if (remaining <= 0) return;
    input.hearts[id] = Math.min(HEARTS_TOTAL, (Number(input.hearts[id]) || 0) + remaining);
    // "The rest" sweeps up the still-unclaimed ♠Q too; an explicit pick stands.
    if (input.queen === null) input.queen = id;
    haptic('tick');
  }
  function shootMoon(id: string) {
    for (const p of ctx.players) input.hearts[p.id] = p.id === id ? HEARTS_TOTAL : 0;
    input.queen = id;
  }
  function setMoonRule(rule: MoonRule) {
    input.moonRule = rule;
    haptic('tick');
  }
  function toggleWrongWay(id: string) {
    const current = wrongWayPlayers(input);
    input.wrongWayPlayerIds = current.includes(id)
      ? current.filter((playerId) => playerId !== id)
      : [...current, id];
    haptic('tick');
  }
  // Whether the draft holds anything worth clearing — gates the "Clear hand" reset
  // so it only appears once you've started entering, never on an untouched round.
  const dirty = $derived(
    placed > 0 || input.queen !== null || input.jack !== null || wrongWay.size > 0,
  );
  function clearHand() {
    for (const id of ids) input.hearts[id] = 0;
    input.queen = null;
    input.jack = null;
    input.moonRule = undefined; // drop any per-round moon pick with the rest of the hand
    input.wrongWayPlayerIds = [];
    haptic('undo'); // a gentle reversal beat — the whole hand goes back to zero
  }
</script>

<div class="stack sky-stage">
  <MoonRise token={moonToken} />

  {#if pass}
    <PassRibbon info={pass} hand={ctx.roundIndex + 1} />
  {/if}

  <HeartsMeter {points} moonReady={!!moon} />

  {#if showEndgame}
    <div class="endgame" class:hot={endgame.imminent || endgame.reached} role="status">
      <span class="ic" aria-hidden="true"
        >{endgame.reached ? '🏁' : endgame.imminent ? '⚠️' : '🎯'}</span
      >
      <span class="txt">
        {#if endgame.reached}
          <strong>{atRiskName} reached {endgame.end}</strong> — this game can finish now.
        {:else if endgame.imminent}
          <strong>One hand could end it.</strong>
          {atRiskName} is at <span class="num">{endgame.atRiskTotal}</span> — just
          <span class="num">{endgame.toEnd}</span> from the {endgame.end} that ends the game.
        {:else}
          Ends at {endgame.end} · {atRiskName} is closest at
          <span class="num">{endgame.atRiskTotal}</span>
          <span class="dim">({endgame.toEnd} to go)</span>
        {/if}
      </span>
    </div>
  {/if}

  <div class="row spread wrap">
    <span class="muted hint">Fewer points is better — dodge the ♥ and the ♠Q.</span>
    <span class="row" style="gap: 8px">
      {#if dirty}
        <button type="button" class="btn small ghost" onclick={clearHand}>Clear hand</button>
      {/if}
      <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
        {showHelp ? 'Hide rules' : 'How to play'}
      </button>
    </span>
  </div>

  {#if showHelp}
    <pre class="help">{hearts.help}</pre>
  {/if}

  {#if moon}
    <div class="moon-banner" role="region" aria-label="Shooting the moon">
      <span class="ic" aria-hidden="true">🌙</span>
      <div class="moon-body">
        <span><strong>{moonName} is shooting the moon!</strong> — {swing}.</span>
        <div class="moon-choice" role="group" aria-label="How this moon scores">
          <button
            type="button"
            class="btn small ghost"
            aria-pressed={input.moonRule === 'add26'}
            onclick={() => setMoonRule('add26')}>Everyone else +26</button
          >
          <button
            type="button"
            class="btn small ghost"
            aria-pressed={input.moonRule === 'subtract'}
            onclick={() => setMoonRule('subtract')}>{moonName} takes −26</button
          >
        </div>
      </div>
    </div>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const isShooter = moon === p.id}
    {@const tookLady = !moon && input.queen === p.id}
    {@const oc = outcomes[p.id]}
    {@const pts = previews[p.id]}
    <div class="prow" class:shooter={isShooter} class:lady={tookLady}>
      <div class="row spread" style="margin-bottom: 10px">
        <span class="row" style="gap: 8px; min-width: 0">
          <Avatar name={p.name} color={p.color} />
          <strong class="pname">{p.name}</strong>
        </span>
        <span class="preview-wrap">
          <span
            class="preview"
            class:score-good={!moonChoicePending && pts <= 0}
            class:score-bad={!moonChoicePending && pts > 0}
            >{moonChoicePending ? '—' : signed(pts)}</span
          >
          {#if moonChoicePending}
            <span class="outcome">🌙 awaiting choice</span>
          {:else}
            <span
              class="outcome"
              class:score-good={oc.kind === 'clean' || oc.kind === 'moon'}
              class:score-bad={oc.kind === 'lady' || (oc.kind === 'points' && pts > 0)}
              >{oc.emoji} {oc.label}</span
            >
          {/if}
        </span>
      </div>

      <div class="row" style="gap: 10px; align-items: center">
        <Stepper bind:value={input.hearts[p.id]} min={0} max={13} label={`${p.name} hearts`} />
        <button
          type="button"
          class="btn small ghost grow"
          onclick={() => takeRest(p.id)}
          disabled={remaining <= 0}
          title="Give every unplaced heart (and the ♠Q if unclaimed) to {p.name}"
        >
          ♥ Took the rest{remaining > 0 ? ` (${remaining})` : ''}
        </button>
      </div>

      <div class="cards">
        <button
          type="button"
          class="toggle queen"
          class:on={input.queen === p.id}
          aria-pressed={input.queen === p.id}
          onclick={() => setQueen(p.id)}
        >
          <span class="glyph">♠Q</span>
          <span class="sub">the Queen · +13</span>
        </button>
        {#if variantJack}
          <button
            type="button"
            class="toggle jack"
            class:on={input.jack === p.id}
            aria-pressed={input.jack === p.id}
            onclick={() => setJack(p.id)}
          >
            <span class="glyph">♦J</span>
            <span class="sub">−10</span>
          </button>
        {/if}
        <button
          type="button"
          class="toggle moon-btn"
          class:on={isShooter}
          aria-pressed={isShooter}
          onclick={() => shootMoon(p.id)}
          title="{p.name} took all 13 hearts and the ♠Q"
        >
          <span class="glyph">🌙</span>
          <span class="sub">Shot the moon</span>
        </button>
      </div>
    </div>
  {/each}

  <details class="other-stats" bind:open={showOtherStats}>
    <summary>
      <span>↩ Other stats</span>
      <span class="summary-meta">
        {wrongWay.size > 0 ? `${wrongWay.size} marked` : 'optional'}
      </span>
    </summary>
    <div class="other-stats-body">
      <p class="muted small">Who tried to keep play moving the wrong way this hand?</p>
      <div class="wrong-way-players">
        {#each ctx.players as p (p.id)}
          <button
            type="button"
            class="wrong-way-player"
            class:on={wrongWay.has(p.id)}
            aria-pressed={wrongWay.has(p.id)}
            aria-label={`Mark ${p.name} for a wrong-way moment`}
            onclick={() => toggleWrongWay(p.id)}
          >
            <Avatar name={p.name} color={p.color} size={24} />
            <span>{p.name}</span>
            {#if wrongWay.has(p.id)}<span class="check" aria-hidden="true">↩</span>{/if}
          </button>
        {/each}
      </div>
      {#if priorWrongWay.length > 0}
        <div class="wrong-way-history">
          <span class="muted small">Earlier this game</span>
          {#each priorWrongWay as entry (entry.player.id)}
            <div class="history-row">
              <span>{entry.player.name}</span>
              <span class="muted rounds">
                {entry.rounds.length === 1 ? 'Round' : 'Rounds'}
                {entry.rounds.join(', ')}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </details>
</div>

<style>
  .sky-stage {
    position: relative;
  }
  .hint {
    font-size: 0.85rem;
  }
  .moon-banner {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--primary);
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary) 12%, var(--surface-2));
    font-size: 0.92rem;
  }
  .moon-banner .ic {
    font-size: 1.3rem;
    line-height: 1;
  }
  .moon-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  /* The shooter's call: everyone-else +26 vs take −26 yourself. A segmented pair;
     the active choice reads in Royal Violet as an accent (border + tint + weight),
     co-signalled by aria-pressed, never colour alone. */
  .moon-choice {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .moon-choice .btn[aria-pressed='true'] {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    font-weight: 700;
  }
  .moon-choice .btn {
    min-height: 46px;
  }
  /* Endgame tension: a quiet "the finish is near" line that escalates to caution
     amber when a single hand could end it. Co-signalled by the 🎯/⚠️/🏁 icon and
     the bold copy, never hue alone. */
  .endgame {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-2);
    font-size: 0.85rem;
    color: var(--muted);
  }
  .endgame .ic {
    font-size: 1.05rem;
    line-height: 1;
    flex: none;
  }
  .endgame .txt strong {
    color: var(--text);
  }
  .endgame .num {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: var(--text);
  }
  .endgame .dim {
    font-variant-numeric: tabular-nums;
  }
  .endgame.hot {
    border-color: color-mix(in srgb, var(--warn) 60%, var(--border));
    background: color-mix(in srgb, var(--warn) 12%, var(--surface-2));
    color: var(--text);
  }
  .endgame.hot .num {
    color: color-mix(in srgb, var(--warn) 85%, var(--text));
  }
  .prow {
    position: relative;
    z-index: 0;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
  }
  .prow.lady {
    border-color: color-mix(in srgb, var(--bad) 55%, var(--border));
    background: color-mix(in srgb, var(--bad) 8%, var(--surface-2));
  }
  .prow.shooter {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, var(--surface-2));
  }
  .pname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preview-wrap {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex: none;
  }
  .preview {
    font-weight: 800;
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
  }
  .outcome {
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--muted);
    text-align: right;
    white-space: nowrap;
  }
  .cards {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .toggle {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 46px;
    padding: 6px 9px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
  }
  .toggle .glyph {
    font-size: 0.98rem;
    line-height: 1.1;
  }
  .toggle .sub {
    color: var(--muted);
    font-weight: 500;
    font-size: 0.72rem;
  }
  /* The Queen is the bad card — dread reads in semantic coral, never gold. */
  .toggle.queen.on {
    background: color-mix(in srgb, var(--bad) 20%, var(--surface));
    border-color: var(--bad);
    color: var(--text);
  }
  .toggle.queen.on .sub {
    color: color-mix(in srgb, var(--bad) 85%, var(--text));
  }
  /* The Jack is the good card — a calm green nod when claimed. */
  .toggle.jack.on {
    background: color-mix(in srgb, var(--good) 20%, var(--surface));
    border-color: var(--good);
    color: var(--text);
  }
  .toggle.jack.on .sub {
    color: color-mix(in srgb, var(--good) 80%, var(--text));
  }
  .toggle.moon-btn.on {
    background: color-mix(in srgb, var(--primary) 22%, var(--surface));
    border-color: var(--primary);
  }
  .toggle.moon-btn.on .sub {
    color: color-mix(in srgb, var(--primary) 85%, var(--text));
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
  .other-stats {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    padding: 0 12px;
  }
  .other-stats summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 46px;
    cursor: pointer;
    list-style: none;
    font-weight: 700;
  }
  .other-stats summary::-webkit-details-marker {
    display: none;
  }
  .summary-meta {
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .other-stats[open] summary {
    border-bottom: 1px solid var(--border);
  }
  .other-stats-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 0 12px;
  }
  .other-stats-body p {
    margin: 0;
  }
  .wrong-way-players {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 8px;
  }
  .wrong-way-player {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    text-align: left;
  }
  .wrong-way-player.on {
    border-color: var(--warn);
    background: color-mix(in srgb, var(--warn) 12%, var(--surface));
  }
  .wrong-way-player:hover {
    background: var(--surface-3);
  }
  .other-stats summary:focus-visible,
  .wrong-way-player:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .wrong-way-player .check {
    margin-left: auto;
    color: var(--warn);
    font-weight: 800;
  }
  .wrong-way-history {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 2px;
  }
  .history-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.9rem;
  }
  .rounds {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
