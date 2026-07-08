<script lang="ts">
  import type { Player, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import { euchre } from './index';
  import { handPoints, optionsFromConfig, type EuchreInput, type HandResult, type TeamIndex } from './logic';

  let { input = $bindable(), ctx }: { input: EuchreInput; ctx: RoundContext } = $props();

  let showRules = $state(false);

  const byId = $derived(new Map(ctx.players.map((p) => [p.id, p])));
  const opts = $derived(optionsFromConfig(ctx.config));

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

  const results: { value: HandResult; emoji: string; label: string; hint: string }[] = [
    { value: 'made', emoji: '✋', label: 'Made', hint: '3–4' },
    { value: 'march', emoji: '🧹', label: 'March', hint: 'all 5' },
    { value: 'euchred', emoji: '🚫', label: 'Euchred', hint: 'set' },
  ];

  const preview = $derived.by(() => {
    if (input.maker == null || input.result == null) return null;
    const makerIdx = input.maker;
    const defIdx = (makerIdx === 0 ? 1 : 0) as TeamIndex;
    const p = handPoints(input.result, input.alone, opts);
    const lone = input.alone ? ' alone' : '';
    if (input.result === 'euchred') {
      return { text: `${teamLabel(defIdx)} euchre ${teamLabel(makerIdx)}`, pts: p.defenders };
    }
    if (input.result === 'march') {
      return { text: `${teamLabel(makerIdx)}${lone} march`, pts: p.maker };
    }
    return { text: `${teamLabel(makerIdx)}${lone} make it`, pts: p.maker };
  });

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

  <div class="field">
    <div class="qlabel">Who called it up?</div>
    <div class="teams">
      {#each [0, 1] as idx (idx)}
        {@const ti = idx as TeamIndex}
        <button
          type="button"
          class="teambtn"
          class:on={input.maker === ti}
          aria-pressed={input.maker === ti}
          onclick={() => setMaker(ti)}
        >
          <span class="teamtag">Team {idx + 1}</span>
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
        <div class="qlabel" style="margin-top: 10px">Who went alone?</div>
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

  <div class="preview" class:ready={!!preview}>
    {#if preview}
      <span class="ptext">{preview.text}</span>
      <strong class="pts score-good">+{preview.pts}</strong>
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
    border-radius: 12px;
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
    border-radius: 999px;
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
    border-radius: 999px;
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
    border-radius: 12px;
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
    justify-content: space-between;
    gap: 12px;
    min-height: 46px;
    padding: 10px 14px;
    border: 1px dashed var(--border);
    border-radius: 12px;
    background: var(--surface-2);
  }
  .preview.ready {
    border-style: solid;
  }
  .ptext {
    font-weight: 600;
  }
  .pts {
    font-size: 1.2rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .help {
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
</style>
