<script lang="ts">
  import type { Player, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { prefersReducedMotion } from '../../motion';
  import { euchre } from './index';
  import {
    celebrationFor,
    leadingTeam,
    optionsFromConfig,
    targetFromConfig,
    teamTotals,
    toTarget,
    type EuchreInput,
    type HandResult,
    type TeamIndex,
  } from './logic';

  let { input = $bindable(), ctx }: { input: EuchreInput; ctx: RoundContext } = $props();

  let showRules = $state(false);
  const reduced = prefersReducedMotion();

  const byId = $derived(new Map(ctx.players.map((p) => [p.id, p])));
  const opts = $derived(optionsFromConfig(ctx.config));
  const target = $derived(targetFromConfig(ctx.config));

  function members(idx: TeamIndex): Player[] {
    return (input.teams[idx] ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is Player => !!p);
  }
  function teamLabel(idx: TeamIndex): string {
    const names = members(idx).map((p) => p.name);
    return names.length ? names.join(' & ') : `Team ${idx + 1}`;
  }

  const makerMembers = $derived(input.maker == null ? [] : members(input.maker));

  // Race to the barn: team totals BEFORE this hand, and who's out front.
  const scores = $derived(teamTotals(input.teams, ctx.totals));
  const leader = $derived(leadingTeam(scores));

  // Role each team is playing this hand, once a caller is picked.
  function role(idx: TeamIndex): 'makers' | 'defenders' | null {
    if (input.maker == null) return null;
    return input.maker === idx ? 'makers' : 'defenders';
  }

  const results: { value: HandResult; emoji: string; label: string; hint: string }[] = [
    { value: 'made', emoji: '✋', label: 'Made', hint: '3–4' },
    { value: 'march', emoji: '🧹', label: 'March', hint: 'all 5' },
    { value: 'euchred', emoji: '🚫', label: 'Euchred', hint: 'set' },
  ];

  // The staged drama for the chosen hand — emoji, copy, points, and whether it's a
  // "big" moment worth a flourish. Team names are composed here from the module logic.
  const cel = $derived(
    input.maker == null || input.result == null
      ? null
      : celebrationFor(input.result, input.alone, opts),
  );
  const scoringTeam = $derived.by(() => {
    if (input.maker == null || input.result == null) return '';
    const makerIdx = input.maker;
    const defIdx = (makerIdx === 0 ? 1 : 0) as TeamIndex;
    return input.result === 'euchred' ? teamLabel(defIdx) : teamLabel(makerIdx);
  });
  // Replays the flourish whenever the recorded outcome changes.
  const celKey = $derived(`${input.maker}-${input.result}-${input.alone}`);
  const celClass = $derived(
    cel?.tone === 'euchred' ? 'stamp' : cel?.lone ? 'howl' : cel?.tone === 'march' ? 'sweep' : '',
  );

  function setMaker(idx: TeamIndex) {
    input.maker = idx;
    const makers = input.teams[idx] ?? [];
    if (input.alonePlayer && !makers.includes(input.alonePlayer)) input.alonePlayer = null;
  }
  function toggleAlone() {
    input.alone = !input.alone;
    if (!input.alone) input.alonePlayer = null;
  }
  function setAlonePlayer(id: string) {
    input.alonePlayer = input.alonePlayer === id ? null : id;
  }
  function setResult(res: HandResult) {
    input.result = res;
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="muted hint">Name trump, then how the hand went.</span>
    <button type="button" class="btn small ghost" onclick={() => (showRules = !showRules)}>
      Rules
    </button>
  </div>

  {#if showRules}
    <pre class="help">{euchre.help}</pre>
  {/if}

  <div class="race" aria-label="Race to {target}">
    {#each [0, 1] as idx (idx)}
      {@const ti = idx as TeamIndex}
      {@const s = scores[ti]}
      {@const ahead = leader === ti}
      <div class="racerow" class:lead={ahead}>
        <div class="racetop">
          <span class="racename">
            {#if ahead}<span class="crown" aria-hidden="true">👑</span>{/if}
            {teamLabel(ti)}
          </span>
          <span class="racescore" class:lead={ahead}>{s}</span>
        </div>
        {#if target <= 16}
          <div class="pips" aria-hidden="true">
            {#each Array(target) as _, i (i)}
              <span class="pip" class:on={i < s} class:gold={ahead && i < s}></span>
            {/each}
          </div>
        {:else}
          <div class="bar" aria-hidden="true">
            <span class="fill" class:gold={ahead} style="width: {Math.min(100, (s / target) * 100)}%"></span>
          </div>
        {/if}
        <span class="tobarn">
          {#if s >= target}🏁 at the barn{:else}{toTarget(s, target)} to the barn{/if}
        </span>
      </div>
    {/each}
  </div>

  <div class="field">
    <div class="qlabel">Who called it up?</div>
    <div class="teams">
      {#each [0, 1] as idx (idx)}
        {@const ti = idx as TeamIndex}
        {@const r = role(ti)}
        <button
          type="button"
          class="teambtn"
          class:on={input.maker === ti}
          aria-pressed={input.maker === ti}
          onclick={() => setMaker(ti)}
        >
          <span class="teamtag" class:makers={r === 'makers'} class:defenders={r === 'defenders'}>
            {r === 'makers' ? 'Makers' : r === 'defenders' ? 'Defenders' : `Team ${idx + 1}`}
          </span>
          <span class="avatars">
            {#each members(ti) as p (p.id)}
              <Avatar name={p.name} color={p.color} size={26} />
            {/each}
          </span>
          <span class="names">{teamLabel(ti)}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="field">
    <div class="qlabel">How did the hand go?</div>
    <div class="results">
      {#each results as r (r.value)}
        <button
          type="button"
          class="resbtn"
          class:on={input.result === r.value}
          aria-pressed={input.result === r.value}
          onclick={() => setResult(r.value)}
        >
          <span class="remoji" aria-hidden="true">{r.emoji}</span>
          <span class="rlabel">{r.label}</span>
          <span class="rhint">{r.hint}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="field">
    <button
      type="button"
      class="alonebtn"
      class:on={input.alone}
      aria-pressed={input.alone}
      onclick={toggleAlone}
    >
      🐺 Going alone
    </button>
    {#if input.alone}
      {#if input.maker == null}
        <div class="muted hint" style="margin-top: 8px">Pick the calling team first.</div>
      {:else}
        <div class="qlabel" style="margin-top: 10px">Who braved it alone?</div>
        <div class="who">
          {#each makerMembers as p (p.id)}
            <button
              type="button"
              class="whobtn"
              class:on={input.alonePlayer === p.id}
              aria-pressed={input.alonePlayer === p.id}
              onclick={() => setAlonePlayer(p.id)}
            >
              <Avatar name={p.name} color={p.color} size={24} />
              {p.name}
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <div class="preview" class:ready={!!cel} class:big={cel?.big}>
    {#if cel}
      {#key celKey}
        <span class="cel-emoji" class:animate={cel.big && !reduced} class:sweep={celClass === 'sweep'} class:howl={celClass === 'howl'} class:stamp={celClass === 'stamp'} aria-hidden="true">{cel.emoji}</span>
      {/key}
      <span class="cel-copy">
        <span class="cel-head">{cel.headline}</span>
        <span class="cel-cheer">{scoringTeam} · {cel.cheer}</span>
      </span>
      <strong class="pts score-good">+{cel.points}</strong>
    {:else}
      <span class="muted">Pick the calling team and the result.</span>
    {/if}
  </div>
</div>

<style>
  .hint {
    font-size: 0.85rem;
  }
  .field {
    display: flex;
    flex-direction: column;
  }
  .qlabel {
    font-size: 0.8rem;
    color: var(--muted);
    margin-bottom: 8px;
  }

  /* Race to the barn — the euchre costume on top of the shared scoreboard. */
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
  .pips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .pip {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-pill, 999px);
    background: var(--surface-3);
    border: 1px solid var(--border);
  }
  .pip.on {
    background: var(--muted);
    border-color: var(--muted);
  }
  .pip.gold {
    background: var(--accent);
    border-color: var(--accent);
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

  .teams {
    display: flex;
    gap: 10px;
  }
  .teambtn {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-height: 46px;
    padding: 12px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
  }
  .teambtn.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .teamtag {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.75;
  }
  .teamtag.makers {
    opacity: 1;
    font-weight: 700;
  }
  .avatars {
    display: flex;
  }
  .avatars :global(.avatar:not(:first-child)) {
    margin-left: -8px;
  }
  .names {
    font-weight: 700;
    text-align: center;
    line-height: 1.2;
  }
  .alonebtn {
    align-self: flex-start;
    min-height: 46px;
    padding: 10px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill, 999px);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
  }
  .alonebtn.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .who {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .whobtn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 8px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill, 999px);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 600;
  }
  .whobtn.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .results {
    display: flex;
    gap: 8px;
  }
  .resbtn {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-height: 46px;
    padding: 10px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }
  .resbtn.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .remoji {
    font-size: 1.25rem;
    line-height: 1;
  }
  .rlabel {
    font-weight: 700;
  }
  .rhint {
    font-size: 0.72rem;
    opacity: 0.7;
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
  .preview.big {
    background: var(--surface-3);
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

  .cel-emoji.animate.sweep {
    animation: eu-sweep 600ms ease-out both;
  }
  .cel-emoji.animate.howl {
    animation: eu-howl 700ms ease-out both;
  }
  .cel-emoji.animate.stamp {
    animation: eu-stamp 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes eu-sweep {
    0% { transform: translateX(-12px) rotate(-14deg); opacity: 0.2; }
    60% { transform: translateX(5px) rotate(9deg); opacity: 1; }
    100% { transform: none; }
  }
  @keyframes eu-howl {
    0% { transform: scale(0.6); opacity: 0.2; }
    40% { transform: scale(1.25); opacity: 1; }
    55% { transform: scale(1.1) rotate(-7deg); }
    70% { transform: scale(1.18) rotate(7deg); }
    100% { transform: scale(1); }
  }
  @keyframes eu-stamp {
    0% { transform: scale(1.8) rotate(-14deg); opacity: 0; }
    55% { transform: scale(0.82) rotate(4deg); opacity: 1; }
    75% { transform: scale(1.07); }
    100% { transform: scale(1) rotate(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .cel-emoji.animate {
      animation: none !important;
    }
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
