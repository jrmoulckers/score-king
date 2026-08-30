<script lang="ts">
  import type { Player, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { canasta } from './index';
  import {
    handScore,
    leadingTeam,
    minimumInitialMeld,
    targetFromConfig,
    teamTotals,
    toTarget,
    type CanastaHand,
    type CanastaInput,
    type TeamIndex,
  } from './logic';

  let { input = $bindable(), ctx }: { input: CanastaInput; ctx: RoundContext } = $props();

  let showRules = $state(false);

  const byId = $derived(new Map(ctx.players.map((p) => [p.id, p])));
  const target = $derived(targetFromConfig(ctx.config));

  function members(idx: TeamIndex): Player[] {
    return (input.teams[idx] ?? []).map((id) => byId.get(id)).filter((p): p is Player => !!p);
  }
  function teamLabel(idx: TeamIndex): string {
    const names = members(idx).map((p) => p.name);
    return names.length ? names.join(' & ') : `Team ${idx + 1}`;
  }

  // Race to the target: team totals BEFORE this hand, and who's out front.
  const scoresBefore = $derived(teamTotals(input.teams, ctx.totals));
  const leader = $derived(leadingTeam(scoresBefore));
  const minMeld = $derived(scoresBefore.map((s) => minimumInitialMeld(s)) as [number, number]);

  // This hand's computed team scores, live as the scorer fills in each field.
  const handScores = $derived([handScore(input.hands[0]), handScore(input.hands[1])] as [
    number,
    number,
  ]);

  function toggleWentOut(idx: TeamIndex) {
    const hand = input.hands[idx];
    const turningOn = !hand.wentOut;
    hand.wentOut = turningOn;
    if (!turningOn) hand.concealedOut = false;
    // Only one team can go out — clear the other team's flag.
    if (turningOn) {
      const other = input.hands[idx === 0 ? 1 : 0];
      other.wentOut = false;
      other.concealedOut = false;
    }
  }
  function toggleConcealed(idx: TeamIndex) {
    const hand = input.hands[idx];
    hand.concealedOut = !hand.concealedOut;
    if (hand.concealedOut) hand.wentOut = true;
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="muted hint">Enter each team's canastas, red threes, and card points.</span>
    <button type="button" class="btn small ghost" onclick={() => (showRules = !showRules)}>
      Rules
    </button>
  </div>

  {#if showRules}
    <pre class="help">{canasta.help}</pre>
  {/if}

  <div class="race" aria-label="Race to {target}">
    {#each [0, 1] as idx (idx)}
      {@const ti = idx as TeamIndex}
      {@const s = scoresBefore[ti]}
      {@const ahead = leader === ti}
      <div class="racerow" class:lead={ahead}>
        <div class="racetop">
          <span class="racename">
            {#if ahead}<span class="crown" aria-hidden="true">👑</span>{/if}
            {teamLabel(ti)}
          </span>
          <span class="racescore" class:lead={ahead}>{s}</span>
        </div>
        <div class="bar" aria-hidden="true">
          <span
            class="fill"
            class:gold={ahead}
            style="width: {Math.min(100, (s / target) * 100)}%"
          ></span>
        </div>
        <span class="tobarn">
          {#if s >= target}🏁 past the target{:else}{toTarget(s, target)} to the target{/if}
        </span>
      </div>
    {/each}
  </div>

  {#each [0, 1] as idx (idx)}
    {@const ti = idx as TeamIndex}
    {@const hand = input.hands[ti] as CanastaHand}
    <div class="team">
      <div class="teamhead">
        <span class="avatars">
          {#each members(ti) as p (p.id)}
            <Avatar name={p.name} color={p.color} size={26} />
          {/each}
        </span>
        <strong class="teamname">{teamLabel(ti)}</strong>
        <span class="teamscore" class:score-good={handScores[ti] > 0} class:score-bad={handScores[ti] < 0}>
          {handScores[ti] > 0 ? '+' : ''}{handScores[ti]}
        </span>
      </div>
      <div class="minmeld muted">First meld this hand needs {minMeld[ti]}+ points.</div>

      <div class="fields">
        <label class="f">
          Natural canastas
          <Stepper
            bind:value={hand.naturalCanastas}
            min={0}
            max={4}
            label={`${teamLabel(ti)} natural canastas`}
          />
        </label>
        <label class="f">
          Mixed canastas
          <Stepper
            bind:value={hand.mixedCanastas}
            min={0}
            max={4}
            label={`${teamLabel(ti)} mixed canastas`}
          />
        </label>
        <label class="f">
          Red threes
          <Stepper bind:value={hand.redThrees} min={0} max={4} label={`${teamLabel(ti)} red threes`} />
        </label>
        <label class="f">
          Melded points
          <Stepper
            bind:value={hand.meldPoints}
            min={0}
            step={5}
            label={`${teamLabel(ti)} melded points`}
          />
        </label>
        <label class="f">
          Points left in hand
          <Stepper
            bind:value={hand.handPoints}
            min={0}
            step={5}
            label={`${teamLabel(ti)} points left in hand`}
          />
        </label>
      </div>

      <div class="outrow">
        <button
          type="button"
          class="toggle"
          class:on={hand.wentOut}
          aria-pressed={hand.wentOut}
          onclick={() => toggleWentOut(ti)}
        >
          🏁 Went out
        </button>
        <button
          type="button"
          class="toggle"
          class:on={hand.concealedOut}
          disabled={!hand.wentOut && !hand.concealedOut}
          aria-pressed={hand.concealedOut}
          onclick={() => toggleConcealed(ti)}
        >
          🥷 Concealed
        </button>
      </div>
    </div>
  {/each}
</div>

<style>
  .hint {
    font-size: 0.85rem;
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
    gap: 6px;
  }
  .racetop {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .racename {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    min-width: 0;
  }
  .crown {
    font-size: 0.95rem;
    line-height: 1;
  }
  .racescore {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .racescore.lead {
    color: var(--accent-ink);
  }
  .bar {
    height: 8px;
    border-radius: var(--radius-pill, 999px);
    background: var(--surface-3);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--muted);
  }
  .fill.gold {
    background: var(--accent);
  }
  .tobarn {
    font-size: 0.72rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .team {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
  }
  .teamhead {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .avatars {
    display: flex;
  }
  .avatars :global(.avatar:not(:first-child)) {
    margin-left: -8px;
  }
  .teamname {
    flex: 1 1 auto;
    min-width: 0;
  }
  .teamscore {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .minmeld {
    font-size: 0.72rem;
  }

  .fields {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--muted);
  }

  .outrow {
    display: flex;
    gap: 8px;
  }
  .toggle {
    flex: 1 1 0;
    min-height: 46px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
  }
  .toggle.on {
    background: color-mix(in srgb, var(--good) 20%, var(--surface));
    border-color: var(--good);
    color: var(--text);
  }
  .toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
