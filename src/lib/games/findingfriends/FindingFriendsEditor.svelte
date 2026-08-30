<script lang="ts">
  import type { Player, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { findingFriends } from './index';
  import {
    deckCountFromConfig,
    levelJump,
    levelLabel,
    sideLevelIndex,
    totalPoints,
    validateFindingFriends,
    type FindingFriendsInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: FindingFriendsInput; ctx: RoundContext } = $props();

  let showRules = $state(false);

  const byId = $derived(new Map(ctx.players.map((p) => [p.id, p])));
  const deckCount = $derived(deckCountFromConfig(ctx.config));
  const pool = $derived(totalPoints(deckCount));

  function members(ids: string[]): Player[] {
    return ids.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  }
  const declarerMembers = $derived(members(input.declarers));
  const challengerMembers = $derived(members(input.challengers));

  const declarerLevel = $derived(sideLevelIndex(input.declarers, ctx.totals));
  const challengerLevel = $derived(sideLevelIndex(input.challengers, ctx.totals));

  /** Tap a chip to flip that player between the banking and attacking side. */
  function toggleSide(id: string) {
    if (input.declarers.includes(id)) {
      input.declarers = input.declarers.filter((x) => x !== id);
      input.challengers = [...input.challengers, id];
    } else {
      input.challengers = input.challengers.filter((x) => x !== id);
      input.declarers = [...input.declarers, id];
    }
  }

  // Quick-pick points at each threshold boundary, scaled to the pool in play.
  const quickPoints = $derived(
    [0, pool * 0.2, pool * 0.4, pool * 0.6, pool * 0.8, pool].map((n) => Math.round(n)),
  );

  function setPoints(n: number) {
    input.pointsCaptured = Math.max(0, Math.min(pool, n));
  }

  const preview = $derived(
    input.pointsCaptured == null ? null : levelJump(input.pointsCaptured, deckCount),
  );
  const error = $derived(validateFindingFriends(input));
</script>

<div class="stack">
  <div class="row spread">
    <span class="muted hint">Tap a player to move them between sides, then log the points.</span>
    <button type="button" class="btn small ghost" onclick={() => (showRules = !showRules)}>
      Rules
    </button>
  </div>

  {#if showRules}
    <pre class="help">{findingFriends.help}</pre>
  {/if}

  <div class="race" aria-label="Level race">
    <div class="racerow">
      <div class="racetop">
        <span class="racename">🛡️ Declarers (bank)</span>
        <span class="racescore">{levelLabel(declarerLevel)}</span>
      </div>
      <span class="tobarn">{declarerMembers.map((p) => p.name).join(' & ') || 'nobody yet'}</span>
    </div>
    <div class="racerow">
      <div class="racetop">
        <span class="racename">⚔️ Challengers (attack)</span>
        <span class="racescore">{levelLabel(challengerLevel)}</span>
      </div>
      <span class="tobarn">
        {challengerMembers.map((p) => p.name).join(' & ') || 'nobody yet'}
      </span>
    </div>
  </div>

  <div class="field">
    <div class="qlabel">Who's banking this deal?</div>
    <div class="chips">
      {#each ctx.players as p (p.id)}
        {@const onDeclarers = input.declarers.includes(p.id)}
        <button
          type="button"
          class="chip"
          class:on={onDeclarers}
          aria-pressed={onDeclarers}
          onclick={() => toggleSide(p.id)}
        >
          <Avatar name={p.name} color={p.color} size={26} />
          <span class="chipname">{p.name}</span>
          <span class="chiprole">{onDeclarers ? 'bank' : 'attack'}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="field">
    <div class="qlabel">Points the challengers captured (5s, 10s, Ks)</div>
    <div class="quick">
      {#each quickPoints as n (n)}
        <button
          type="button"
          class="qbtn"
          class:on={input.pointsCaptured === n}
          onclick={() => setPoints(n)}
        >
          {n}
        </button>
      {/each}
    </div>
    <input
      class="numinput"
      type="number"
      inputmode="numeric"
      min="0"
      max={pool}
      step="5"
      placeholder="Exact points"
      value={input.pointsCaptured ?? ''}
      oninput={(e) => {
        const v = e.currentTarget.valueAsNumber;
        input.pointsCaptured = Number.isFinite(v) ? Math.max(0, Math.min(pool, v)) : null;
      }}
    />
    <span class="muted hint">Pool this deal: {pool} points ({deckCount} deck{deckCount === 1 ? '' : 's'}).</span>
  </div>

  <div class="preview" class:ready={!!preview}>
    {#if preview}
      {#if !preview.winner || preview.levels === 0}
        <span class="cel-emoji" aria-hidden="true">🤝</span>
        <span class="cel-copy">
          <span class="cel-head">Hold</span>
          <span class="cel-cheer">Nobody advances this deal.</span>
        </span>
      {:else}
        {@const winnerLabel =
          preview.winner === 'declarers'
            ? declarerMembers.map((p) => p.name).join(' & ') || 'Declarers'
            : challengerMembers.map((p) => p.name).join(' & ') || 'Challengers'}
        <span class="cel-emoji" aria-hidden="true">
          {preview.winner === 'declarers' ? '🛡️' : '⚔️'}
        </span>
        <span class="cel-copy">
          <span class="cel-head">
            {preview.winner === 'declarers' ? 'Bank holds' : 'Breakthrough'}
          </span>
          <span class="cel-cheer">{winnerLabel}</span>
        </span>
        <strong class="pts score-good">+{preview.levels}</strong>
      {/if}
    {:else}
      <span class="muted">Enter points captured to see the level jump.</span>
    {/if}
  </div>

  {#if error}
    <div class="muted hint">{error}</div>
  {/if}
</div>

<style>
  .hint {
    font-size: 0.85rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .qlabel {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .race {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .racerow {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .racetop {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .racename {
    font-weight: 700;
  }
  .racescore {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .tobarn {
    font-size: 0.78rem;
    color: var(--muted);
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
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill, 999px);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font-weight: 600;
  }
  .chip.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .chipname {
    white-space: nowrap;
  }
  .chiprole {
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.75;
  }

  .quick {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .qbtn {
    min-height: 46px;
    min-width: 46px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .qbtn.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .numinput {
    min-height: 46px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .preview {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 46px;
    padding: 10px 14px;
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
  }
  .preview.ready {
    border-style: solid;
  }
  .cel-emoji {
    flex: 0 0 auto;
    font-size: 1.5rem;
    line-height: 1;
  }
  .cel-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .cel-head {
    font-weight: 800;
  }
  .cel-cheer {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .pts {
    flex: 0 0 auto;
    font-size: 1.2rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .help {
    white-space: pre-wrap;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-chip);
    padding: 12px;
    font-size: 0.85rem;
    margin: 0;
    font-family: inherit;
    color: var(--muted);
  }
</style>
