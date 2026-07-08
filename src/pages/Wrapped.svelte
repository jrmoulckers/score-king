<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { games } from '../lib/stores/games';
  import { players, activePlayers } from '../lib/stores/players';
  import { settings } from '../lib/stores/settings';
  import { setLeadMember } from '../lib/stores/identity';
  import { getModule } from '../lib/games/registry';
  import BackLink from '../lib/components/BackLink.svelte';
  import * as db from '../lib/storage/db';
  import Avatar from '../lib/components/Avatar.svelte';
  import type { Player, Round } from '../lib/types';
  import {
    computeStats,
    compareStats,
    assignPersona,
    computeBadges,
    newlyEarned,
    buildWrapped,
    buildRecap,
    type WrappedInput,
  } from '../lib/stats';

  const DAY = 86_400_000;

  let rounds = $state<Round[]>([]);
  let loaded = $state(false);
  onMount(async () => {
    rounds = await db.getAllRounds();
    loaded = true;
  });

  type Preset = 'year' | 'rolling' | 'tonight';
  let { initialPreset = 'year' }: { initialPreset?: Preset } = $props();
  let preset = $state<Preset>(untrack(() => initialPreset));
  let index = $state(0);

  const meId = $derived($settings.leadMemberId);
  const roast = $derived($settings.roastMode);
  const playerById = $derived(new Map<string, Player>($players.map((p) => [p.id, p])));
  const nameOf = (id: string): string => playerById.get(id)?.name ?? 'Someone';
  const gameName = (type: string): string => getModule(type)?.name ?? type;
  const gameEmoji = (type: string): string => getModule(type)?.emoji ?? '🎲';
  const gameStats = (type: string) => getModule(type)?.stats;

  /** Preset → window (+ comparison window for "vs last time" and card mode). */
  const cfg = $derived.by(() => {
    const now = Date.now();
    const d = new Date(now);
    if (preset === 'tonight') {
      const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return { range: { from, to: now }, prior: undefined, label: 'tonight', mode: 'recap' as const };
    }
    if (preset === 'rolling') {
      const from = now - 365 * DAY;
      return {
        range: { from, to: now },
        prior: { from: from - 365 * DAY, to: from },
        label: 'the last 12 months',
        mode: 'year' as const,
      };
    }
    const from = new Date(d.getFullYear(), 0, 1).getTime();
    const priorFrom = new Date(d.getFullYear() - 1, 0, 1).getTime();
    const priorTo = new Date(
      d.getFullYear() - 1,
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
    ).getTime();
    return {
      range: { from, to: now },
      prior: { from: priorFrom, to: priorTo },
      label: String(d.getFullYear()),
      mode: 'year' as const,
    };
  });

  const result = $derived(
    loaded && meId
      ? computeStats({ players: $players, games: $games, rounds }, { playerId: meId, range: cfg.range }, { gameStats })
      : undefined,
  );
  const me = $derived(meId && result ? result.perPlayer[meId] : undefined);
  const persona = $derived(me ? assignPersona(me) : undefined);
  const records = $derived(result?.records ?? []);
  const badges = $derived(me ? computeBadges(me, { records }) : []);

  // "New this window" = badges held now minus badges already held before it started.
  const beforeResult = $derived(
    loaded && meId && cfg.range.from !== undefined
      ? computeStats(
          { players: $players, games: $games, rounds },
          { playerId: meId, range: { to: cfg.range.from } },
          { gameStats },
        )
      : undefined,
  );
  const newBadges = $derived.by(() => {
    if (!me) return [];
    const before = beforeResult?.perPlayer[meId as string];
    const beforeBadges = before ? computeBadges(before, { records: beforeResult?.records ?? [] }) : [];
    return newlyEarned(badges, new Set(beforeBadges.map((b) => b.key)));
  });

  const priorResult = $derived(
    loaded && meId && cfg.prior
      ? computeStats({ players: $players, games: $games, rounds }, { playerId: meId, range: cfg.prior }, { gameStats })
      : undefined,
  );
  const prior = $derived(result && priorResult && meId ? compareStats(result, priorResult, meId) : undefined);

  const cards = $derived.by(() => {
    if (!me || !meId || !result) return [];
    const input: WrappedInput = {
      meId,
      me,
      result,
      persona,
      earnedBadges: badges,
      newBadges,
      prior,
      label: cfg.label,
      nameOf,
      gameName,
      gameEmoji,
      roast,
    };
    return cfg.mode === 'recap' ? buildRecap(input) : buildWrapped(input);
  });

  const clamped = $derived(Math.min(index, Math.max(0, cards.length - 1)));
  const card = $derived(cards[clamped]);

  const presetOptions: { key: Preset; label: string }[] = [
    { key: 'year', label: 'This year' },
    { key: 'rolling', label: 'Last 12 months' },
    { key: 'tonight', label: 'Tonight' },
  ];

  function choose(p: Preset) {
    preset = p;
    index = 0;
  }
  function prev() {
    if (clamped > 0) index = clamped - 1;
  }
  function next() {
    if (clamped < cards.length - 1) index = clamped + 1;
  }
  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'ArrowRight') next();
  }

  const chooserPlayers = $derived([...$activePlayers].sort((a, b) => a.name.localeCompare(b.name)));
</script>

<svelte:window onkeydown={onKey} />

<BackLink href="/stats" label="Stats" />
<h1 style="margin: 0 4px 8px">🎁 Wrapped</h1>

{#if !loaded}
  <div class="empty">Wrapping up your year…</div>
{:else if !meId}
  <!-- Personal-first: Wrapped is a portrait of you — pick who "you" are. -->
  <div class="card stack">
    <div class="section-title" style="margin: 0">Whose Wrapped?</div>
    <p class="muted" style="margin: 0">Pick your player to see your year in Score King. Stays on this device.</p>
    {#if chooserPlayers.length === 0}
      <div class="empty">Add a player first, then come back for your Wrapped.</div>
    {:else}
      <div class="stack" style="gap: 8px">
        {#each chooserPlayers as p (p.id)}
          <button class="picker row" onclick={() => setLeadMember(p.id)}>
            <Avatar name={p.name} color={p.color} size={32} />
            <span class="grow" style="text-align: left">{p.name}</span>
            <span aria-hidden="true">🎁</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <!-- Range presets -->
  <div class="row wrap seg" role="group" aria-label="Wrapped range">
    {#each presetOptions as o (o.key)}
      <button class="chip" class:on={preset === o.key} onclick={() => choose(o.key)}>{o.label}</button>
    {/each}
  </div>

  {#if cards.length === 0}
    <div class="empty">
      No finished games {preset === 'tonight' ? 'tonight' : `in ${cfg.label}`} yet — try another range or play a game.
    </div>
  {:else if card}
    <!-- Swipeable card story: manual advance (reduced-motion safe by default). -->
    <section class="stage" role="group" aria-roledescription="carousel" aria-label="Your Wrapped cards">
      {#key clamped}
        <article class="wcard" class:gold={card.gold} aria-live="polite">
          <span class="wc-emoji" aria-hidden="true">{card.emoji}</span>
          <h2 class="wc-head">{card.headline}</h2>
          {#if card.stats && card.stats.length > 0}
            <div class="wc-grid">
              {#each card.stats as s (s.label)}
                <div class="wc-cell">
                  <div class="wc-val tnum">{s.value}</div>
                  <div class="wc-lbl">{s.label}</div>
                </div>
              {/each}
            </div>
          {/if}
          {#if card.lines}
            <div class="wc-lines">
              {#each card.lines as line, i (i)}
                <p class="wc-line">{line}</p>
              {/each}
            </div>
          {/if}
        </article>
      {/key}
    </section>

    <!-- Progress + controls -->
    <div class="row spread controls">
      <button class="nav" onclick={prev} disabled={clamped === 0} aria-label="Previous card">←</button>
      <div class="dots" role="tablist" aria-label="Wrapped progress">
        {#each cards as c, i (c.key)}
          <button
            class="dot"
            class:on={i === clamped}
            role="tab"
            aria-selected={i === clamped}
            aria-label={`Card ${i + 1} of ${cards.length}`}
            onclick={() => (index = i)}
          >
            <span class="dot-mark" aria-hidden="true"></span>
          </button>
        {/each}
      </div>
      <button class="nav" onclick={next} disabled={clamped >= cards.length - 1} aria-label="Next card">→</button>
    </div>
    <p class="center muted sm counter">
      <span class="tnum">{clamped + 1}</span> / <span class="tnum">{cards.length}</span> · as {nameOf(meId)}
    </p>
  {/if}
{/if}

<style>
  .tnum {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .sm {
    font-size: 0.82rem;
  }

  .seg {
    gap: 6px;
    margin: 0 2px 10px;
  }
  .chip {
    min-height: 40px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .chip.on {
    background: var(--surface-3);
    color: var(--text);
    border-color: color-mix(in srgb, var(--text) 30%, var(--border));
  }

  /* The card stage — depth from the surface ramp, single soft lift. */
  .stage {
    outline: none;
  }
  .wcard {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 14px;
    min-height: 340px;
    padding: 40px 24px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    box-shadow: var(--shadow);
  }
  .wcard.gold {
    border-color: var(--accent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 14%, var(--surface-2)), var(--surface-2));
  }
  .wc-emoji {
    font-size: 3.4rem;
    line-height: 1;
  }
  .wc-head {
    margin: 0;
    font-size: 1.9rem;
    font-weight: 800;
    line-height: 1.15;
  }
  .wcard.gold .wc-head {
    color: var(--accent-ink);
  }
  .wc-lines {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .wc-line {
    margin: 0;
    font-size: 1.05rem;
    color: var(--muted);
    line-height: 1.4;
  }
  .wc-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px 10px;
    width: 100%;
    max-width: 340px;
    margin-top: 4px;
  }
  .wc-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .wc-val {
    font-size: 1.6rem;
  }
  .wc-lbl {
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .controls {
    margin: 12px 2px 4px;
    gap: 10px;
  }
  .nav {
    min-width: 46px;
    min-height: 46px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font-size: 1.2rem;
    cursor: pointer;
  }
  .nav:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .dots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 2px;
  }
  .dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 32px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
  .dot-mark {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--border);
    transition: transform 0.15s ease, background 0.15s ease;
  }
  .dot.on .dot-mark {
    background: var(--text);
    transform: scale(1.5);
  }
  .counter {
    margin: 4px 0 0;
  }

  /* Whimsical entrance — transform/opacity only, disabled under reduced motion. */
  @media (prefers-reduced-motion: no-preference) {
    .wcard {
      animation: wc-in 0.28s ease-out;
    }
  }
  @keyframes wc-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.99);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .picker {
    gap: 10px;
    width: 100%;
    min-height: 46px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }
  .picker:hover {
    background: var(--surface-3);
  }
</style>
