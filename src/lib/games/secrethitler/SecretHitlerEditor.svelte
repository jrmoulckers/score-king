<script lang="ts">
  import type { RoundContext, ID } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { haptic } from '../../haptics';
  import {
    computeState,
    previewAfter,
    powerColumn,
    powerAt,
    roleSetup,
    teamSize,
    eventOf,
    TRACKER_MAX,
    KILL_POWER_MIN,
    HITLER_CHANCELLOR_MIN,
    VETO_MIN,
    type SecretHitlerInput,
    type SHEventKind,
  } from './logic';

  let { input = $bindable(), ctx }: { input: SecretHitlerInput; ctx: RoundContext } = $props();

  const LIB = [0, 1, 2, 3, 4];
  const FASC = [0, 1, 2, 3, 4, 5];
  const TRK = [0, 1, 2];

  const pc = $derived(ctx.players.length);
  const setup = $derived(roleSetup(pc));
  const powers = $derived(powerColumn(pc));

  const reminders = $derived(ctx.config.reminders !== false);
  const hitlerHintOn = $derived.by(() => {
    const h = (ctx.config.hitlerHint as string) ?? 'auto';
    if (h === 'on') return true;
    if (h === 'off') return false;
    return setup.hitlerKnowsFascists;
  });

  const prior = $derived(ctx.rounds.slice(0, ctx.roundIndex).map((r) => eventOf(r.input)));
  const before = $derived(computeState(prior));
  const after = $derived(
    previewAfter(before, {
      event: input.event,
      hitlerKilled: input.hitlerKilled,
      target: input.target,
      winners: input.winners,
    }),
  );

  const decidesNow = $derived(!!after.winner && !before.winner);
  const winTeam = $derived(after.winner);
  const teamName = $derived(
    winTeam === 'liberal' ? 'Liberal' : winTeam === 'fascist' ? 'Fascist' : '',
  );
  const needTeam = $derived(decidesNow && winTeam ? teamSize(pc, winTeam) : 0);
  const picked = $derived(
    (input.winners ?? []).filter((id) => ctx.players.some((p) => p.id === id)),
  );

  const pendingLiberal = $derived(
    input.event === 'liberal' && before.liberal < 5 ? before.liberal : -1,
  );
  const pendingFascist = $derived(
    input.event === 'fascist' && before.fascist < 6 ? before.fascist : -1,
  );
  const unlockedPower = $derived(
    input.event === 'fascist' && before.fascist < 6 ? powerAt(pc, before.fascist + 1) : null,
  );
  const vetoNow = $derived(input.event === 'fascist' && before.fascist + 1 === VETO_MIN);

  const canElectionFail = $derived(before.tracker < TRACKER_MAX);
  const canExecute = $derived(before.fascist >= KILL_POWER_MIN);
  const canHitlerChancellor = $derived(before.fascist >= HITLER_CHANCELLOR_MIN);

  function selectEvent(kind: SHEventKind) {
    input.event = kind;
    if (kind !== 'execution') {
      input.target = null;
      input.hitlerKilled = false;
    }
    input.winners = [];
    haptic('tick');
  }
  function setTarget(id: ID) {
    input.target = input.target === id ? null : id;
    haptic('tick');
  }
  function toggleHitler() {
    input.hitlerKilled = !input.hitlerKilled;
    if (!input.hitlerKilled) input.winners = [];
    haptic(input.hitlerKilled ? 'save' : 'tick');
  }
  function toggleWinner(id: ID) {
    const cur = input.winners ?? [];
    if (cur.includes(id)) input.winners = cur.filter((x) => x !== id);
    else if (cur.length < needTeam) input.winners = [...cur, id];
    haptic('tick');
  }
</script>

<div class="stack sh">
  {#if reminders && prior.length === 0}
    <div class="setup">
      <span class="row" style="gap: 8px">
        <span aria-hidden="true">🎭</span>
        <strong>{pc}-player setup</strong>
      </span>
      <span class="muted"
        >{setup.liberals} Liberal{setup.liberals === 1 ? '' : 's'} · {setup.fascists} Fascist{setup.fascists ===
        1
          ? ''
          : 's'} · 1 Hitler</span
      >
      {#if hitlerHintOn}
        <span class="muted">🤫 Hitler knows who the Fascists are.</span>
      {/if}
    </div>
  {/if}

  <!-- Policy tracks -->
  <div class="tracks">
    <div class="track">
      <div class="track-head">
        <span>📘 Liberal</span>
        <span class="count" class:done={before.liberal >= 5}>{before.liberal}/5</span>
      </div>
      <div class="slots">
        {#each LIB as i (i)}
          <span
            class="slot lib"
            class:filled={i < before.liberal}
            class:pending={i === pendingLiberal}
            aria-hidden="true">{i < before.liberal ? '📘' : ''}</span
          >
        {/each}
      </div>
    </div>

    <div class="track">
      <div class="track-head">
        <span>📕 Fascist</span>
        <span class="count" class:done={before.fascist >= 6}>{before.fascist}/6</span>
      </div>
      <div class="slots">
        {#each FASC as i (i)}
          <span
            class="slot fasc"
            class:filled={i < before.fascist}
            class:pending={i === pendingFascist}
            class:goal={i === 5}
            aria-hidden="true">{i < before.fascist ? '📕' : i === 5 ? '🏁' : ''}</span
          >
        {/each}
      </div>
      {#if reminders}
        <div class="powers">
          <span class="sr-only"
            >Fascist board powers, in order: {powers
              .map((p, i) => `policy ${i + 1} ${p ? p.label : 'no power'}`)
              .join(', ')}.</span
          >
          <span class="pwrow" aria-hidden="true">
            {#each powers as p, i (i)}
              <span class="pw" title={p ? p.label : 'No power'}>{p ? p.emoji : '·'}</span>
            {/each}
            <span class="pw" title="Fascists win">🏆</span>
          </span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Election tracker -->
  <div class="tracker">
    <span class="muted">🗳️ Election tracker</span>
    <div class="row" style="gap: 10px">
      <div class="dots" aria-hidden="true">
        {#each TRK as i (i)}
          <span class="dot" class:on={i < before.tracker} class:hot={before.tracker >= 3}></span>
        {/each}
      </div>
      <span class="count trk" class:full={before.tracker >= TRACKER_MAX}
        >{before.tracker}/{TRACKER_MAX}</span
      >
    </div>
  </div>

  <!-- Event picker -->
  <span class="fieldlabel">What happened this round?</span>
  <div class="events">
    <button
      type="button"
      class="ev"
      class:on={input.event === 'liberal'}
      aria-pressed={input.event === 'liberal'}
      onclick={() => selectEvent('liberal')}>📘 Liberal policy</button
    >
    <button
      type="button"
      class="ev"
      class:on={input.event === 'fascist'}
      aria-pressed={input.event === 'fascist'}
      onclick={() => selectEvent('fascist')}>📕 Fascist policy</button
    >
    <button
      type="button"
      class="ev"
      class:on={input.event === 'electionFailed'}
      aria-pressed={input.event === 'electionFailed'}
      disabled={!canElectionFail}
      title={canElectionFail ? '' : 'Tracker full — record the forced policy'}
      onclick={() => selectEvent('electionFailed')}>🗳️ Election failed</button
    >
    <button
      type="button"
      class="ev"
      class:on={input.event === 'execution'}
      aria-pressed={input.event === 'execution'}
      disabled={!canExecute}
      title={canExecute ? '' : 'Unlocks after the 4th Fascist policy'}
      onclick={() => selectEvent('execution')}>🔫 Execution</button
    >
    {#if canHitlerChancellor}
      <button
        type="button"
        class="ev wide"
        class:on={input.event === 'hitlerChancellor'}
        aria-pressed={input.event === 'hitlerChancellor'}
        onclick={() => selectEvent('hitlerChancellor')}>🎩 Hitler elected Chancellor</button
      >
    {/if}
  </div>

  <!-- Execution details -->
  {#if input.event === 'execution'}
    <div class="sub">
      <span class="fieldlabel">Who was executed? <span class="muted">(optional)</span></span>
      <div class="chips">
        {#each ctx.players as p (p.id)}
          <button
            type="button"
            class="chip"
            class:on={input.target === p.id}
            aria-pressed={input.target === p.id}
            onclick={() => setTarget(p.id)}
          >
            <Avatar name={p.name} color={p.color} size={22} />
            {p.name}
          </button>
        {/each}
      </div>
      <button
        type="button"
        class="ev hitler"
        class:on={input.hitlerKilled}
        aria-pressed={input.hitlerKilled}
        onclick={toggleHitler}>🎩 The executed player was Hitler</button
      >
    </div>
  {/if}

  <!-- Fascist power reminder -->
  {#if reminders && input.event === 'fascist' && (unlockedPower || vetoNow)}
    <div class="hint">
      {#if unlockedPower}<span
          >President power: <strong>{unlockedPower.emoji} {unlockedPower.label}</strong></span
        >{/if}
      {#if vetoNow}<span>🛑 Veto power is now unlocked.</span>{/if}
    </div>
  {/if}

  <!-- Winning-team recorder -->
  {#if decidesNow}
    <div class="decide" aria-live="polite">
      <strong>🏁 {teamName}s win!</strong>
      <span class="muted"
        >{after.winReason}. Reveal roles, then tap the {needTeam}
        {teamName} team member{needTeam === 1 ? '' : 's'}.</span
      >
      <div class="chips">
        {#each ctx.players as p (p.id)}
          {@const on = picked.includes(p.id)}
          <button
            type="button"
            class="chip win"
            class:on
            aria-pressed={on}
            disabled={!on && picked.length >= needTeam}
            onclick={() => toggleWinner(p.id)}
          >
            <Avatar name={p.name} color={p.color} size={22} />
            {p.name}
            {#if on}<span class="ck" aria-hidden="true">✓</span>{/if}
          </button>
        {/each}
      </div>
      <span class="muted sm" class:ready={picked.length === needTeam}
        >{picked.length === needTeam ? '✓ ' : ''}{picked.length}/{needTeam} selected</span
      >
    </div>
  {/if}
</div>

<style>
  .sh {
    gap: 12px;
  }
  .setup {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
  }

  .tracks {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .track {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
  }
  .track-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .count {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: var(--muted);
  }
  .count.done {
    color: var(--text);
  }
  .count.trk.full {
    color: var(--warn);
  }
  .slots {
    display: flex;
    gap: 6px;
  }
  .slot {
    flex: 1 1 0;
    height: 26px;
    min-width: 0;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }
  .slot.lib.filled {
    background: color-mix(in srgb, var(--good) 78%, transparent);
    border-color: var(--good);
  }
  .slot.fasc.filled {
    background: color-mix(in srgb, var(--bad) 78%, transparent);
    border-color: var(--bad);
  }
  .slot.lib.pending {
    border: 2px dashed var(--good);
  }
  .slot.fasc.pending {
    border: 2px dashed var(--bad);
  }
  .slot.goal {
    background: var(--surface-3);
  }
  .powers {
    margin-top: 6px;
  }
  .pwrow {
    display: flex;
    gap: 6px;
  }
  .pw {
    flex: 1 1 0;
    text-align: center;
    font-size: 0.8rem;
    color: var(--muted);
    opacity: 0.85;
  }

  .tracker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .dots {
    display: flex;
    gap: 8px;
  }
  .dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .dot.on {
    background: var(--warn);
    border-color: var(--warn);
  }
  .dot.hot {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 30%, transparent);
  }

  .events {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .ev {
    min-height: 46px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-weight: 700;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }
  .ev:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .ev.wide {
    grid-column: 1 / -1;
  }
  .ev.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .ev:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .ev.hitler {
    width: 100%;
    margin-top: 4px;
  }

  .sub {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 7px 14px 7px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 600;
  }
  .chip.on {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 18%, var(--surface));
  }
  .chip .ck {
    font-weight: 900;
    color: var(--primary);
  }
  .chip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .hint {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    padding: 9px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
  }

  .decide {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--surface-2);
    border: 1px solid var(--primary);
    border-radius: var(--radius-sm);
  }
  .decide .sm {
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .decide .ready {
    color: var(--good);
    font-weight: 700;
  }

  /* Motion is only ever a 150ms state transition here; under reduced motion the
     same states land instantly rather than easing. */
  @media (prefers-reduced-motion: reduce) {
    .slot,
    .ev {
      transition: none;
    }
  }
</style>
