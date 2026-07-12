<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { bumpOnChange, prefersReducedMotion, animateMotion } from '../../motion';
  import { haptic } from '../../haptics';
  import { spades } from './index';
  import BagMeter from './BagMeter.svelte';
  import TargetRail from './TargetRail.svelte';
  import {
    bagCountsAfter,
    contractView,
    emptyRow,
    readConfig,
    resolveMode,
    scoreUnitHand,
    tricksAvailable,
    unitsFor,
    type NilKind,
    type SpadesInput,
    type Unit,
    type UnitHandResult,
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
  const handComplete = $derived(totalTricks === table);
  const left = $derived(table - totalTricks);

  // Standing before this hand, per unit — feeds the race rail and the leader 👑.
  const unitBefore = (u: Unit) => ctx.totals[u.memberIds[0]] ?? 0;
  const leaderKeys = $derived(computeLeaders(units, ctx.totals));
  function computeLeaders(us: Unit[], totals: Record<string, number>): Set<string> {
    const vals = us.map((u) => totals[u.memberIds[0]] ?? 0);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    if (us.length < 2 || max === min) return new Set(); // all tied → nobody leads yet
    return new Set(us.filter((u) => (totals[u.memberIds[0]] ?? 0) === max).map((u) => u.key));
  }

  // The made/set stamp for a unit — a neutral countdown mid-hand, a green "made"
  // the moment the contract lands, and the schadenfreude "SET!" only once the
  // table's tricks are fully dealt out (so a half-entered hand isn't prematurely
  // damned). The label carries the state; colour and the pop only reinforce it.
  function contractTag(res: UnitHandResult): { kind: 'needs' | 'made' | 'set'; label: string } {
    const cv = contractView(res.contract, res.tricks);
    if (cv.status === 'made') {
      return {
        kind: 'made',
        label: cv.over > 0 ? `✓ made · +${cv.over} bag${cv.over === 1 ? '' : 's'}` : '✓ made',
      };
    }
    if (handComplete) return { kind: 'set', label: `SET! ${res.base}` };
    return { kind: 'needs', label: `needs ${cv.short} more` };
  }

  let showHelp = $state(false);

  function setNil(id: string, kind: NilKind) {
    const row = input.rows[id];
    if (!row) return;
    row.nil = row.nil === kind ? 'none' : kind;
  }

  // A tiny buzz + shudder the instant a live nil gets broken (a trick sneaks in),
  // so the gamble turning sour is felt, not just read. The ✓/✗ text still carries
  // the state; motion is skipped wholesale under reduced motion.
  const brokenSeen: Record<string, boolean> = {};
  function nilPulse(node: HTMLElement, broken: boolean) {
    const pid = node.dataset.pid ?? '';
    brokenSeen[pid] = broken;
    return {
      update(next: boolean) {
        if (next && !brokenSeen[pid]) {
          haptic('tick');
          if (!prefersReducedMotion()) {
            animateMotion(node, { x: [0, -4, 4, -2, 2, 0] }, { duration: 0.36, ease: 'easeOut' });
          }
        }
        brokenSeen[pid] = next;
      },
    };
  }

  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
</script>

<div class="stack">
  <div class="row spread wrap">
    <span class="pill" class:score-bad={totalTricks > table}>
      ♠ {totalTricks} of {table} laid{#if left > 0} · {left} to go{:else if left === 0} · full table ✓{:else} · {-left} over!{/if}
    </span>
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
    {@const tag = res ? contractTag(res) : { kind: 'needs' as const, label: '' }}
    <div class="unit">
      <div class="uhead row spread">
        <span class="uleft row wrap">
          {#if partners}<span class="team">Team {u.index + 1}</span>{/if}
          <span class="contract">🤝 <strong>{res?.contract ?? 0}</strong> · won <strong>{res?.tricks ?? 0}</strong></span>
          <span
            class="stamp"
            class:score-good={tag.kind === 'made'}
            class:score-bad={tag.kind === 'set'}
            class:muted={tag.kind === 'needs'}
            use:bumpOnChange={tag.kind}
          >{tag.label}</span>
        </span>
        <span class="proj" class:score-good={(res?.score ?? 0) >= 0} class:score-bad={(res?.score ?? 0) < 0}>
          {signed(res?.score ?? 0)}
        </span>
      </div>

      {#if cfg.sandbagging && res}
        <BagMeter bags={res.bagsAfter} threshold={cfg.bagThreshold} penalties={res.penalties} />
      {/if}

      {#if res}
        <TargetRail
          before={unitBefore(u)}
          delta={res.score}
          target={cfg.target}
          leading={leaderKeys.has(u.key)}
        />
      {/if}

      {#each u.memberIds as id (id)}
        {@const p = byId.get(id)}
        {@const row = input.rows[id]}
        {#if p && row}
          {@const broken = row.nil !== 'none' && (Number(row.tricks) || 0) > 0}
          <div class="mrow">
            <div class="row spread who-row">
              <span class="who row" style="gap: 8px">
                <Avatar name={p.name} color={p.color} />
                <strong>{p.name}</strong>
              </span>
              {#if row.nil !== 'none'}
                <span
                  class="nilhint"
                  class:score-good={!broken}
                  class:score-bad={broken}
                  data-pid={id}
                  use:nilPulse={broken}
                >
                  {#if row.nil === 'blind'}
                    {broken ? '🙈 blind faith broken ✗' : '🙈 eyes shut, holding ✓'}
                  {:else}
                    {broken ? '💔 nil broken ✗' : '🚫 clean so far ✓'}
                  {/if}
                </span>
              {/if}
            </div>

            <div class="fields row">
              <label class="f">
                <span>Bid</span>
                {#if row.nil === 'none'}
                  <Stepper bind:value={row.bid} min={0} max={table} label={`${p.name} bid`} />
                {:else}
                  <span class="nilbid">{row.nil === 'blind' ? '🙈 Blind nil' : '🚫 Nil'}</span>
                {/if}
              </label>
              <label class="f">
                <span>Tricks</span>
                <Stepper bind:value={row.tricks} min={0} max={table} label={`${p.name} tricks`} />
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
    align-items: flex-start;
  }
  .uleft {
    gap: 8px;
    row-gap: 4px;
    align-items: baseline;
  }
  .team {
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    font-size: 0.82rem;
  }
  .contract {
    color: var(--muted);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  .contract strong {
    color: var(--text);
    font-weight: 700;
  }
  .stamp {
    font-size: 0.78rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    display: inline-block;
  }
  .stamp.muted {
    color: var(--muted);
    font-weight: 600;
  }
  .proj {
    font-weight: 800;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    padding-left: 8px;
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
    text-align: right;
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
