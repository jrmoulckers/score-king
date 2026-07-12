<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import { animateMotion } from '../../motion';
  import {
    ROUND_THEMES,
    bowlTotal,
    formatClock,
    makeTeams,
    pointsPerWord,
    roundCount,
    soundOn,
    teamCount,
    themeFor,
    turnSeconds,
    wordsFor,
    type SaladBowlInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: SaladBowlInput; ctx: RoundContext } = $props();

  const teams = $derived(makeTeams(ctx.players.map((p) => p.id), teamCount(ctx.config)));
  const playerById = $derived(new Map(ctx.players.map((p) => [p.id, p])));
  const perWord = $derived(pointsPerWord(ctx.config));
  const rounds = $derived(roundCount(ctx.config));
  const theme = $derived(themeFor(ctx.roundIndex));
  const turn = $derived(turnSeconds(ctx.config));
  const sound = $derived(soundOn(ctx.config));
  const bowl = $derived(bowlTotal(input, teams));
  // The escalating clue-rule rail (only the rounds this game plays), so the
  // "it gets harder" arc is glanceable at a beat.
  const rail = $derived(ROUND_THEMES.slice(0, rounds));

  // A whimsical bowl fill that maps this round's words to a height — a real number
  // (co-signalled by the tabular count beside it), gently capped so it fills up.
  const bowlFill = $derived(Math.min(100, bowl * 7));

  // Cumulative team total BEFORE this round (teammates share a total, so any
  // member's running total is the team's), plus the words pending this round —
  // the team-race energy while you tally.
  const projected = $derived(
    teams.map((t) => {
      const base = t.playerIds.length ? (ctx.totals[t.playerIds[0]] ?? 0) : 0;
      return base + wordsFor(input, t.index) * perWord;
    }),
  );
  // The leading team(s), lit only once totals actually diverge — so a tied-at-zero
  // table never crowns anyone. Gold is reserved for exactly this (co-signalled 👑).
  const leaderTeams = $derived.by(() => {
    if (projected.length === 0) return new Set<number>();
    const max = Math.max(...projected);
    if (projected.every((p) => p === projected[0])) return new Set<number>();
    return new Set(teams.filter((t, i) => projected[i] === max).map((t) => t.index));
  });

  // ── Turn console state (transient; the saved round is still per-team totals) ──
  let activeTeam = $state(0);
  let turnWords = $state(0);
  let remaining = $state(0);
  let running = $state(false);
  let started = $state(false); // clock engaged this turn (so idle re-arm doesn't fight it)
  let timesUp = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  let clockEl: HTMLDivElement | undefined = $state();
  let countEl: HTMLSpanElement | undefined = $state();

  const activeName = $derived(teams[activeTeam]?.name ?? '');
  const activeEmoji = $derived(teams[activeTeam]?.emoji ?? '🥗');
  const barPct = $derived(turn > 0 ? Math.max(0, Math.min(100, (remaining / turn) * 100)) : 0);
  const lowAt = $derived(Math.max(3, Math.ceil(turn * 0.2)));
  const low = $derived(running && remaining > 0 && remaining <= lowAt);

  // Keep the draft's per-team array in step with the team count (defensive: on a
  // fresh round `createRoundInput` already sizes it; this covers edited/legacy rounds).
  $effect(() => {
    const need = teams.length;
    if (!Array.isArray(input.guessed)) {
      input.guessed = Array.from({ length: need }, () => 0);
    } else if (input.guessed.length < need) {
      input.guessed = [
        ...input.guessed,
        ...Array.from({ length: need - input.guessed.length }, () => 0),
      ];
    }
  });

  // Fully reset the console whenever the round changes (a new clue-rule round is a
  // clean slate: fresh clock, no pending turn, first team on the clock).
  let lastRound = -1;
  $effect(() => {
    if (ctx.roundIndex !== lastRound) {
      lastRound = ctx.roundIndex;
      stopInterval();
      running = false;
      started = false;
      timesUp = false;
      turnWords = 0;
      activeTeam = 0;
      remaining = turn;
    }
  });

  // Arm the clock to a full turn while idle (also when the configured length changes).
  $effect(() => {
    const full = turn;
    if (!running && !started) remaining = full;
  });

  onDestroy(stopInterval);

  function stopInterval() {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  // ── WebAudio buzzer: two short square beeps. Gated purely by the sound toggle;
  // the AudioContext is created/resumed on a user gesture (Start) to satisfy
  // autoplay policies. Any failure is swallowed — sound must never break entry. ──
  let audioCtx: AudioContext | undefined;
  function ensureAudio() {
    if (!sound) return;
    try {
      const AC =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') void audioCtx.resume();
    } catch {
      /* no audio — the haptic + visual cue still fire */
    }
  }
  function playBuzzer() {
    if (!sound || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      for (const at of [0, 0.2]) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = 430;
        gain.gain.setValueAtTime(0.0001, now + at);
        gain.gain.exponentialRampToValueAtTime(0.14, now + at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.16);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + at);
        osc.stop(now + at + 0.17);
      }
    } catch {
      /* swallow */
    }
  }

  function onTimesUp() {
    timesUp = true;
    haptic('buzz');
    playBuzzer();
    if (clockEl) {
      animateMotion(clockEl, { scale: [1, 1.06, 1, 1.06, 1] }, { duration: 0.6, ease: 'easeInOut' });
    }
  }

  function tick() {
    remaining -= 1;
    if (remaining <= 0) {
      remaining = 0;
      stopInterval();
      running = false;
      onTimesUp();
    }
  }

  function start() {
    if (running) return;
    ensureAudio();
    if (remaining <= 0) remaining = turn;
    started = true;
    running = true;
    timesUp = false;
    stopInterval();
    timer = setInterval(tick, 1000);
  }

  function pause() {
    running = false;
    stopInterval();
  }

  function resetClock() {
    running = false;
    started = false;
    timesUp = false;
    remaining = turn;
    stopInterval();
  }

  function addWord() {
    turnWords += 1;
    haptic('tick');
    if (countEl) animateMotion(countEl, { scale: [1, 1.22, 1] }, { duration: 0.16, ease: 'easeOut' });
  }
  function removeWord() {
    if (turnWords <= 0) return;
    turnWords -= 1;
    haptic('tick');
  }

  // Commit the turn's tally into the active team's round total, then reset the
  // console and pass the bowl to the next team. A zero-word turn just advances.
  function endTurn() {
    if (turnWords > 0) {
      const cur = Array.isArray(input.guessed) ? [...input.guessed] : [];
      cur[activeTeam] = (Number(cur[activeTeam]) || 0) + turnWords;
      input.guessed = cur;
      haptic('save');
    }
    turnWords = 0;
    resetClock();
    if (teams.length) activeTeam = (activeTeam + 1) % teams.length;
  }

  function selectTeam(i: number) {
    if (i === activeTeam) return;
    activeTeam = i;
    turnWords = 0;
    resetClock();
  }
</script>

<div class="stack">
  <!-- Clue-rule header + escalation rail -->
  <div class="theme">
    <span class="temoji" aria-hidden="true">{theme.emoji}</span>
    <div class="tmeta">
      <div class="row spread">
        <strong>Round {ctx.roundIndex + 1} · {theme.name}</strong>
        <span class="rail" aria-hidden="true">
          {#each rail as r, i (i)}
            <span class="rung" class:now={i === ctx.roundIndex} class:done={i < ctx.roundIndex}>{r.emoji}</span>
          {/each}
        </span>
      </div>
      <div class="muted rule">{theme.rule}</div>
    </div>
  </div>

  <!-- Bowl motif -->
  <div class="bowlrow">
    <div class="bowl" aria-hidden="true">
      <div class="salad" style="transform: scaleY({bowlFill / 100})"></div>
      <span class="lip">🥗</span>
    </div>
    <div class="bowlmeta">
      <span class="bignum">{bowl}</span>
      <span class="muted">{bowl === 1 ? 'word' : 'words'} pulled this round</span>
    </div>
  </div>

  <!-- Turn console -->
  <div class="console">
    <div class="oc muted">On the clock</div>
    <div class="chips" role="group" aria-label="Team on the clock">
      {#each teams as t (t.index)}
        <button
          type="button"
          class="chip"
          class:active={t.index === activeTeam}
          aria-pressed={t.index === activeTeam}
          onclick={() => selectTeam(t.index)}
        >
          <span aria-hidden="true">{t.emoji}</span>{t.name}
        </button>
      {/each}
    </div>

    <div class="clock" class:low class:up={timesUp} bind:this={clockEl}>
      <span class="time" aria-live="off">{formatClock(remaining)}</span>
      <span class="clabel">
        {#if timesUp}⏰ Time! — tap End turn{:else if running}🥗 {activeEmoji} {activeName} is up!{:else}⏱️ {formatClock(turn)} per turn{/if}
      </span>
      <div class="track"><div class="fill" style="transform: scaleX({barPct / 100})"></div></div>
    </div>

    <div class="controls">
      {#if running}
        <button type="button" class="btn grow" onclick={pause}>⏸ Pause</button>
      {:else}
        <button type="button" class="btn grow" onclick={start}>▶ Start</button>
      {/if}
      <button type="button" class="btn" onclick={resetClock} aria-label="Reset the turn clock">↺</button>
    </div>

    <button type="button" class="tally" onclick={addWord}>
      <span class="plus" aria-hidden="true">＋</span>
      <span class="tlabel">Got one! <span class="thisturn"><span class="tn" bind:this={countEl}>{turnWords}</span> this turn</span></span>
    </button>

    <div class="row spread endrow">
      <button type="button" class="btn small ghost" onclick={removeWord} disabled={turnWords <= 0}>− undo word</button>
      <button type="button" class="btn small" onclick={endTurn}>Bank {turnWords} → {activeEmoji} · next team ↦</button>
    </div>
  </div>

  <!-- Per-team race review -->
  {#each teams as t (t.index)}
    <div class="team" class:onclock={t.index === activeTeam}>
      <div class="row spread thead">
        <span class="row" style="gap: 8px">
          <span class="badge" aria-hidden="true">{t.emoji}</span>
          <strong>{t.name}</strong>
          {#if leaderTeams.has(t.index)}<span class="crown" title="Leading">👑</span>{/if}
          {#if t.index === activeTeam}<span class="pill nowpill">on the clock</span>{/if}
        </span>
        <span class="totals">
          <span class="total" class:lead={leaderTeams.has(t.index)}>{projected[t.index]}</span>
          <span class="pts">+{wordsFor(input, t.index) * perWord}<span class="unit">this rd</span></span>
        </span>
      </div>

      {#if t.playerIds.length}
        <div class="members">
          {#each t.playerIds as pid (pid)}
            {@const p = playerById.get(pid)}
            {#if p}
              <span class="mem"><Avatar name={p.name} color={p.color} size={22} />{p.name}</span>
            {/if}
          {/each}
        </div>
      {/if}

      <div class="row spread entry">
        <span class="muted">Words guessed</span>
        <Stepper bind:value={input.guessed[t.index]} min={0} label={t.name} />
      </div>
    </div>
  {/each}
</div>

<style>
  .theme {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
  }
  .temoji {
    font-size: 1.7rem;
    line-height: 1;
  }
  .tmeta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .rule {
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .rail {
    display: inline-flex;
    gap: 4px;
    flex: none;
  }
  .rung {
    font-size: 0.95rem;
    opacity: 0.32;
    filter: grayscale(1);
  }
  .rung.done {
    opacity: 0.6;
    filter: grayscale(0.4);
  }
  .rung.now {
    opacity: 1;
    filter: none;
    transform: scale(1.18);
  }

  /* Bowl motif */
  .bowlrow {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 2px;
  }
  .bowl {
    position: relative;
    width: 58px;
    height: 40px;
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 999px 999px / 0 0 58px 58px;
    background: var(--surface-2);
    overflow: hidden;
    flex: none;
  }
  .salad {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 100%;
    transform-origin: bottom;
    transform: scaleY(0);
    background: color-mix(in srgb, var(--good) 42%, var(--surface-3));
    transition: transform var(--dur-base, 0.2s) var(--ease-standard, ease);
  }
  .lip {
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 1.05rem;
  }
  .bowlmeta {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .bignum {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 1.6rem;
    line-height: 1;
  }

  /* Turn console */
  .console {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .oc {
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    font-weight: 600;
    cursor: pointer;
    transition: transform var(--dur-press, 0.08s) var(--ease-standard, ease);
  }
  .chip:active {
    transform: scale(0.96);
  }
  .chip.active {
    background: var(--surface-3);
    color: var(--text);
    border-color: var(--primary);
    outline: 1px solid var(--primary);
  }

  .clock {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px;
    border-radius: var(--radius);
    background: var(--surface-3);
  }
  .time {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 2.6rem;
    line-height: 1;
  }
  .clock.low .time {
    color: var(--warn);
  }
  .clock.up .time {
    color: var(--bad);
  }
  .clabel {
    font-size: 0.85rem;
    color: var(--muted);
    text-align: center;
  }
  .clock.up .clabel {
    color: var(--bad);
    font-weight: 600;
  }
  .track {
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: var(--surface);
    overflow: hidden;
    margin-top: 4px;
  }
  .fill {
    height: 100%;
    width: 100%;
    transform-origin: left;
    transform: scaleX(0);
    background: var(--muted);
    border-radius: 999px;
    transition: transform 0.95s linear;
  }
  .clock.low .fill {
    background: var(--warn);
  }
  .clock.up .fill {
    background: var(--bad);
  }

  .controls {
    display: flex;
    gap: 8px;
  }

  /* Big +1 tally — deliberately neutral (surface), never a second violet fill;
     the card's "Save round" stays the one Royal Violet action. */
  .tally {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    min-height: 68px;
    border-radius: var(--radius-sm, 9px);
    border: 1px solid var(--border);
    background: var(--surface-3);
    color: var(--text);
    font-weight: 700;
    font-size: 1.15rem;
    cursor: pointer;
    transition: transform var(--dur-press, 0.08s) var(--ease-standard, ease), background var(--dur-base, 0.2s);
  }
  .tally:hover {
    background: color-mix(in srgb, var(--good) 14%, var(--surface-3));
  }
  .tally:active {
    transform: scale(0.98);
  }
  .plus {
    font-size: 1.7rem;
    line-height: 1;
  }
  .tlabel {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
  }
  .thisturn {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--muted);
  }
  .tn {
    display: inline-block;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: var(--text);
  }
  .endrow {
    gap: 8px;
  }

  /* Per-team review */
  .team {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .team.onclock {
    border-color: var(--primary);
  }
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: var(--surface-3);
    font-size: 1.1rem;
  }
  .crown {
    font-size: 1rem;
  }
  .nowpill {
    font-size: 0.72rem;
  }
  .totals {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
  }
  .total {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 1.15rem;
  }
  .total.lead {
    color: var(--accent-ink);
  }
  .pts {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: var(--muted);
  }
  .pts .unit {
    margin-left: 3px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--muted);
  }
  .members {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
  }
  .mem {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.88rem;
    color: var(--muted);
  }
  .entry {
    padding-top: 2px;
  }
</style>
