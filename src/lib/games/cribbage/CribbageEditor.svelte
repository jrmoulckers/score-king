<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { bumpOnChange } from '../../motion';
  import { haptic } from '../../haptics';
  import { cribbage } from './index';
  import PegBoard from './PegBoard.svelte';
  import CountAssist from './CountAssist.svelte';
  import {
    HEELS_POINTS,
    breakdownTotal,
    emptyEntry,
    finishView,
    leaders,
    readConfig,
    resolveMode,
    scoreDeal,
    skunkLabel,
    unitFor,
    unitTotals,
    unitsFor,
    type Breakdown,
    type CribbageInput,
    type Unit,
  } from './logic';

  let { input = $bindable(), ctx }: { input: CribbageInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));
  const mode = $derived(resolveMode(ctx.config, ctx.players.length));
  const partners = $derived(mode === 'partners');
  const units = $derived(unitsFor(ctx.players, mode));
  const byId = $derived(new Map(ctx.players.map((p) => [p.id, p])));

  const dealerUnit = $derived(unitFor(units, input.dealerId ?? null));
  const dealerName = $derived(
    input.dealerId ? (byId.get(input.dealerId)?.name ?? 'the dealer') : 'nobody yet',
  );

  const results = $derived(scoreDeal(input, ctx.players, ctx.config));
  const before = $derived(unitTotals(units, ctx.totals));
  const leaderKeys = $derived(leaders(before));
  const projected = $derived(
    Object.fromEntries(
      units.map((u) => [u.key, (before[u.key] ?? 0) + (results[u.key]?.total ?? 0)]),
    ),
  );
  /** The finish, if this deal ends it — the skunk moment lives here. */
  const finish = $derived(cfg.skunks ? finishView(projected, cfg.target) : null);
  const finishCopy = $derived(finish ? skunkLabel(finish.kind) : null);

  const unitName = (u: Unit): string =>
    u.memberIds
      .map((id) => byId.get(id)?.name)
      .filter(Boolean)
      .join(' & ') || `Team ${u.index + 1}`;

  let showHelp = $state(false);
  /** Which unit (and which pile) has the counting drawer open — one at a time. */
  let assist = $state<string | null>(null);

  function setDealer(id: string) {
    if (input.dealerId === id) return;
    input.dealerId = id;
    haptic('tick');
  }

  function toggleHeels() {
    input.heels = !input.heels;
    haptic('tick');
  }

  function entryFor(key: string) {
    if (!input.entries[key]) input.entries[key] = emptyEntry();
    return input.entries[key];
  }

  function applyCount(key: string, pile: 'hand' | 'crib', b: Breakdown) {
    entryFor(key)[pile] = { ...b };
    assist = null;
  }

  /** Everything the draft holds, so "Clear deal" only appears once it's worth it. */
  const dirty = $derived(input.heels || units.some((u) => (results[u.key]?.total ?? 0) > 0));

  function clearDeal() {
    for (const u of units) input.entries[u.key] = emptyEntry();
    input.heels = false;
    assist = null;
    haptic('undo');
  }

  const COUNTS = [
    { key: 'fifteens' as const, label: 'Fifteens', hint: '×2', max: 8 },
    { key: 'pairs' as const, label: 'Pairs', hint: '×2', max: 6 },
    { key: 'runs' as const, label: 'Runs', hint: 'points', max: 15 },
    { key: 'flush' as const, label: 'Flush', hint: 'points', max: 5 },
    { key: 'nob' as const, label: 'Nob', hint: '🂻 suit', max: 1 },
  ];
</script>

<div class="stack">
  <!-- Whose deal it is, front and centre: the crib follows the dealer, and that's
       the single most-argued thing at a cribbage table. -->
  <section class="deal">
    <div class="row spread wrap head">
      <h3 class="ttl">🂠 Hand {ctx.roundIndex + 1} — whose deal?</h3>
      <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
        How to count
      </button>
    </div>

    <div class="dealers" role="radiogroup" aria-label="Whose deal it is">
      {#each ctx.players as p (p.id)}
        {@const on = input.dealerId === p.id}
        <button
          type="button"
          role="radio"
          aria-checked={on}
          class="dealer"
          class:on
          onclick={() => setDealer(p.id)}
        >
          <Avatar name={p.name} color={p.color} />
          <span class="dname">{p.name}</span>
          {#if on}<span class="badge">deals</span>{/if}
        </button>
      {/each}
    </div>

    <p class="crib-note" use:bumpOnChange={input.dealerId}>
      <span aria-hidden="true">🂠</span>
      <strong>{dealerName}</strong> deals — the crib is
      <strong>{dealerName}'s</strong>, and so is his heels.
    </p>

    <button type="button" class="heels" class:on={input.heels} onclick={toggleHeels}>
      <span class="hmark" aria-hidden="true">{input.heels ? '✓' : '🂻'}</span>
      <span class="htext">
        <strong>His heels</strong>
        <span class="hsub">The cut turned a jack — {dealerName} takes +{HEELS_POINTS}</span>
      </span>
    </button>

    {#if showHelp}
      <pre class="help">{cribbage.help}</pre>
    {/if}
  </section>

  {#if finish && finishCopy && finish.kind !== 'none'}
    <p class="skunk" class:double={finish.kind === 'double'} role="status">
      <span class="sk-emoji" aria-hidden="true">{finishCopy.emoji}</span>
      <span>
        <strong>{finishCopy.headline}</strong>
        {finishCopy.cheer} Loser finishes on {finish.loserScore}.
      </span>
    </p>
  {/if}

  {#each units as u (u.key)}
    {@const res = results[u.key] ?? {
      pegging: 0,
      hand: 0,
      crib: 0,
      heels: 0,
      isDealer: false,
      total: 0,
    }}
    {@const entry = input.entries[u.key] ?? emptyEntry()}
    {@const isDealer = dealerUnit?.key === u.key}
    <section class="unit" class:dealing={isDealer}>
      <div class="uhead row spread wrap">
        <span class="who row wrap">
          {#if partners}
            <span class="team">Team {u.index + 1}</span>
          {:else}
            {@const p = byId.get(u.memberIds[0])}
            {#if p}<Avatar name={p.name} color={p.color} />{/if}
          {/if}
          <strong class="uname">{unitName(u)}</strong>
          {#if isDealer}<span class="crib-flag">🂠 dealer · holds the crib</span>{/if}
        </span>
        <span class="proj" use:bumpOnChange={res.total}>+{res.total}</span>
      </div>

      <PegBoard
        before={before[u.key] ?? 0}
        delta={res.total}
        target={cfg.target}
        leading={leaderKeys.has(u.key)}
        showSkunkLine={cfg.skunks}
      />

      <div class="pile">
        <div class="prow row spread wrap">
          <span class="plabel">📌 Pegged in the play</span>
          <Stepper
            bind:value={entry.pegging}
            min={0}
            max={60}
            label={`${unitName(u)} pegging points`}
          />
        </div>
      </div>

      {#snippet counter(key: string, pile: 'hand' | 'crib', title: string, b: Breakdown)}
        <div class="pile">
          <div class="prow row spread wrap">
            <span class="plabel">{title}</span>
            <span class="ptotal">{breakdownTotal(b)}</span>
          </div>
          <div class="counts">
            {#each COUNTS as f (f.key)}
              <label class="f">
                <span class="flabel">{f.label} <span class="fhint">{f.hint}</span></span>
                <Stepper
                  bind:value={b[f.key]}
                  min={0}
                  max={f.max}
                  label={`${unitName(u)} ${title} ${f.label}`}
                />
              </label>
            {/each}
          </div>
          <div class="row assist-row">
            <button
              type="button"
              class="btn small ghost"
              aria-expanded={assist === `${key}:${pile}`}
              onclick={() => (assist = assist === `${key}:${pile}` ? null : `${key}:${pile}`)}
            >
              {assist === `${key}:${pile}` ? 'Close the counter' : '🔍 Count it for me'}
            </button>
          </div>
          {#if assist === `${key}:${pile}`}
            <CountAssist
              label={title}
              isCrib={pile === 'crib'}
              onuse={(next) => applyCount(key, pile, next)}
              onheels={(h) => (input.heels = h)}
            />
          {/if}
        </div>
      {/snippet}

      {@render counter(u.key, 'hand', `${unitName(u)}'s hand`, entry.hand)}

      {#if isDealer}
        {@render counter(u.key, 'crib', `${unitName(u)}'s crib`, entry.crib)}
      {/if}

      <p class="tally">
        {res.pegging} pegged · {res.hand} in hand{#if isDealer}
          · {res.crib} in the crib{#if res.heels}
            · {res.heels} for his heels{/if}{/if}
        — <strong>+{res.total}</strong>
      </p>
    </section>
  {/each}

  {#if dirty}
    <div class="row foot">
      <button type="button" class="btn small ghost" onclick={clearDeal}>Clear this deal</button>
    </div>
  {/if}
</div>

<style>
  .deal {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    align-items: center;
  }
  .ttl {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }
  .dealers {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .dealer {
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
    transition: background var(--dur-base) var(--ease-standard);
  }
  .dealer:hover {
    background: var(--surface-3);
  }
  /* The dealer chip is a selection, not the screen's primary action, so it reads
     as a filled, bordered state carrying an explicit "deals" badge — never colour
     on its own. */
  .dealer.on {
    background: var(--surface-3);
    border-color: var(--primary);
    box-shadow: inset 3px 0 0 var(--primary);
  }
  .dealer:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .dname {
    flex: 1;
    text-align: left;
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
  .crib-note {
    margin: 0;
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 0.9rem;
    color: var(--muted);
    padding: 9px 12px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px dashed var(--border);
  }
  .crib-note strong {
    color: var(--text);
  }
  .heels {
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
  .heels.on {
    border-color: var(--good);
    background: color-mix(in srgb, var(--good) 12%, var(--surface));
  }
  .heels:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .hmark {
    font-size: 1.25rem;
    line-height: 1;
  }
  .htext {
    display: flex;
    flex-direction: column;
  }
  .hsub {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .skunk {
    margin: 0;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 11px 12px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--warn) 14%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
    font-size: 0.9rem;
  }
  .skunk.double {
    background: color-mix(in srgb, var(--bad) 14%, var(--surface));
    border-color: color-mix(in srgb, var(--bad) 45%, var(--border));
  }
  .sk-emoji {
    font-size: 1.25rem;
    line-height: 1.2;
  }
  .unit {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  /* The dealing side is framed, not merely tinted — the crib is the one thing a
     scorekeeper must never get wrong. */
  .unit.dealing {
    border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 20%, transparent);
  }
  .uhead {
    align-items: center;
  }
  .who {
    gap: 8px;
    align-items: center;
  }
  .team {
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    font-size: 0.8rem;
  }
  .uname {
    font-weight: 700;
  }
  .crib-flag {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--primary);
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--primary) 45%, var(--border));
  }
  .proj {
    font-weight: 800;
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .pile {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .prow {
    align-items: center;
  }
  .plabel {
    font-weight: 700;
  }
  .ptotal {
    font-weight: 800;
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
  }
  .counts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .flabel {
    font-size: 0.9rem;
    color: var(--muted);
  }
  .fhint {
    font-size: 0.8rem;
  }
  .assist-row {
    justify-content: flex-end;
  }
  .tally {
    margin: 0;
    font-size: 0.9rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .tally strong {
    color: var(--text);
  }
  .foot {
    justify-content: flex-end;
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
