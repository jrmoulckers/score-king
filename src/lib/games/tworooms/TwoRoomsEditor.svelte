<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { ID, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import { animateMotion } from '../../motion';
  import BoomBurst from './BoomBurst.svelte';
  import {
    formatClock,
    isFinalRound,
    roleBreakdown,
    roundCount,
    roundSeconds,
    soundOn,
    suggestedMinutes,
    type Team,
    type TwoRoomsInput,
  } from './logic';
  import { tworooms } from './index';

  let { input = $bindable(), ctx }: { input: TwoRoomsInput; ctx: RoundContext } = $props();

  const isFinal = $derived(isFinalRound(ctx.roundIndex, ctx.config));
  const rounds = $derived(roundCount(ctx.config));
  const minutes = $derived(suggestedMinutes(ctx.roundIndex, ctx.config));
  const roles = $derived(roleBreakdown(ctx.players.length));
  const maxHostages = $derived(Math.max(1, ctx.players.length));
  const winner = $derived(input.reveal.winner);
  const sound = $derived(soundOn(ctx.config));

  // The shrinking-round arc (minutes per round), so the mounting tension is
  // glanceable: 3 · 2 · 1. Co-signalled by the number itself, never colour alone.
  const rail = $derived(Array.from({ length: rounds }, (_, r) => suggestedMinutes(r, ctx.config)));

  let showRoles = $state(false);
  let showRules = $state(false);

  const rooms: (1 | 2)[] = [1, 2];

  function setLeader(room: 1 | 2, id: ID) {
    haptic('tick');
    if (room === 1) input.leader1 = input.leader1 === id ? null : id;
    else input.leader2 = input.leader2 === id ? null : id;
  }

  // ── The Reveal payoff ────────────────────────────────────────────────────────
  let boomToken = $state(0);
  let boomKind = $state<'boom' | 'dove'>('boom');

  function setWinner(team: Team) {
    const changed = input.reveal.winner !== team;
    input.reveal.winner = team;
    if (changed) {
      boomKind = team === 'red' ? 'boom' : 'dove';
      boomToken += 1; // retriggers the full-screen BoomBurst
      haptic('win');
    }
  }

  function toggleWinnerMember(id: ID) {
    haptic('tick');
    const has = input.reveal.winners.includes(id);
    input.reveal.winners = has
      ? input.reveal.winners.filter((x) => x !== id)
      : [...input.reveal.winners, id];
  }

  function selectAllWinners() {
    haptic('save');
    input.reveal.winners = ctx.players.map((p) => p.id);
  }
  function clearWinners() {
    haptic('undo');
    input.reveal.winners = [];
  }

  function setPresident(id: ID) {
    input.reveal.president = input.reveal.president === id ? null : id;
  }
  function setBomber(id: ID) {
    input.reveal.bomber = input.reveal.bomber === id ? null : id;
  }

  // ── The Fuse: a real per-round countdown (transient; never saved) ────────────
  let remaining = $state(0);
  let running = $state(false);
  let started = $state(false); // clock engaged this round (so idle re-arm doesn't fight it)
  let timesUp = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;
  let clockEl: HTMLDivElement | undefined = $state();

  const full = $derived(roundSeconds(ctx.roundIndex, ctx.config));
  const barPct = $derived(full > 0 ? Math.max(0, Math.min(100, (remaining / full) * 100)) : 0);
  const lowAt = $derived(Math.max(10, Math.ceil(full * 0.2)));
  const low = $derived(running && remaining > 0 && remaining <= lowAt);

  // Reset the Fuse whenever the round changes — each shorter round is a clean,
  // freshly-armed clock.
  let lastRound = -1;
  $effect(() => {
    if (ctx.roundIndex !== lastRound) {
      lastRound = ctx.roundIndex;
      stopInterval();
      running = false;
      started = false;
      timesUp = false;
      remaining = full;
    }
  });

  // Arm the Fuse to a full round while idle (also when the configured length changes).
  $effect(() => {
    const f = full;
    if (!running && !started) remaining = f;
  });

  onDestroy(stopInterval);

  function stopInterval() {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  // WebAudio "boom" alarm: two descending square blasts. Gated by the sound
  // toggle; the context is created/resumed on the Start gesture (autoplay policy).
  // Any failure is swallowed — audio must never break round entry.
  let audioCtx: AudioContext | undefined;
  function ensureAudio() {
    if (!sound) return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') void audioCtx.resume();
    } catch {
      /* no audio — the haptic + visual 💥 still fire */
    }
  }
  function playAlarm() {
    if (!sound || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      for (const [at, freq] of [
        [0, 320],
        [0.22, 200],
      ] as const) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + at);
        gain.gain.exponentialRampToValueAtTime(0.16, now + at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.2);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + at);
        osc.stop(now + at + 0.22);
      }
    } catch {
      /* swallow */
    }
  }

  function onTimesUp() {
    timesUp = true;
    haptic('buzz');
    playAlarm();
    if (clockEl) {
      animateMotion(clockEl, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.5, ease: 'easeInOut' });
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

  function startFuse() {
    if (running) return;
    ensureAudio();
    if (remaining <= 0) remaining = full;
    started = true;
    running = true;
    timesUp = false;
    stopInterval();
    timer = setInterval(tick, 1000);
  }
  function pauseFuse() {
    running = false;
    stopInterval();
  }
  function resetFuse() {
    running = false;
    started = false;
    timesUp = false;
    remaining = full;
    stopInterval();
  }
</script>

<BoomBurst token={boomToken} kind={boomKind} />

<div class="stack">
  <div class="hdr">
    <div class="rmeta">
      <strong>Round <span class="tnum">{ctx.roundIndex + 1}</span> of <span class="tnum">{rounds}</span>{isFinal ? ' · final' : ''}</strong>
      <span class="rail" aria-label="Round lengths, in minutes">
        {#each rail as m, i (i)}
          <span class="rung" class:now={i === ctx.roundIndex} class:done={i < ctx.roundIndex}>
            <span class="tnum">{m}</span>m
          </span>
        {/each}
      </span>
    </div>
    <span class="toggles">
      <button type="button" class="btn small ghost" aria-pressed={showRoles} onclick={() => (showRoles = !showRoles)}>
        🎭 Roles
      </button>
      <button type="button" class="btn small ghost" aria-pressed={showRules} onclick={() => (showRules = !showRules)}>
        Rules
      </button>
    </span>
  </div>

  {#if showRoles}
    <div class="ref">
      <div class="row spread">
        <strong>Deal for {roles.players} players</strong>
        <span class="muted small">Blue {roles.blueTotal} · Red {roles.redTotal}</span>
      </div>
      <ul class="reflist">
        <li>🏛️ President <span class="tnum">×{roles.president}</span> <span class="muted">(Blue)</span></li>
        <li>💣 Bomber <span class="tnum">×{roles.bomber}</span> <span class="muted">(Red)</span></li>
        <li>🔵 Blue Team card <span class="tnum">×{roles.blueTeam}</span></li>
        <li>🔴 Red Team card <span class="tnum">×{roles.redTeam}</span></li>
        {#if roles.gambler}
          <li>🃏 Gambler <span class="tnum">×{roles.gambler}</span> <span class="muted">(odd table)</span></li>
        {/if}
      </ul>
      {#if ctx.config.advancedRoles}
        <div class="muted small">Advanced game: swap in colored roles for some Blue/Red cards as you like.</div>
      {/if}
    </div>
  {/if}

  {#if showRules}
    <pre class="rules">{tworooms.help}</pre>
  {/if}

  <!-- The Fuse: this round's shrinking countdown -->
  <div class="fuse" class:low class:up={timesUp} bind:this={clockEl}>
    <div class="fusehead">
      <span class="wick" aria-hidden="true">{timesUp ? '💥' : running ? '🧨' : '🕯️'}</span>
      <span class="time" aria-live="off">{formatClock(remaining)}</span>
      <span class="flabel">
        {#if timesUp}Time! Trade hostages{:else if running}counting down…{:else}<span class="tnum">{minutes}</span>-minute round{/if}
      </span>
    </div>
    <div class="track" aria-hidden="true"><div class="burn" style="transform: scaleX({barPct / 100})"></div></div>
    <div class="fusectl">
      {#if running}
        <button type="button" class="btn grow" onclick={pauseFuse}>⏸ Pause</button>
      {:else}
        <button type="button" class="btn grow" onclick={startFuse}>{timesUp ? '↻ Re-arm' : '▶ Light the fuse'}</button>
      {/if}
      <button type="button" class="btn" onclick={resetFuse} aria-label="Reset the round timer">↺</button>
    </div>
  </div>

  <!-- Two rooms, one boom — a corridor of hostage trades between them -->
  <div class="rooms">
    {#each rooms as room, ri (room)}
      {@const leadId = room === 1 ? input.leader1 : input.leader2}
      {@const leadName = leadId ? (ctx.players.find((p) => p.id === leadId)?.name ?? 'Leader') : null}
      <div class="room">
        <div class="roomhead">
          <span class="door" aria-hidden="true">🚪</span>
          <strong>Room <span class="tnum">{room}</span></strong>
          {#if leadName}
            <span class="ledby">📢 {leadName}</span>
          {/if}
        </div>

        <div class="fieldlabel">Leader <span class="muted">(optional)</span></div>
        <div class="chips">
          {#each ctx.players as p (p.id)}
            {@const on = (room === 1 ? input.leader1 : input.leader2) === p.id}
            <button type="button" class="chip" class:on aria-pressed={on} onclick={() => setLeader(room, p.id)}>
              <Avatar name={p.name} color={p.color} size={22} />
              <span>{p.name}</span>
              {#if on}<span class="tag">📢 Leader</span>{/if}
            </button>
          {/each}
        </div>
      </div>

      {#if ri === 0}
        <!-- The corridor: hostages crossing between the two rooms -->
        <div class="corridor">
          <div class="chead">🔁 Hostage exchange</div>
          <div class="lane">
            <span class="rm">🚪<span class="tnum">1</span></span>
            <span class="flow send">➡️</span>
            <Stepper bind:value={input.sent1} min={0} max={maxHostages} label="from Room 1 to Room 2" />
            <span class="flow send">➡️</span>
            <span class="rm">🚪<span class="tnum">2</span></span>
          </div>
          <div class="lane">
            <span class="rm">🚪<span class="tnum">1</span></span>
            <span class="flow recv">⬅️</span>
            <Stepper bind:value={input.sent2} min={0} max={maxHostages} label="from Room 2 to Room 1" />
            <span class="flow recv">⬅️</span>
            <span class="rm">🚪<span class="tnum">2</span></span>
          </div>
        </div>
      {/if}
    {/each}
  </div>

  {#if isFinal}
    <div class="reveal">
      <div class="revhead">🎭 The Reveal</div>
      <p class="muted revlede">Everyone flips their card. Did the Bomber end up in the President’s room?</p>

      <div class="picks">
        <button type="button" class="pick" class:on={winner === 'red'} aria-pressed={winner === 'red'} onclick={() => setWinner('red')}>
          <span class="pickmain">💥 Same room</span>
          <span class="picksub">🔴 Red Team wins</span>
        </button>
        <button type="button" class="pick" class:on={winner === 'blue'} aria-pressed={winner === 'blue'} onclick={() => setWinner('blue')}>
          <span class="pickmain">🕊️ Kept apart</span>
          <span class="picksub">🔵 Blue Team wins</span>
        </button>
      </div>

      {#if winner}
        <div class="row spread winlabel">
          <span class="fieldlabel">
            Tap everyone on the winning {winner === 'red' ? '🔴 Red Team' : '🔵 Blue Team'}
            <span class="muted">· <span class="tnum">{input.reveal.winners.length}</span> of ~<span class="tnum">{winner === 'red' ? roles.redTotal : roles.blueTotal}</span></span>
          </span>
          <span class="winbtns">
            <button type="button" class="btn small ghost" onclick={selectAllWinners}>All</button>
            <button type="button" class="btn small ghost" onclick={clearWinners} disabled={input.reveal.winners.length === 0}>Clear</button>
          </span>
        </div>
        <div class="chips">
          {#each ctx.players as p (p.id)}
            {@const on = input.reveal.winners.includes(p.id)}
            <button type="button" class="chip win" class:on aria-pressed={on} onclick={() => toggleWinnerMember(p.id)}>
              <Avatar name={p.name} color={p.color} size={22} />
              <span>{p.name}</span>
              {#if on}<span class="tag">🏆</span>{/if}
            </button>
          {/each}
        </div>

        <details class="who">
          <summary>Note the President &amp; Bomber <span class="muted">(optional)</span></summary>
          <div class="fieldlabel">🏛️ President</div>
          <div class="chips">
            {#each ctx.players as p (p.id)}
              {@const on = input.reveal.president === p.id}
              <button type="button" class="chip" class:on aria-pressed={on} onclick={() => setPresident(p.id)}>
                <Avatar name={p.name} color={p.color} size={22} /><span>{p.name}</span>
              </button>
            {/each}
          </div>
          <div class="fieldlabel">💣 Bomber</div>
          <div class="chips">
            {#each ctx.players as p (p.id)}
              {@const on = input.reveal.bomber === p.id}
              <button type="button" class="chip" class:on aria-pressed={on} onclick={() => setBomber(p.id)}>
                <Avatar name={p.name} color={p.color} size={22} /><span>{p.name}</span>
              </button>
            {/each}
          </div>
        </details>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tnum {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .small {
    font-size: 0.8rem;
  }
  .room,
  .ref,
  .reveal,
  .corridor {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Header + shrinking-round rail */
  .hdr {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .rmeta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .toggles {
    display: flex;
    gap: 8px;
    flex: none;
  }
  .rail {
    display: inline-flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .rung {
    font-size: 0.78rem;
    color: var(--muted);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 1px 8px;
    opacity: 0.55;
  }
  .rung.done {
    opacity: 0.8;
  }
  .rung.now {
    opacity: 1;
    color: var(--text);
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, var(--surface));
  }

  /* The Fuse — a countdown console. Neutral surface: the shell's "Save round"
     stays the one Royal Violet action; this is a play aid, never a second fill. */
  .fuse {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border-radius: var(--radius);
    background: var(--surface-3);
    border: 1px solid var(--border);
  }
  .fusehead {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .wick {
    font-size: 1.4rem;
    line-height: 1;
    align-self: center;
  }
  .time {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 2.4rem;
    line-height: 1;
  }
  .fuse.low .time {
    color: var(--warn);
  }
  .fuse.up .time {
    color: var(--bad);
  }
  .flabel {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .fuse.up .flabel {
    color: var(--bad);
    font-weight: 600;
  }
  .track {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: var(--surface);
    overflow: hidden;
  }
  .burn {
    height: 100%;
    width: 100%;
    transform-origin: left;
    transform: scaleX(1);
    background: var(--muted);
    border-radius: 999px;
    transition: transform 0.95s linear;
  }
  .fuse.low .burn {
    background: var(--warn);
  }
  .fuse.up .burn {
    background: var(--bad);
  }
  .fusectl {
    display: flex;
    gap: 8px;
  }
  .grow {
    flex: 1;
  }

  /* Two rooms + the corridor between them */
  .rooms {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .rooms .room + .corridor,
  .rooms .corridor + .room {
    margin-top: -1px;
  }
  .roomhead {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .door {
    font-size: 1.1rem;
  }
  .ledby {
    margin-left: auto;
    font-size: 0.8rem;
    color: var(--muted);
    font-weight: 600;
  }

  .corridor {
    position: relative;
    align-items: stretch;
    margin: 8px 10px;
    border-style: dashed;
    background: var(--surface);
  }
  .chead {
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .lane {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .rm {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    font-size: 0.9rem;
    color: var(--muted);
    flex: none;
  }
  .flow {
    font-size: 0.95rem;
    line-height: 1;
    flex: none;
  }

  /* Field + chip vocabulary (shared with the shell's other games) */
  .fieldlabel {
    margin: 0;
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
    padding: 6px 12px 6px 8px;
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
  .chip .tag {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--muted);
  }
  .reflist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .reflist li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rules {
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

  /* The Reveal */
  .revhead {
    font-weight: 800;
    font-size: 1.05rem;
  }
  .revlede {
    margin: 0;
  }
  .picks {
    display: flex;
    gap: 10px;
  }
  .pick {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-height: 60px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    text-align: center;
  }
  .pick .pickmain {
    font-weight: 700;
  }
  .pick .picksub {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .pick.on {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 16%, var(--surface));
  }
  .pick.on .picksub {
    color: var(--text);
  }
  .winlabel {
    margin-top: 2px;
    gap: 8px;
  }
  .winbtns {
    display: inline-flex;
    gap: 6px;
    flex: none;
  }
  .who {
    margin-top: 2px;
  }
  .who summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 0.9rem;
    min-height: 32px;
    display: flex;
    align-items: center;
  }
  .who .fieldlabel {
    margin-top: 8px;
  }
</style>
