<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import { hearts } from './index';
  import HeartsMeter from './HeartsMeter.svelte';
  import MoonRise from './MoonRise.svelte';
  import {
    HEARTS_TOTAL,
    heartsRemaining,
    heartsTotal,
    outcomeFor,
    previewDelta,
    readConfig,
    shooter,
    type HeartsInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: HeartsInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));
  const variantJack = $derived(cfg.variantJack);
  const ids = $derived(ctx.players.map((p) => p.id));

  const placed = $derived(heartsTotal(input));
  const remaining = $derived(heartsRemaining(input));
  const moon = $derived(shooter(input));
  const moonName = $derived(ctx.players.find((p) => p.id === moon)?.name ?? '');
  const swing = $derived(
    cfg.moonRule === 'subtract' ? `${moonName} takes −26` : 'everyone else takes +26',
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
    if (on) haptic('tick'); // a small beat of dread as the Lady lands
  }
  function setJack(id: string) {
    input.jack = input.jack === id ? null : id;
    haptic('tick');
  }
  function takeRest(id: string) {
    if (remaining <= 0) return;
    input.hearts[id] = Math.min(HEARTS_TOTAL, (Number(input.hearts[id]) || 0) + remaining);
    haptic('tick');
  }
  function shootMoon(id: string) {
    for (const p of ctx.players) input.hearts[p.id] = p.id === id ? HEARTS_TOTAL : 0;
    input.queen = id;
  }
</script>

<div class="stack sky-stage">
  <MoonRise token={moonToken} />

  <HeartsMeter {placed} moonReady={!!moon} />

  <div class="row spread wrap">
    <span class="muted hint">Fewer points is better — dodge the ♥ and the ♠Q.</span>
    <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
      {showHelp ? 'Hide rules' : 'How to play'}
    </button>
  </div>

  {#if showHelp}
    <pre class="help">{hearts.help}</pre>
  {/if}

  {#if moon}
    <div class="moon-banner" role="status">
      <span class="ic" aria-hidden="true">🌙</span>
      <span><strong>{moonName} is shooting the moon!</strong> — {swing}.</span>
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
            class:score-good={pts <= 0}
            class:score-bad={pts > 0}
          >{signed(pts)}</span>
          <span
            class="outcome"
            class:score-good={oc.kind === 'clean' || oc.kind === 'moon'}
            class:score-bad={oc.kind === 'lady' || (oc.kind === 'points' && pts > 0)}
          >{oc.emoji} {oc.label}</span>
        </span>
      </div>

      <div class="row" style="gap: 10px; align-items: center">
        <Stepper bind:value={input.hearts[p.id]} min={0} max={13} label={`${p.name} hearts`} />
        <button
          type="button"
          class="btn small ghost grow"
          onclick={() => takeRest(p.id)}
          disabled={remaining <= 0}
          title="Give every unplaced heart to {p.name}"
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
          <span class="sub">the Lady · +13</span>
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
          <span class="sub">shoot</span>
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
    align-items: center;
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
  /* The Lady is the bad card — dread reads in semantic coral, never gold. */
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
