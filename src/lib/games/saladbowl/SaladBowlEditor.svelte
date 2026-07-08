<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import {
    bowlTotal,
    makeTeams,
    pointsPerWord,
    roundCount,
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
  const next = $derived(ctx.roundIndex + 1 < rounds ? themeFor(ctx.roundIndex + 1) : null);
  const turn = $derived(turnSeconds(ctx.config));
  const bowl = $derived(bowlTotal(input, teams));

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
</script>

<div class="stack">
  <div class="theme">
    <span class="temoji" aria-hidden="true">{theme.emoji}</span>
    <div class="tmeta">
      <div class="row spread">
        <strong>Round {ctx.roundIndex + 1} · {theme.name}</strong>
        {#if next}
          <span class="pill">next {next.emoji} {next.name}</span>
        {:else}
          <span class="pill">last round</span>
        {/if}
      </div>
      <div class="muted rule">{theme.rule}</div>
    </div>
  </div>

  <div class="row spread meta">
    <span class="muted">⏱️ {turn}s per turn</span>
    <span class="pill bowl">🥗 {bowl} {bowl === 1 ? 'word' : 'words'} this round</span>
  </div>

  {#each teams as t (t.index)}
    <div class="team">
      <div class="row spread thead">
        <span class="row" style="gap: 8px">
          <span class="badge" aria-hidden="true">{t.emoji}</span>
          <strong>{t.name}</strong>
        </span>
        <span class="pts">+{wordsFor(input, t.index) * perWord}<span class="unit">pts</span></span>
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
        <Stepper bind:value={input.guessed[t.index]} min={0} />
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
  .meta {
    padding: 0 2px;
  }
  .bowl {
    font-variant-numeric: tabular-nums;
  }
  .team {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
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
  .pts {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
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
