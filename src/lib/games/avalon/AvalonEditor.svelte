<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import AssassinReveal from './AssassinReveal.svelte';
  import {
    HAMMER,
    MAX_QUESTS,
    clinch,
    decidedBefore,
    effectiveTeamSize,
    expectedWinnerCount,
    isHammer,
    knowledgeHints,
    outcomeOf,
    rejectsOf,
    resolutionOf,
    roleList,
    roleSetup,
    tallyBefore,
    winningSide,
    type AvalonInput,
    type Outcome,
    type Side,
  } from './logic';

  let { input = $bindable(), ctx }: { input: AvalonInput; ctx: RoundContext } = $props();

  // Backfill optional fields for rounds saved before the vote track / council existed.
  if (input.rejects == null) input.rejects = 0;
  if (input.team == null) input.team = [];
  if (input.leaderId === undefined) input.leaderId = null;

  let showBriefing = $state(false);
  let showCouncil = $state(false);

  const players = $derived(ctx.players);
  const playerCount = $derived(players.length);
  const setup = $derived(roleSetup(playerCount));
  const cfg = $derived({
    percival: !!ctx.config.percival,
    morgana: !!ctx.config.morgana,
    mordred: !!ctx.config.mordred,
    oberon: !!ctx.config.oberon,
  });
  const roles = $derived(roleList(playerCount, cfg));
  const hints = $derived(knowledgeHints(cfg));

  const before = $derived(tallyBefore(ctx.rounds, ctx.roundIndex, setup));
  const decided = $derived(decidedBefore(before));
  const questNo = $derived(ctx.roundIndex + 1);
  const twoFail = $derived(setup.twoFailQuests[ctx.roundIndex] ?? false);
  const requiredFails = $derived(twoFail ? 2 : 1);
  const suggestedTeam = $derived(
    setup.questTeams[ctx.roundIndex] ?? setup.questTeams[MAX_QUESTS - 1] ?? 3,
  );

  const rejects = $derived(rejectsOf(input));
  const hammer = $derived(isHammer(input));
  const team = $derived(input.team ?? []);
  const size = $derived(effectiveTeamSize(input));

  const outcome = $derived<Outcome>(outcomeOf(input, twoFail));
  const clinchedBy = $derived<Side | null>(decided ? null : clinch(before, resolutionOf(input, twoFail)));
  const sideKnown = $derived(
    clinchedBy === 'evil' || (clinchedBy === 'good' && input.assassinFoundMerlin !== null),
  );
  const finalSide = $derived<Side | null>(
    !clinchedBy ? null : sideKnown ? winningSide(clinchedBy, input.assassinFoundMerlin) : null,
  );
  const expectedWinners = $derived(finalSide ? expectedWinnerCount(setup, finalSide) : 0);

  // Match point: a side sitting on two quests is one away from the crown. Co-signalled in text.
  const goodMatch = $derived(before.successes === 2);
  const evilMatch = $derived(before.fails === 2);
  const suddenDeath = $derived(goodMatch && evilMatch);

  type PipState = Outcome | 'current' | 'future';
  const pips = $derived.by(() => {
    const list: { n: number; state: PipState }[] = [];
    for (let i = 0; i < MAX_QUESTS; i++) {
      let state: PipState = 'future';
      if (i === ctx.roundIndex) {
        state = 'current';
      } else {
        const r = ctx.rounds.find((x) => x.index === i);
        const inp = r?.input as AvalonInput | undefined;
        if (r && inp) state = resolutionOf(inp, setup.twoFailQuests[i] ?? false) === 'success' ? 'success' : 'fail';
      }
      list.push({ n: i + 1, state });
    }
    return list;
  });

  // Keep the fail count within the team once the team (or its size) shrinks.
  $effect(() => {
    const ts = size;
    if ((Number(input.fails) || 0) > ts) input.fails = ts;
  });

  // When a roster is logged, it becomes the single source of truth for the team size.
  $effect(() => {
    if (team.length > 0 && input.teamSize !== team.length) input.teamSize = team.length;
  });

  // Reset resolution when it no longer applies, and drop stale winners whenever the winning
  // side changes — but never on first mount, so editing a saved clinch keeps its recorded team.
  let primed = false;
  let lastSide: Side | null = null;
  $effect(() => {
    const fs = finalSide;
    if (clinchedBy !== 'good' && input.assassinFoundMerlin !== null) {
      input.assassinFoundMerlin = null;
    }
    if (!primed) {
      primed = true;
      lastSide = fs;
      return;
    }
    if (fs !== lastSide) {
      lastSide = fs;
      if (input.winners.length) input.winners = [];
    }
  });

  // The Assassin's-strike reveal fires when the guess lands (null → hit/miss), never on mount.
  let strikeToken = $state(0);
  let strikeFound = $state(false);
  let strikePrimed = false;
  let lastGuess: boolean | null = null;
  $effect(() => {
    const g = clinchedBy === 'good' ? input.assassinFoundMerlin : null;
    if (!strikePrimed) {
      strikePrimed = true;
      lastGuess = g;
      return;
    }
    if (g !== null && g !== lastGuess) {
      strikeFound = g;
      strikeToken += 1;
      haptic('win');
    }
    lastGuess = g;
  });

  function markSuccess() {
    input.fails = 0;
    haptic('tick');
  }
  function markFail() {
    if ((Number(input.fails) || 0) < requiredFails) input.fails = requiredFails;
    haptic('tick');
  }
  function setRejects(n: number) {
    const next = Math.max(0, Math.min(HAMMER, n));
    if (next === rejects) return;
    input.rejects = next;
    haptic(next >= HAMMER ? 'save' : 'tick');
  }
  function setAssassin(found: boolean) {
    input.assassinFoundMerlin = found;
    input.winners = [];
  }
  function toggleWinner(id: string) {
    input.winners = input.winners.includes(id)
      ? input.winners.filter((x) => x !== id)
      : [...input.winners, id];
    haptic('tick');
  }
  function setLeader(id: string) {
    input.leaderId = input.leaderId === id ? null : id;
    haptic('tick');
  }
  function toggleAboard(id: string) {
    const next = team.includes(id) ? team.filter((x) => x !== id) : [...team, id];
    input.team = next;
    haptic('tick');
  }
</script>

<div class="stack">
  <div class="panel track" class:tense={(goodMatch || evilMatch) && !decided}>
    <div class="row spread">
      <span class="muted small">Quest track</span>
      <span class="tally tnum">
        <span class="score-good">🛡️ {before.successes}</span>
        <span class="muted">–</span>
        <span class="score-bad">{before.fails} 🗡️</span>
      </span>
    </div>
    <div class="pips">
      {#each pips as p (p.n)}
        <div
          class="pip"
          class:current={p.state === 'current'}
          class:success={p.state === 'success'}
          class:fail={p.state === 'fail'}
        >
          <span class="pn tnum">Q{p.n}</span>
          {#key p.state}
            <span class="pmark" class:stamp={p.state === 'success' || p.state === 'fail'} aria-hidden="true">
              {#if p.state === 'success'}✓{:else if p.state === 'fail'}✗{:else if p.state === 'current'}●{:else}·{/if}
            </span>
          {/key}
        </div>
      {/each}
    </div>
    {#if !decided && (goodMatch || evilMatch)}
      <p class="matchpoint small" aria-live="polite">
        {#if suddenDeath}
          ⚔️ <strong>Sudden death</strong> — the next quest decides Avalon.
        {:else if goodMatch}
          🛡️ <strong>Good match point</strong> — one more success and the realm is saved.
        {:else}
          🗡️ <strong>Evil match point</strong> — one more fail and Mordred wins.
        {/if}
      </p>
    {/if}
  </div>

  <div class="panel">
    <button class="rowbtn" type="button" onclick={() => (showBriefing = !showBriefing)} aria-expanded={showBriefing}>
      <span class="row" style="gap: 8px">
        <span aria-hidden="true">🎭</span>
        <span><strong>{playerCount} at the round table</strong> · 🛡️ {setup.good} Good · 🗡️ {setup.evil} Evil</span>
      </span>
      <span class="muted small">{showBriefing ? 'Hide' : 'Briefing'}</span>
    </button>
    {#if showBriefing}
      <div class="briefing">
        <p class="brief-lead small muted">🌙 Douse the lights — here's who wakes, and who they see.</p>
        <div class="roles">
          {#each roles as r (r.name + r.emoji)}
            <span class="pill role" class:good={r.side === 'good'} class:evil={r.side === 'evil'}>
              {r.emoji} {r.name}{#if r.note}<span class="muted"> · {r.note}</span>{/if}
            </span>
          {/each}
        </div>
        <ul class="hints">
          {#each hints as h (h)}
            <li>{h}</li>
          {/each}
        </ul>
        <p class="muted small teams">
          Team sizes by quest: {setup.questTeams.join(' · ')}{#if setup.twoFailQuests.some(Boolean)} · Quest 4 needs 2 fails{/if}
        </p>
      </div>
    {/if}
  </div>

  {#if decided}
    <div class="panel">
      <p class="done">
        This game is already decided — three quests have gone to one side. Tap <strong>Finish</strong> to record the result.
      </p>
    </div>
  {:else}
    <div class="panel entry">
      <div class="row spread">
        <strong>Quest {questNo}</strong>
        <span class="muted small">Suggested team {suggestedTeam}{#if twoFail} · needs 2 fails{/if}</span>
      </div>

      <!-- The vote track: rejected proposals stack up toward the Hammer. -->
      <div class="votetrack" class:hammered={hammer}>
        <div class="row spread">
          <span class="vt-lbl">🗳️ Vote track <span class="muted small">· rejected proposals</span></span>
          <span class="pill tnum" class:score-bad={hammer}>{rejects}/{HAMMER}</span>
        </div>
        <div class="vbeads" role="group" aria-label="Rejected proposals this quest">
          {#each Array(HAMMER) as _, i (i)}
            <button
              type="button"
              class="vbead"
              class:filled={i < rejects}
              class:doom={i === HAMMER - 1}
              aria-pressed={i < rejects}
              aria-label={`${i + 1} rejected proposal${i === 0 ? '' : 's'}`}
              onclick={() => setRejects(i + 1 === rejects ? i : i + 1)}
            >{i === HAMMER - 1 ? '🔨' : (i < rejects ? '✗' : '·')}</button>
          {/each}
        </div>
        {#if hammer}
          <p class="hammer-call">🔨 <strong>The Hammer falls!</strong> Five proposals rejected — Evil seizes Avalon.</p>
        {/if}
      </div>

      {#if !hammer}
        {#if team.length === 0}
          <div class="row spread field">
            <span>On the quest</span>
            <Stepper bind:value={input.teamSize} min={2} max={playerCount} />
          </div>
        {:else}
          <div class="row spread field">
            <span>🚣 {team.length} aboard <span class="muted small">· from the council</span></span>
          </div>
        {/if}

        <div class="otoggles">
          <button
            type="button"
            class="otoggle success"
            class:on={outcome === 'success'}
            aria-pressed={outcome === 'success'}
            onclick={markSuccess}
          >
            <span class="oi score-good" aria-hidden="true">✓</span> Succeeded
          </button>
          <button
            type="button"
            class="otoggle fail"
            class:on={outcome === 'fail'}
            aria-pressed={outcome === 'fail'}
            onclick={markFail}
          >
            <span class="oi score-bad" aria-hidden="true">✗</span> Sabotaged
          </button>
        </div>

        {#if outcome === 'fail'}
          <div class="row spread field">
            <span>🗡️ Fail cards revealed</span>
            <Stepper bind:value={input.fails} min={requiredFails} max={size} />
          </div>
        {:else if twoFail}
          <p class="muted small hint">On Quest 4 a single Fail still succeeds — treachery needs two.</p>
        {/if}
      {/if}

      <!-- Optional council log: who led, who sailed. Never required — the tool stays fast. -->
      <button class="rowbtn council-toggle" type="button" onclick={() => (showCouncil = !showCouncil)} aria-expanded={showCouncil}>
        <span class="row" style="gap: 8px">
          <span aria-hidden="true">👑</span>
          <span>Record the council <span class="muted small">· optional</span></span>
        </span>
        <span class="muted small">{showCouncil ? 'Hide' : 'Log'}</span>
      </button>
      {#if showCouncil}
        <div class="council">
          <div class="csec">
            <span class="muted small">👑 Quest leader</span>
            <div class="chips">
              {#each players as p (p.id)}
                <button
                  type="button"
                  class="chip"
                  class:on={input.leaderId === p.id}
                  aria-pressed={input.leaderId === p.id}
                  onclick={() => setLeader(p.id)}
                >
                  <Avatar name={p.name} color={p.color} size={24} />
                  <span class="cn">{p.name}</span>
                  {#if input.leaderId === p.id}<span class="ck" aria-hidden="true">👑</span>{/if}
                </button>
              {/each}
            </div>
          </div>
          <div class="csec">
            <span class="muted small">🚣 Who sailed? <span class="muted">· sets the team size</span></span>
            <div class="chips">
              {#each players as p (p.id)}
                <button
                  type="button"
                  class="chip"
                  class:on={team.includes(p.id)}
                  aria-pressed={team.includes(p.id)}
                  onclick={() => toggleAboard(p.id)}
                >
                  <Avatar name={p.name} color={p.color} size={24} />
                  <span class="cn">{p.name}</span>
                  {#if team.includes(p.id)}<span class="ck" aria-hidden="true">✓</span>{/if}
                </button>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>

    {#if clinchedBy}
      <div class="panel resolve">
        <AssassinReveal token={strikeToken} found={strikeFound} />

        {#if clinchedBy === 'good'}
          <p class="rhead">🛡️ Good completed three quests! The Assassin rises for one shot at Merlin.</p>
          <div class="atoggles">
            <button
              type="button"
              class="toggle"
              class:on={input.assassinFoundMerlin === false}
              aria-pressed={input.assassinFoundMerlin === false}
              onclick={() => setAssassin(false)}
            >
              🛡️ Missed
            </button>
            <button
              type="button"
              class="toggle"
              class:on={input.assassinFoundMerlin === true}
              aria-pressed={input.assassinFoundMerlin === true}
              onclick={() => setAssassin(true)}
            >
              🗡️ Found Merlin
            </button>
          </div>
        {:else if hammer}
          <p class="rhead">🔨 The Hammer fell — the Minions of Mordred take Avalon without a fight.</p>
        {:else}
          <p class="rhead">🗡️ Evil sank three quests — the Minions of Mordred win.</p>
        {/if}

        {#if finalSide}
          <div class="banner" class:good={finalSide === 'good'} class:evil={finalSide === 'evil'}>
            {#if finalSide === 'good'}
              🛡️ Good wins — tap the {expectedWinners} loyal servants (Merlin included).
            {:else if clinchedBy === 'good'}
              🗡️ Evil steals it — the Assassin found Merlin. Tap the {expectedWinners} minions.
            {:else}
              🗡️ Evil wins — tap the {expectedWinners} minions of Mordred.
            {/if}
          </div>

          <div class="row spread">
            <span class="muted small">Winning team</span>
            <span class="pill tnum" class:score-good={input.winners.length === expectedWinners}>
              {input.winners.length}/{expectedWinners}
            </span>
          </div>

          <div class="chips">
            {#each players as p (p.id)}
              <button
                type="button"
                class="chip"
                class:on={input.winners.includes(p.id)}
                aria-pressed={input.winners.includes(p.id)}
                onclick={() => toggleWinner(p.id)}
              >
                <Avatar name={p.name} color={p.color} size={26} />
                <span class="cn">{p.name}</span>
                {#if input.winners.includes(p.id)}<span class="ck" aria-hidden="true">✓</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .panel {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
  }
  .small {
    font-size: 0.82rem;
  }
  .tnum {
    font-variant-numeric: tabular-nums;
  }
  .track {
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 0.2s ease;
  }
  .track.tense {
    border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
  }
  .tally {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-weight: 800;
  }
  .pips {
    display: flex;
    gap: 8px;
  }
  .pip {
    flex: 1 1 0;
    min-height: 46px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--muted);
  }
  .pip .pn {
    font-size: 0.7rem;
  }
  .pip .pmark {
    font-size: 1.05rem;
    font-weight: 800;
    line-height: 1;
  }
  .pip.success {
    border-color: var(--good);
    color: var(--good);
    background: color-mix(in srgb, var(--good) 12%, var(--surface));
  }
  .pip.fail {
    border-color: var(--bad);
    color: var(--bad);
    background: color-mix(in srgb, var(--bad) 12%, var(--surface));
  }
  .pip.current {
    border-color: var(--primary);
    color: var(--text);
    box-shadow: inset 0 0 0 1px var(--primary);
  }
  /* A quest resolving stamps its ✓/✗ in — decoration over a mark that's already there. */
  .pmark.stamp {
    display: inline-block;
    animation: stamp 0.34s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  }
  @keyframes stamp {
    0% { transform: scale(1.9) rotate(-14deg); opacity: 0; }
    55% { transform: scale(0.86) rotate(4deg); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  .matchpoint {
    margin: 0;
    color: var(--text);
  }

  .rowbtn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 46px;
    background: transparent;
    border: 0;
    color: var(--text);
    cursor: pointer;
    font: inherit;
    text-align: left;
    padding: 0;
  }
  .briefing {
    margin-top: 10px;
  }
  .brief-lead {
    margin: 0 0 8px;
  }
  .roles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .role.good {
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
  }
  .role.evil {
    border-color: color-mix(in srgb, var(--bad) 45%, var(--border));
  }
  .hints {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .hints li {
    font-size: 0.86rem;
    line-height: 1.4;
    color: var(--text);
    padding-left: 2px;
  }
  .teams {
    width: 100%;
    margin: 10px 0 0;
  }

  .entry {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .field {
    min-height: 46px;
  }
  .field > span {
    color: var(--muted);
  }
  .hint {
    margin: 0;
  }

  .votetrack {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    transition: border-color 0.2s ease, background 0.2s ease;
  }
  .votetrack.hammered {
    border-color: var(--bad);
    background: color-mix(in srgb, var(--bad) 12%, var(--surface));
  }
  .vt-lbl {
    font-weight: 700;
  }
  .vbeads {
    display: flex;
    gap: 6px;
  }
  .vbead {
    flex: 1 1 0;
    min-height: 40px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--muted);
    font-weight: 800;
    cursor: pointer;
    line-height: 1;
  }
  .vbead.filled {
    border-color: var(--bad);
    color: var(--bad);
    background: color-mix(in srgb, var(--bad) 16%, var(--surface));
  }
  .vbead.doom {
    font-size: 1.05rem;
  }
  .vbead.doom.filled {
    background: color-mix(in srgb, var(--bad) 30%, var(--surface));
    color: var(--text);
  }
  .hammer-call {
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.4;
  }

  .otoggles {
    display: flex;
    gap: 8px;
  }
  .otoggle {
    flex: 1 1 0;
    min-height: 46px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .otoggle .oi {
    font-weight: 900;
  }
  .otoggle.success.on {
    border-color: var(--good);
    background: color-mix(in srgb, var(--good) 16%, var(--surface));
  }
  .otoggle.fail.on {
    border-color: var(--bad);
    background: color-mix(in srgb, var(--bad) 16%, var(--surface));
  }

  .council-toggle {
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  .council {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .csec {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .resolve {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  }
  .rhead {
    margin: 0;
    font-weight: 700;
  }
  .atoggles {
    display: flex;
    gap: 8px;
  }
  .toggle {
    flex: 1 1 0;
    min-height: 46px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
  }
  .toggle.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }

  .banner {
    border-radius: 10px;
    padding: 10px 12px;
    font-weight: 700;
    border: 1px solid var(--border);
    background: var(--surface);
    position: relative;
    z-index: 2;
  }
  .banner.good {
    border-color: var(--good);
    background: color-mix(in srgb, var(--good) 12%, var(--surface));
  }
  .banner.evil {
    border-color: var(--bad);
    background: color-mix(in srgb, var(--bad) 12%, var(--surface));
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
    padding: 6px 14px 6px 6px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 600;
  }
  .chip.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .chip .ck {
    font-weight: 900;
  }

  .done {
    margin: 0;
  }

  .vbead:focus-visible,
  .otoggle:focus-visible,
  .toggle:focus-visible,
  .chip:focus-visible,
  .rowbtn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }

  @media (prefers-reduced-motion: reduce) {
    .pmark.stamp {
      animation: none;
    }
  }
</style>
