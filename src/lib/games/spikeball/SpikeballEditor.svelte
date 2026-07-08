<script lang="ts">
  import type { Player, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import {
    readConfig,
    gameWinner,
    gamePointTeam,
    isMatchPoint,
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
  const done = $derived(winner !== null);

  const rules = $derived(`First to ${cfg.target}${cfg.winByTwo ? ' · win by 2' : ''}`);

  function add(team: 0 | 1) {
    if (done || mismatch) return;
    if (team === 0) input.a = a + 1;
    else input.b = b + 1;
  }
  function sub(team: 0 | 1) {
    if (team === 0) input.a = Math.max(0, a - 1);
    else input.b = Math.max(0, b - 1);
  }
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
      <div class="teamcard" class:won={isWinner}>
        <div class="thead row spread">
          <span class="row who">
            {#each mem as m (m.id)}
              <Avatar name={m.name} color={m.color} size={26} />
            {/each}
            <span class="tname">{teamName}</span>
          </span>
          <span class="games" class:lead={isLeader}>
            {#if isLeader}<span aria-hidden="true">👑</span>{/if}
            <span class="gnum">{games}</span>
            <span class="glabel">{games === 1 ? 'game' : 'games'}</span>
          </span>
        </div>

        <div class="scorewrap">
          <button
            type="button"
            class="iconbtn minus"
            onclick={() => sub(team)}
            disabled={score <= 0}
            aria-label={`Remove a point from ${teamName}`}
          >−</button>
          {#key score}
            <span class="bigscore">{score}</span>
          {/key}
          {#if isWinner}
            <span class="tag win">🏐 Won</span>
          {:else if atPoint}
            <span class="tag point">{matchPoint ? '🔵 Match pt' : '🔵 Game pt'}</span>
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

  <div class="status" role="status" aria-live="polite">
    {#if mismatch}
      <span class="warn">⚠️ {cfg.format} needs {needPlayers} players — you have {ctx.players.length}. Start a new game with {needPlayers}.</span>
    {:else if done}
      <span class="score-good"
        >🏐 {winner === 0 ? nameA : nameB} win {Math.max(a, b)}–{Math.min(a, b)} — tap “Save round” to record it.</span
      >
    {:else if gp !== null}
      <span class="pointmsg"
        >{matchPoint ? '🔵 Match point' : '🔵 Game point'} — {gp === 0 ? nameA : nameB}{matchPoint
          ? ', serving to win it all!'
          : '.'}</span
      >
    {:else}
      <span class="muted">Tap ＋1 for the team that won each rally. {rules}.</span>
    {/if}
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
    gap: 10px;
  }
  /* A finished game reads as success (green) — distinct from the match winner's gold. */
  .teamcard.won {
    border-color: color-mix(in srgb, var(--good) 55%, var(--border));
    background: color-mix(in srgb, var(--good) 12%, var(--surface-2));
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
  .games {
    flex: none;
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

  .scorewrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .bigscore {
    flex: 1;
    text-align: center;
    font-size: 3.2rem;
    line-height: 1;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    min-width: 2ch;
    animation: sb-pop 0.16s ease-out;
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

  .status {
    min-height: 1.4em;
    font-size: 0.95rem;
    text-align: center;
  }
  .status .warn {
    color: var(--warn);
  }
  .status .pointmsg {
    font-weight: 700;
  }
</style>
