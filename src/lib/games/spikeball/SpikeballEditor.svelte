<script lang="ts">
  import type { Player, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { haptic } from '../../haptics';
  import {
    readConfig,
    gameWinner,
    gamePointTeam,
    isMatchPoint,
    isDeuce,
    clinchesMatch,
    currentRun,
    pushRally,
    popRally,
    scoreFromRallies,
    gamesToWin,
    requiredPlayers,
    type SpikeballInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: SpikeballInput; ctx: RoundContext } = $props();

  const sides = [0, 1] as const;

  const cfg = $derived(readConfig(ctx.config));
  const need = $derived(gamesToWin(cfg.bestOf));
  const needPlayers = $derived(requiredPlayers(cfg.format));
  const mismatch = $derived(ctx.players.length !== needPlayers);

  const byId = $derived(new Map(ctx.players.map((p) => [p.id, p])));
  function members(team: 0 | 1): Player[] {
    return (input.teams?.[team] ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is Player => !!p);
  }
  const teamA = $derived(members(0));
  const teamB = $derived(members(1));
  const nameA = $derived(teamA.map((p) => p.name).join(' & ') || 'Team A');
  const nameB = $derived(teamB.map((p) => p.name).join(' & ') || 'Team B');

  // Games won before this game. Teammates always move together, so read any member's total.
  const gamesA = $derived(Number(ctx.totals[input.teams?.[0]?.[0] ?? ''] ?? 0));
  const gamesB = $derived(Number(ctx.totals[input.teams?.[1]?.[0] ?? ''] ?? 0));
  const gameNo = $derived(gamesA + gamesB + 1);
  const gamesLeader = $derived(gamesA === gamesB ? null : gamesA > gamesB ? 0 : 1);

  const a = $derived(Number(input.a) || 0);
  const b = $derived(Number(input.b) || 0);
  const winner = $derived(gameWinner(a, b, cfg.target, cfg.winByTwo));
  const gp = $derived(gamePointTeam(a, b, cfg.target, cfg.winByTwo));
  const matchPoint = $derived(isMatchPoint(gp, gamesA, gamesB, cfg.bestOf));
  const deuce = $derived(isDeuce(a, b, cfg.target, cfg.winByTwo));
  const done = $derived(winner !== null);
  const clinches = $derived(clinchesMatch(winner, gamesA, gamesB, cfg.bestOf));

  // The rally log powers a true "undo last rally" and the momentum read. It's optional:
  // rounds recorded before it existed have no log, so we fall back to ± steppers on a/b.
  const hasLog = $derived(Array.isArray(input.rallies));
  const rallies = $derived(input.rallies ?? []);
  const run = $derived(currentRun(rallies));
  const canUndo = $derived(hasLog && rallies.length > 0);
  const lastTeam = $derived<0 | 1 | null>(rallies.length ? rallies[rallies.length - 1]! : null);
  const lastTeamName = $derived(lastTeam === null ? '' : lastTeam === 0 ? nameA : nameB);

  const rules = $derived(`First to ${cfg.target}${cfg.winByTwo ? ' · win by 2' : ''}`);

  function setScore(next: (0 | 1)[]): void {
    input.rallies = next;
    const s = scoreFromRallies(next);
    input.a = s.a;
    input.b = s.b;
  }

  function add(team: 0 | 1) {
    if (done || mismatch) return;
    if (hasLog) setScore(pushRally(rallies, team));
    else if (team === 0) input.a = a + 1;
    else input.b = b + 1;
    haptic('tick');
  }
  function undoLast() {
    if (!canUndo) return;
    setScore(popRally(rallies));
    haptic('undo');
  }
  // Legacy fallback for rounds with no rally log: a plain per-team decrement.
  function sub(team: 0 | 1) {
    if (team === 0) input.a = Math.max(0, a - 1);
    else input.b = Math.max(0, b - 1);
  }

  // Which team, if any, gets the momentum chip on its card right now.
  function showRun(team: 0 | 1): boolean {
    return !done && run.team === team && run.length >= 3;
  }

  // One sportscaster line for the live status region — whimsy in the copy, never clutter.
  const call = $derived.by(() => {
    if (mismatch) return { tone: 'warn', text: `⚠️ ${cfg.format} needs ${needPlayers} players — you have ${ctx.players.length}. Start a new game with ${needPlayers}.` };
    if (done) {
      const w = winner === 0 ? nameA : nameB;
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      return clinches
        ? { tone: 'good', text: `🏆 Match! ${w} take it all ${hi}–${lo} — tap “Save round” to seal it.` }
        : { tone: 'good', text: `🏐 Game! ${w} win ${hi}–${lo} — tap “Save round” to bank it.` };
    }
    if (gp !== null && matchPoint) return { tone: 'point', text: `🔵 Match point — ${gp === 0 ? nameA : nameB} serving for the match!` };
    if (gp !== null) return { tone: 'point', text: `🔵 Game point — ${gp === 0 ? nameA : nameB} one rally away.` };
    if (deuce) return { tone: 'point', text: `🔥 Deuce at ${a}–${b} — win by 2, nobody blinks.` };
    if (run.team !== null && run.length >= 4) return { tone: 'muted', text: `🔥 ${run.team === 0 ? nameA : nameB} rolling — ${run.length} straight.` };
    if (a === 0 && b === 0) return { tone: 'muted', text: `First rally serves it up! ${rules}.` };
    return { tone: 'muted', text: `Tap ＋1 for the team that won each rally. ${rules}.` };
  });
</script>

<div class="stack">
  <div class="row wrap meta">
    <span class="pill">{cfg.bestOf === 1 ? 'Single game' : `Best of ${cfg.bestOf}`}</span>
    <span class="pill">Game {gameNo}</span>
    <span class="pill">{rules}</span>
  </div>

  <div class="stack teams">
    {#each sides as team (team)}
      {@const mem = team === 0 ? teamA : teamB}
      {@const teamName = team === 0 ? nameA : nameB}
      {@const score = team === 0 ? a : b}
      {@const games = team === 0 ? gamesA : gamesB}
      {@const isLeader = gamesLeader === team}
      {@const isWinner = done && winner === team}
      {@const atPoint = !done && gp === team}
      <div
        class="teamcard"
        class:won={isWinner}
        class:atpoint={atPoint}
        class:matchpt={atPoint && matchPoint}
        class:deuce={deuce && !done}
      >
        <div class="thead row spread">
          <span class="row who">
            {#each mem as m (m.id)}
              <Avatar name={m.name} color={m.color} size={26} />
            {/each}
            <span class="tname">{teamName}</span>
          </span>
          <span class="gamesbox">
            <span class="games" class:lead={isLeader}>
              {#if isLeader}<span aria-hidden="true">👑</span>{/if}
              <span class="gnum">{games}</span>
              <span class="glabel">{games === 1 ? 'game' : 'games'}</span>
            </span>
            {#if cfg.bestOf > 1}
              <span class="pips" aria-hidden="true">
                {#each Array(need) as _, i (i)}
                  <span class="pip" class:on={i < games}></span>
                {/each}
              </span>
            {/if}
          </span>
        </div>

        <div class="scorewrap" class:solo={hasLog}>
          {#if !hasLog}
            <button
              type="button"
              class="iconbtn minus"
              onclick={() => sub(team)}
              disabled={score <= 0}
              aria-label={`Remove a point from ${teamName}`}
            >−</button>
          {/if}
          {#key score}
            <span class="bigscore">{score}</span>
          {/key}
        </div>

        <div class="tagline">
          {#if isWinner}
            <span class="tag win">{clinches ? '🏆 Match' : '🏐 Game'}</span>
          {:else if atPoint}
            <span class="tag point" class:match={matchPoint}>{matchPoint ? '🔵 Match pt' : '🔵 Game pt'}</span>
          {:else if showRun(team)}
            <span class="tag run">🔥 {run.length} in a row</span>
          {:else}
            <span class="tag ghost" aria-hidden="true">&nbsp;</span>
          {/if}
        </div>

        <button
          type="button"
          class="plus"
          onclick={() => add(team)}
          disabled={done || mismatch}
          aria-label={`Add a rally point for ${teamName}`}
        >
          <span class="plussign">＋1</span>
          <span class="pluslabel">rally point</span>
        </button>
      </div>
    {/each}
  </div>

  {#if hasLog}
    <button
      type="button"
      class="undo"
      onclick={undoLast}
      disabled={!canUndo}
      aria-label={lastTeamName ? `Undo the last rally point for ${lastTeamName}` : 'Undo the last rally'}
    >
      <span class="undoicon" aria-hidden="true">↩</span>
      <span>{canUndo ? `Undo · ${lastTeamName}’s point` : 'Undo last rally'}</span>
    </button>
  {/if}

  <div class="status" role="status" aria-live="polite">
    <span class={call.tone}>{call.text}</span>
  </div>
</div>

<style>
  .meta {
    gap: 8px;
  }
  .teams {
    gap: 10px;
  }
  .teamcard {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
  }
  /* A finished game reads as success (green) — distinct from the match winner's gold. */
  .teamcard.won {
    border-color: color-mix(in srgb, var(--good) 55%, var(--border));
    background: color-mix(in srgb, var(--good) 12%, var(--surface-2));
  }
  /* Game point: an amber ring backs the tag + copy (never color alone). */
  .teamcard.atpoint {
    border-color: color-mix(in srgb, var(--warn) 60%, var(--border));
    background: color-mix(in srgb, var(--warn) 7%, var(--surface-2));
  }
  /* Match point escalates: a stronger ring plus a slow breathing glow. */
  .teamcard.matchpt {
    border-color: color-mix(in srgb, var(--warn) 80%, var(--border));
    animation: sb-breathe 1.5s ease-in-out infinite;
  }
  /* Deuce: both cards pulse together — the tension is shared. */
  .teamcard.deuce {
    border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
    animation: sb-breathe 1.7s ease-in-out infinite;
  }
  @keyframes sb-breathe {
    0%,
    100% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--warn) 32%, transparent);
    }
    50% {
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--warn) 18%, transparent);
    }
  }

  .who {
    gap: 6px;
    min-width: 0;
  }
  .tname {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gamesbox {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
  .games {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .games .gnum {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: var(--text);
  }
  .games.lead .gnum {
    color: var(--accent-ink);
    font-weight: 800;
  }
  .games.lead .glabel {
    color: var(--accent-ink);
  }
  /* Best-of series tracker: filled = games won toward the majority. The leader is already
     told by 👑 + the gold number, so the pips stay neutral (no second gold signal). */
  .pips {
    display: inline-flex;
    gap: 4px;
  }
  .pip {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: transparent;
  }
  .pip.on {
    background: var(--text);
    border-color: var(--text);
  }

  .scorewrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .scorewrap.solo {
    justify-content: center;
  }
  /* The live courtside score is the hero of the card — big enough to read one-handed,
     outdoors, at arm's length. Scales with the viewport but stays tabular so it never
     jitters as it climbs. */
  .bigscore {
    flex: 1;
    text-align: center;
    font-size: clamp(3.4rem, 15vw, 5rem);
    line-height: 1;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    min-width: 2ch;
    animation: sb-pop 0.16s ease-out;
  }
  .scorewrap.solo .bigscore {
    flex: none;
  }
  @keyframes sb-pop {
    from {
      transform: scale(1.14);
    }
    to {
      transform: scale(1);
    }
  }
  .minus {
    flex: none;
  }

  .tagline {
    display: flex;
    justify-content: center;
    min-height: 1.5rem;
  }
  .tag {
    flex: none;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--border);
    white-space: nowrap;
    min-width: 84px;
    text-align: center;
  }
  .tag.ghost {
    color: var(--muted);
    visibility: hidden;
  }
  .tag.win {
    color: var(--good);
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
    background: color-mix(in srgb, var(--good) 12%, transparent);
    visibility: visible;
  }
  .tag.point {
    color: var(--text);
    border-color: color-mix(in srgb, var(--warn) 55%, var(--border));
    background: color-mix(in srgb, var(--warn) 14%, transparent);
  }
  .tag.point.match {
    border-color: color-mix(in srgb, var(--warn) 80%, var(--border));
    background: color-mix(in srgb, var(--warn) 22%, transparent);
  }
  .tag.run {
    color: var(--text);
    border-color: color-mix(in srgb, var(--bad) 45%, var(--border));
    background: color-mix(in srgb, var(--bad) 12%, transparent);
    font-variant-numeric: tabular-nums;
  }

  /* The rally tap: large and thumb-friendly, but a surface control — the one violet
     primary on this screen stays the shell's "Save round" button below the editor. */
  .plus {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: 60px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    transition: transform 0.05s ease, background 0.15s ease, border-color 0.15s ease;
  }
  .plus:hover {
    background: color-mix(in srgb, var(--text) 6%, var(--surface-3));
    border-color: var(--primary);
  }
  .plus:active {
    transform: translateY(1px);
  }
  .plus:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .plussign {
    font-size: 1.5rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .pluslabel {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--muted);
  }
  .plus:hover .pluslabel {
    color: var(--text);
  }

  /* One honest correction for a live scorer: pop the rally you just tapped. */
  .undo {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 46px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    transition: transform 0.05s ease, background 0.15s ease, border-color 0.15s ease;
  }
  .undo:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--primary);
  }
  .undo:active:not(:disabled) {
    transform: translateY(1px);
  }
  .undo:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .undoicon {
    font-size: 1.1rem;
  }

  .status {
    min-height: 1.4em;
    font-size: 0.95rem;
    text-align: center;
  }
  .status .warn {
    color: var(--warn);
  }
  .status .good {
    color: var(--good);
  }
  .status .point {
    font-weight: 700;
  }
  .status .muted {
    color: var(--muted);
  }

  @media (prefers-reduced-motion: reduce) {
    .bigscore {
      animation: none;
    }
    .teamcard.matchpt,
    .teamcard.deuce {
      animation: none;
      /* Keep the static ring so the tension still reads without motion. */
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--warn) 22%, transparent);
    }
  }
</style>
