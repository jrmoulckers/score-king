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
    type HeartsInput,
    type MoonRule,
  } from './logic';

  let { input = $bindable(), ctx }: { input: HeartsInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));
  const variantJack = $derived(cfg.variantJack);
  const ids = $derived(ctx.players.map((p) => p.id));

  const pass = $derived(cfg.passing ? passingFor(ctx.roundIndex, ids.length) : null);

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
  // The shooter's live pick for this round, falling back to the game default.
  const effMoon = $derived<MoonRule>(
    input.moonRule === 'subtract' || input.moonRule === 'add26' ? input.moonRule : cfg.moonRule,
  );
  const swing = $derived(
    effMoon === 'subtract' ? `${moonName} takes −26` : 'everyone else takes +26',
  );

  const previews = $derived(
    Object.fromEntries(ids.map((id) => [id, previewDelta(input, id, ids, ctx.config)])),
  );
  const outcomes = $derived(
    Object.fromEntries(ids.map((id) => [id, outcomeFor(input, id, ids, ctx.config)])),
  );

  let showHelp = $state(false);
  let moonToken = $state(0);
  let prevMoon: string | null = null;
  let ready = false;

  // Prime the moon baseline on first render so re-opening a round that already
  // holds a moon doesn't fire the celebration on mount — only a fresh sweep does.
  $effect(() => {
    if (!ready) {
      prevMoon = moon;
      ready = true;
      return;
    }
    if (moon && moon !== prevMoon) {
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
    // Seed the per-round choice from the game default the first time a moon lands.
    if (input.moonRule !== 'add26' && input.moonRule !== 'subtract') input.moonRule = cfg.moonRule;
  }
  function setMoonRule(rule: MoonRule) {
    input.moonRule = rule;
    haptic('tick');
  }
  // Whether the draft holds anything worth clearing — gates the "Clear hand" reset
  // so it only appears once you've started entering, never on an untouched round.
  const dirty = $derived(placed > 0 || input.queen !== null || input.jack !== null);
  function clearHand() {
    for (const id of ids) input.hearts[id] = 0;
    input.queen = null;
    input.jack = null;
    input.moonRule = undefined; // drop any per-round moon pick with the rest of the hand
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
    <div class="moon-banner" role="status">
      <span class="ic" aria-hidden="true">🌙</span>
      <div class="moon-body">
        <span><strong>{moonName} is shooting the moon!</strong> — {swing}.</span>
        <div class="moon-choice" role="group" aria-label="How this moon scores">
          <button
            type="button"
            class="btn small ghost"
            aria-pressed={effMoon === 'add26'}
            onclick={() => setMoonRule('add26')}>Everyone else +26</button
          >
          <button
            type="button"
            class="btn small ghost"
            aria-pressed={effMoon === 'subtract'}
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
          <span class="preview" class:score-good={pts <= 0} class:score-bad={pts > 0}
            >{signed(pts)}</span
          >
          <span
            class="outcome"
            class:score-good={oc.kind === 'clean' || oc.kind === 'moon'}
            class:score-bad={oc.kind === 'lady' || (oc.kind === 'points' && pts > 0)}
            >{oc.emoji} {oc.label}</span
          >
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
          onclick={() => shootMoon(p.id)}
          title="{p.name} took all 13 hearts and the ♠Q"
        >
          <span class="glyph">🌙</span>
          <span class="sub">Shot the moon</span>
        </button>
      </div>
    </div>
  {/each}
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
</style>
