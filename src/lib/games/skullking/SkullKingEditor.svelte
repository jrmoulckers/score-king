<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import { skullking } from './index';
  import VoyageRibbon from './VoyageRibbon.svelte';
  import CoinBurst from './CoinBurst.svelte';
  import {
    BONUS_VALUES,
    BOUNTY_LIMITS,
    bountyTotal,
    emptyBounty,
    outcomeLabel,
    readConfig,
    scoreRow,
    type SKBounty,
    type SKInput,
  } from './logic';

  let { input = $bindable(), ctx }: { input: SKInput; ctx: RoundContext } = $props();

  const n = $derived(ctx.roundIndex + 1);
  const total = $derived(readConfig(ctx.config).rounds);
  const requireBid = $derived(readConfig(ctx.config).bonusesRequireBid);
  const won = $derived(ctx.players.reduce((a, p) => a + (Number(input.rows[p.id]?.actual) || 0), 0));
  const bidSum = $derived(ctx.players.reduce((a, p) => a + (Number(input.rows[p.id]?.bid) || 0), 0));
  const bidRead = $derived(
    bidSum === n ? '⚖️ dead even' : bidSum > n ? '🌊 over-bid seas' : '🍃 tricks to spare',
  );

  let showHelp = $state(false);
  let open = $state<Record<string, boolean>>({});
  let tokens = $state<Record<string, number>>({});
  let bigHaul = $state<Record<string, boolean>>({});
  const prevBounty: Record<string, number> = {};
  let ready = false;

  const bountyOf = $derived(
    Object.fromEntries(ctx.players.map((p) => [p.id, bountyTotal(input.rows[p.id]?.bounty)])),
  );

  // Legacy rounds saved before the builder carry only a numeric `bonus`; seed a
  // structured bounty (with that number preserved as a manual entry) so nothing
  // is lost and every capture stays editable. Also primes the burst baseline so
  // pre-existing bounty doesn't fire coins on open.
  $effect(() => {
    if (ready) return;
    for (const p of ctx.players) {
      const row = input.rows[p.id];
      if (!row) continue;
      if (!row.bounty) row.bounty = { ...emptyBounty(), manual: Number(row.bonus) || 0 };
      prevBounty[p.id] = bountyTotal(row.bounty);
    }
    ready = true;
  });

  // Keep the numeric `bonus` mirror in sync with the structured bounty, so
  // history summaries and stats that read `bonus` stay correct.
  $effect(() => {
    for (const p of ctx.players) {
      const row = input.rows[p.id];
      if (row?.bounty) row.bonus = bountyTotal(row.bounty);
    }
  });

  // Treasure pop whenever a player's bounty climbs — a small cascade for a big
  // capture (≥ a Pirate) or a growing hoard. Skipped wholesale under reduced
  // motion inside CoinBurst.
  $effect(() => {
    if (!ready) return;
    for (const p of ctx.players) {
      const cur = bountyOf[p.id] ?? 0;
      const prev = prevBounty[p.id] ?? 0;
      if (cur > prev) {
        tokens = { ...tokens, [p.id]: (tokens[p.id] ?? 0) + 1 };
        bigHaul = { ...bigHaul, [p.id]: cur - prev >= BONUS_VALUES.pirate || cur >= 40 };
        haptic('tick');
      }
      prevBounty[p.id] = cur;
    }
  });

  function preview(id: string): number {
    return scoreRow(input.rows[id], n, requireBid);
  }
  function toggleTray(id: string) {
    open = { ...open, [id]: !open[id] };
  }
  function flip(b: SKBounty, key: 'jollyRoger' | 'mermaidCatchesSK' | 'skOverMermaid') {
    b[key] = !b[key];
  }
  const signed = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
</script>

<div class="stack">
  <VoyageRibbon round={n} {total} />

  <div class="row spread wrap">
    <span class="pill" class:score-bad={won > n}>🃏 won {won}/{n}</span>
    <span class="row wrap" style="gap: 8px">
      <span class="pill" title="Total tricks bid vs. tricks available">🗣️ bids {bidSum} · {bidRead}</span>
      <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
        Bounty guide
      </button>
    </span>
  </div>

  {#if showHelp}
    <pre class="help">{skullking.help}</pre>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const row = input.rows[p.id]}
    {@const b = row.bounty ?? emptyBounty()}
    {@const oc = outcomeLabel(row, n)}
    {@const pts = preview(p.id)}
    <div class="prow">
      <div class="row spread" style="margin-bottom: 10px">
        <span class="row" style="gap: 8px">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        <span class="preview-wrap">
          <span class="preview" class:score-good={pts >= 0} class:score-bad={pts < 0}>
            {signed(pts)}
          </span>
          <span
            class="outcome"
            class:score-good={oc.kind === 'hit' || oc.kind === 'zero'}
            class:score-bad={oc.kind === 'miss'}
          >
            {oc.emoji} {oc.label}
          </span>
        </span>
      </div>

      <div class="fields">
        <label class="f">Bid<Stepper bind:value={row.bid} min={0} max={n} label={`${p.name} bid`} /></label>
        <label class="f">Won<Stepper bind:value={row.actual} min={0} max={n} label={`${p.name} won`} /></label>
      </div>

      <div class="bounty">
        <button
          type="button"
          class="bounty-toggle"
          class:has={bountyOf[p.id] > 0}
          aria-expanded={!!open[p.id]}
          onclick={() => toggleTray(p.id)}
        >
          <span>🪙 Bounty</span>
          <span class="btot">{signed(bountyOf[p.id] ?? 0)}</span>
          <span class="chev" class:up={open[p.id]} aria-hidden="true">▾</span>
        </button>
        <CoinBurst token={tokens[p.id] ?? 0} big={bigHaul[p.id]} />

        {#if open[p.id]}
          <div class="tray">
            <div class="counters">
              <label class="cf">
                <span>🎴 14s <em>+{BONUS_VALUES.fourteen} ea</em></span>
                <Stepper bind:value={b.fourteens} min={0} max={BOUNTY_LIMITS.fourteens} label={`${p.name} fourteens`} />
              </label>
              <label class="cf">
                <span>⚔️ Pirates caught <em>+{BONUS_VALUES.pirate} ea</em></span>
                <Stepper bind:value={b.pirates} min={0} max={BOUNTY_LIMITS.pirates} label={`${p.name} pirates`} />
              </label>
            </div>
            <div class="chips">
              <button type="button" class="chip" class:on={b.jollyRoger} onclick={() => flip(b, 'jollyRoger')}>
                🏴‍☠️ Jolly Roger <span class="cv">+{BONUS_VALUES.jollyRoger}</span>
              </button>
              <button type="button" class="chip" class:on={b.mermaidCatchesSK} onclick={() => flip(b, 'mermaidCatchesSK')}>
                🧜‍♀️ Mermaid nabs Skull King <span class="cv">+{BONUS_VALUES.mermaidCatchesSK}</span>
              </button>
              <button type="button" class="chip" class:on={b.skOverMermaid} onclick={() => flip(b, 'skOverMermaid')}>
                👑 Skull King eats Mermaid <span class="cv">+{BONUS_VALUES.skOverMermaid}</span>
              </button>
            </div>
            <label class="manual">
              <span>🧰 Other (house rules)</span>
              <input type="number" step="10" bind:value={b.manual} aria-label={`${p.name} other bounty`} />
            </label>
          </div>
        {/if}
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
  .preview-wrap {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  .preview {
    font-weight: 800;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
  }
  .outcome {
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--muted);
    text-align: right;
  }
  .bounty {
    position: relative;
    margin-top: 12px;
  }
  .bounty-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 46px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .bounty-toggle.has {
    border-color: var(--primary);
  }
  .btot {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .bounty-toggle.has .btot {
    color: var(--text);
  }
  .chev {
    transition: transform var(--dur-base) var(--ease-standard);
    color: var(--muted);
  }
  .chev.up {
    transform: rotate(180deg);
  }
  .tray {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 10px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .counters {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .cf {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--text);
  }
  .cf em {
    color: var(--muted);
    font-style: normal;
    font-size: 0.74rem;
  }
  .chips {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
    text-align: left;
  }
  .chip .cv {
    margin-left: auto;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .chip.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .chip.on .cv {
    color: rgba(255, 255, 255, 0.85);
  }
  .manual {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .manual input {
    width: 110px;
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
