<script lang="ts">
  import type { ID, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { haptic } from '../../haptics';
  import { popIn } from '../../motion';
  import { handsRemaining, readConfig, type ErsInput } from './logic';

  let { input = $bindable(), ctx }: { input: ErsInput; ctx: RoundContext } = $props();

  const round = $derived(ctx.roundIndex + 1);
  const cfg = $derived(readConfig(ctx.config));

  function winsBefore(id: ID): number {
    return Number(ctx.totals[id]) || 0;
  }
  // The leader by hands won so far — Crown Gold marks them, and only them.
  const leaderWins = $derived(Math.max(0, ...ctx.players.map((p) => winsBefore(p.id))));
  function isLeader(id: ID): boolean {
    return leaderWins > 0 && winsBefore(id) === leaderWins;
  }

  function pick(id: ID) {
    input.winnerId = input.winnerId === id ? null : id;
    haptic(input.winnerId ? 'win' : 'tick');
  }
</script>

<div class="stack ers">
  <div class="row spread head">
    <span class="row" style="gap: 8px; flex-wrap: wrap">
      <span class="pill">Hand {round}</span>
      {#if cfg.target > 0}
        <span class="pill">🏆 first to {cfg.target}</span>
      {/if}
    </span>
  </div>

  <span class="fieldlabel">Who took the whole deck?</span>
  <div class="grid">
    {#each ctx.players as p (p.id)}
      {@const wins = winsBefore(p.id)}
      {@const on = input.winnerId === p.id}
      {@const togo = handsRemaining(wins, cfg.target)}
      <button
        type="button"
        class="ptile"
        class:on
        aria-pressed={on}
        onclick={() => pick(p.id)}
      >
        <span class="row" style="gap: 8px; min-width: 0">
          <Avatar name={p.name} color={p.color} />
          <strong class="ellipsis">{p.name}</strong>
        </span>
        <span class="row" style="gap: 6px">
          <span class="wins tabnum" class:leading={isLeader(p.id)}>
            {#if isLeader(p.id)}<span aria-hidden="true">👑</span>{/if}
            {wins} {wins === 1 ? 'win' : 'wins'}
          </span>
          {#if togo != null}
            <span class="togo tabnum">{togo} to go</span>
          {/if}
        </span>
        {#if on}<span class="ck" use:popIn aria-hidden="true">🐀</span>{/if}
      </button>
    {/each}
  </div>

  <label class="notefield">
    <span class="fieldlabel">What sealed it? <span class="muted">(optional)</span></span>
    <input
      type="text"
      class="note-input"
      autocomplete="off"
      spellcheck="false"
      maxlength="80"
      placeholder="e.g. sandwich on the last flip"
      bind:value={input.note}
    />
  </label>
</div>

<style>
  .ers {
    gap: 12px;
  }
  .head {
    flex-wrap: wrap;
    gap: 8px;
  }
  .fieldlabel {
    font-weight: 600;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ptile {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 46px;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 12px);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    cursor: pointer;
    text-align: left;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform var(--dur-press, 0.09s) ease;
  }
  .ptile:hover {
    background: var(--surface-3);
  }
  .ptile:active {
    transform: scale(0.98);
  }
  .ptile:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .ptile.on {
    background: color-mix(in srgb, var(--primary) 16%, var(--surface-2));
    border-color: var(--primary);
  }
  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tabnum {
    font-variant-numeric: tabular-nums;
  }
  .wins {
    font-weight: 700;
    color: var(--muted);
    white-space: nowrap;
  }
  .wins.leading {
    color: var(--accent-ink, var(--text));
    font-weight: 800;
  }
  .togo {
    color: var(--muted);
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .ck {
    font-size: 1.1rem;
  }

  .notefield {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .note-input {
    min-height: 46px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 12px);
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .note-input:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .ptile {
      transition: none;
    }
  }
</style>
