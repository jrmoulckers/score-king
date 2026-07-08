<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { spades } from './index';
  import {
    bagCountsAfter,
    emptyRow,
    readConfig,
    resolveMode,
    scoreUnitHand,
    tricksAvailable,
    unitsFor,
    type NilKind,
    type SpadesInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: SpadesInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));
  const table = $derived(tricksAvailable(ctx.players.length));
  const mode = $derived(resolveMode(ctx.config, ctx.players.length));
  const partners = $derived(mode === 'partners');
  const soloFallback = $derived(cfg.mode === 'partners' && ctx.players.length !== 4);
  const units = $derived(unitsFor(ctx.players, mode));
  const byId = $derived(new Map(ctx.players.map((p) => [p.id, p])));

  const prior = $derived(
    ctx.rounds
      .filter((r) => r.index < ctx.roundIndex)
      .sort((a, b) => a.index - b.index)
      .map((r) => r.input as SpadesInput),
  );
  const bagsBefore = $derived(bagCountsAfter(prior, ctx.players, ctx.config));
  const results = $derived(
    new Map(
      units.map((u) => [
        u.key,
        scoreUnitHand(
          u.memberIds.map((id) => input.rows[id] ?? emptyRow()),
          cfg,
          bagsBefore[u.key] ?? 0,
        ),
      ]),
    ),
  );
  const totalTricks = $derived(
    ctx.players.reduce((a, p) => a + (Number(input.rows[p.id]?.tricks) || 0), 0),
  );

  let showHelp = $state(false);

  function setNil(id: string, kind: NilKind) {
    const row = input.rows[id];
    if (!row) return;
    row.nil = row.nil === kind ? 'none' : kind;
  }

  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
</script>

<div class="stack">
  <div class="row spread wrap">
    <span class="pill" class:score-bad={totalTricks !== table}>♠ {totalTricks}/{table} tricks</span>
    <span class="row wrap" style="gap: 8px">
      <span class="pill">{partners ? '👥 Partners' : '🙋 Solo'}{soloFallback ? ' · need 4 for teams' : ''}</span>
      <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
        How to score
      </button>
    </span>
  </div>

  {#if showHelp}
    <pre class="help">{spades.help}</pre>
  {/if}

  {#each units as u (u.key)}
    {@const res = results.get(u.key)}
    <div class="unit">
      <div class="uhead row spread">
        <span class="uleft row wrap">
          {#if partners}<span class="team">Team {u.index + 1}</span>{/if}
          <span class="sub">bid {res?.contract ?? 0} · won {res?.tricks ?? 0}</span>
          {#if cfg.sandbagging}
            <span class="bags" class:score-bad={(res?.penalties ?? 0) > 0}>
              🛍️ {res?.bagsAfter ?? 0}{(res?.penalties ?? 0) > 0 ? ` · −${100 * (res?.penalties ?? 0)}` : ''}
            </span>
          {/if}
        </span>
        <span class="proj" class:score-good={(res?.score ?? 0) >= 0} class:score-bad={(res?.score ?? 0) < 0}>
          {signed(res?.score ?? 0)}
        </span>
      </div>

      {#each u.memberIds as id (id)}
        {@const p = byId.get(id)}
        {@const row = input.rows[id]}
        {#if p && row}
          <div class="mrow">
            <div class="row spread who-row">
              <span class="who row" style="gap: 8px">
                <Avatar name={p.name} color={p.color} />
                <strong>{p.name}</strong>
              </span>
              {#if row.nil !== 'none'}
                <span class="nilhint" class:score-good={(Number(row.tricks) || 0) === 0} class:score-bad={(Number(row.tricks) || 0) > 0}>
                  {(Number(row.tricks) || 0) === 0 ? 'on track ✓' : 'broken ✗'}
                </span>
              {/if}
            </div>

            <div class="fields row">
              <label class="f">
                <span>Bid</span>
                {#if row.nil === 'none'}
                  <Stepper bind:value={row.bid} min={0} max={table} />
                {:else}
                  <span class="nilbid">{row.nil === 'blind' ? '🙈 Blind nil' : '🚫 Nil'}</span>
                {/if}
              </label>
              <label class="f">
                <span>Tricks</span>
                <Stepper bind:value={row.tricks} min={0} max={table} />
              </label>
            </div>

            {#if cfg.nil}
              <div class="niltoggles row">
                <button
                  type="button"
                  class="toggle"
                  class:on={row.nil === 'nil'}
                  onclick={() => setNil(id, 'nil')}
                >
                  🚫 Nil <span class="sub2">(±100)</span>
                </button>
                {#if cfg.blindNil}
                  <button
                    type="button"
                    class="toggle"
                    class:on={row.nil === 'blind'}
                    onclick={() => setNil(id, 'blind')}
                  >
                    🙈 Blind <span class="sub2">(±200)</span>
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/each}
</div>

<style>
  .unit {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .uhead {
    align-items: center;
  }
  .uleft {
    gap: 8px;
    row-gap: 4px;
  }
  .team {
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    font-size: 0.82rem;
  }
  .sub {
    color: var(--muted);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  .bags {
    font-size: 0.82rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .proj {
    font-weight: 800;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
  }
  .mrow {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .who strong {
    font-weight: 700;
  }
  .nilhint {
    font-size: 0.78rem;
    font-weight: 700;
  }
  .fields {
    gap: 16px;
    flex-wrap: wrap;
  }
  .f {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  .nilbid {
    display: inline-flex;
    align-items: center;
    min-height: 46px;
    font-weight: 700;
    color: var(--text);
    font-size: 0.95rem;
  }
  .niltoggles {
    gap: 8px;
  }
  .toggle {
    flex: 1;
    min-height: 46px;
    padding: 9px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
  }
  .toggle .sub2 {
    color: var(--muted);
    font-weight: 500;
    font-size: 0.8rem;
  }
  .toggle.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .toggle.on .sub2 {
    color: rgba(255, 255, 255, 0.8);
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
