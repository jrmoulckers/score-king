<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import {
    activeCategories,
    categoryVP,
    scoreRow,
    type WyrmspanConfig,
    type WyrmspanInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: WyrmspanInput; ctx: RoundContext } = $props();

  const config = $derived<Partial<WyrmspanConfig>>({ scoreLeftover: ctx.config.scoreLeftover !== false });
  const cats = $derived(activeCategories(config));

  const totals = $derived(
    Object.fromEntries(ctx.players.map((p) => [p.id, scoreRow(input.rows[p.id], config)])) as Record<
      string,
      number
    >,
  );

  // Provisional leader = the one player strictly ahead (and above zero). Crown Gold is
  // reserved for the leader/winner, so a tie or an all-zero sheet shows no crown yet.
  const leaderId = $derived.by(() => {
    let best = 0;
    let who: string | null = null;
    let tie = false;
    for (const p of ctx.players) {
      const t = totals[p.id];
      if (t > best) {
        best = t;
        who = p.id;
        tie = false;
      } else if (t === best && best > 0) {
        tie = true;
      }
    }
    return tie ? null : who;
  });

  let showHelp = $state(false);
</script>

<div class="stack">
  <div class="row spread">
    <span class="pill">🐉 Final scoresheet</span>
    <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
      Categories
    </button>
  </div>

  {#if showHelp}
    <pre class="help">{cats.map((c) => `${c.emoji} ${c.label} — ${c.help}`).join('\n')}</pre>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const row = input.rows[p.id]}
    {@const lead = leaderId === p.id}
    <div class="prow">
      <div class="row spread phead">
        <span class="row" style="gap: 8px">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        <span class="total" class:lead>
          {#if lead}<span aria-hidden="true">👑</span><span class="sr-only">leading</span>{/if}
          <span class="num">{totals[p.id]}</span>
          <span class="unit">VP</span>
        </span>
      </div>

      <div class="cats">
        {#each cats as cat (cat.key)}
          {@const vp = categoryVP(cat, row[cat.key])}
          <label class="cat">
            <span class="cat-label">
              <span class="emoji" aria-hidden="true">{cat.emoji}</span>
              <span class="cat-name">
                {cat.short}
                {#if cat.kind === 'bundle'}
                  <small class="sub">1 VP per {cat.per} · +{vp}</small>
                {/if}
              </span>
            </span>
            {#if cat.kind === 'vp'}
              <input
                class="vpinput"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                bind:value={row[cat.key]}
                aria-label={cat.label}
              />
            {:else}
              <Stepper bind:value={row[cat.key]} min={0} />
            {/if}
          </label>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .prow {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
  }
  .phead {
    margin-bottom: 8px;
  }
  .total {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
  }
  .total .num {
    font-size: 1.15rem;
  }
  .total .unit {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--muted);
  }
  .total.lead .unit {
    color: inherit;
  }
  .cats {
    display: flex;
    flex-direction: column;
  }
  .cat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 52px;
    padding: 4px 0;
    margin: 0;
    /* override the global block label so rows sit inline */
    color: var(--text);
    font-size: 1rem;
  }
  .cat + .cat {
    border-top: 1px solid var(--border);
  }
  .cat-label {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .cat-label .emoji {
    font-size: 1.25rem;
    line-height: 1;
    flex: none;
  }
  .cat-name {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .cat-name .sub {
    font-size: 0.72rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .vpinput {
    width: 92px;
    text-align: center;
    flex: none;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    /* hide the native spinners — keyboard + typing is the input here */
    appearance: textfield;
    -moz-appearance: textfield;
  }
  .vpinput::-webkit-outer-spin-button,
  .vpinput::-webkit-inner-spin-button {
    -webkit-appearance: none;
    appearance: none;
    margin: 0;
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
