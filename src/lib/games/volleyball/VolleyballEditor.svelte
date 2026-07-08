<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import type { VolleyballInput } from './index';
  import { isDecidingSet, readConfig, setWinner, targetForSet, type Side } from './logic';

  let { input = $bindable(), ctx }: { input: VolleyballInput; ctx: RoundContext } = $props();

  const cfg = $derived(readConfig(ctx.config));
  const pa = $derived(ctx.players[0]);
  const pb = $derived(ctx.players[1]);

  // Sets won so far (the running match score) come from the totals-before-this-round.
  const setsA = $derived(Number(ctx.totals[pa?.id]) || 0);
  const setsB = $derived(Number(ctx.totals[pb?.id]) || 0);
  const setNumber = $derived(setsA + setsB + 1);
  const deciding = $derived(isDecidingSet(setsA, setsB, cfg.setsToWin));
  const target = $derived(targetForSet(cfg, setsA, setsB));

  const ptsA = $derived(Number(input.points[pa?.id]) || 0);
  const ptsB = $derived(Number(input.points[pb?.id]) || 0);
  const result = $derived(setWinner(ptsA, ptsB, target, cfg.winBy2, cfg.hardCap));

  function bump(id: string, delta: number) {
    input.points[id] = Math.max(0, (Number(input.points[id]) || 0) + delta);
  }
  function onType(id: string, value: string) {
    const n = Math.floor(Number(value));
    input.points[id] = Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** Would one more point here win the set — and would that win the match? */
  function pointKind(side: Side): 'match' | 'set' | null {
    if (result) return null;
    const na = side === 'a' ? ptsA + 1 : ptsA;
    const nb = side === 'b' ? ptsB + 1 : ptsB;
    if (setWinner(na, nb, target, cfg.winBy2, cfg.hardCap) !== side) return null;
    const setsAfter = (side === 'a' ? setsA : setsB) + 1;
    return setsAfter >= cfg.setsToWin ? 'match' : 'set';
  }

  const kindA = $derived(pointKind('a'));
  const kindB = $derived(pointKind('b'));
  const deuce = $derived(!result && cfg.winBy2 && ptsA >= target - 1 && ptsB >= target - 1);

  const sideList = $derived([
    { side: 'a' as Side, player: pa, sets: setsA, points: ptsA, won: result === 'a', kind: kindA },
    { side: 'b' as Side, player: pb, sets: setsB, points: ptsB, won: result === 'b', kind: kindB },
  ]);

  const status = $derived.by(() => {
    if (result) {
      const w = result === 'a' ? pa : pb;
      const hi = Math.max(ptsA, ptsB);
      const lo = Math.min(ptsA, ptsB);
      return { emoji: '✅', text: `${w?.name ?? 'Winner'} takes the set ${hi}–${lo}`, tone: 'good' };
    }
    if (kindA || kindB) {
      const side = kindA ? pa : pb;
      const kind = kindA ?? kindB;
      return {
        emoji: kind === 'match' ? '🏆' : '🎯',
        text: `${kind === 'match' ? 'Match point' : 'Set point'} — ${side?.name ?? ''}`,
        tone: 'warn',
      };
    }
    if (deuce) return { emoji: '🔁', text: 'Deuce — must win by two', tone: 'muted' };
    return {
      emoji: '🏐',
      text: `Rally to ${target}${cfg.winBy2 ? ', win by two' : ''}`,
      tone: 'muted',
    };
  });
</script>

<div class="stack">
  <div class="row spread meta">
    <span class="pill">🏐 Set {setNumber} · to {target}</span>
    {#if deciding}
      <span class="pill decider">⭐ Deciding set</span>
    {:else}
      <span class="pill">Best of {cfg.setsToWin * 2 - 1}</span>
    {/if}
  </div>

  <p
    class="status"
    class:good={status.tone === 'good'}
    class:warn={status.tone === 'warn'}
    aria-live="polite"
  >
    <span aria-hidden="true">{status.emoji}</span>
    <span>{status.text}</span>
  </p>

  <div class="sides">
    {#each sideList as s (s.player?.id)}
      <div class="side" class:won={s.won}>
        <div class="shead">
          <span class="who">
            <Avatar name={s.player?.name ?? '?'} color={s.player?.color ?? '#7c5cff'} />
            <strong class="nm">{s.player?.name ?? '—'}</strong>
          </span>
          <span class="pips" role="img" aria-label={`${s.sets} of ${cfg.setsToWin} sets won`}>
            {#each Array(cfg.setsToWin) as _, i (i)}
              <span class="pip" class:on={i < s.sets}></span>
            {/each}
          </span>
        </div>

        <label class="scorewrap">
          <span class="sr-only">{s.player?.name} points this set</span>
          <input
            class="score"
            class:score-good={s.won}
            type="number"
            inputmode="numeric"
            min="0"
            value={s.points}
            oninput={(e) => onType(s.player?.id, e.currentTarget.value)}
          />
        </label>

        <div class="ctrls">
          <button
            type="button"
            class="minus"
            onclick={() => bump(s.player?.id, -1)}
            disabled={s.points <= 0}
            aria-label={`Take a point back from ${s.player?.name}`}
          >
            −1
          </button>
          <button
            type="button"
            class="plus"
            class:pt={!!s.kind}
            onclick={() => bump(s.player?.id, 1)}
            aria-label={`Add a point for ${s.player?.name}`}
          >
            <span class="big">+1</span>
            {#if s.kind}<span class="ptlabel">{s.kind === 'match' ? 'match pt' : 'set pt'}</span>{/if}
          </button>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .meta {
    align-items: center;
  }
  .pill.decider {
    color: var(--text);
    border-color: color-mix(in srgb, var(--text) 22%, var(--border));
  }

  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 0;
    padding: 10px 12px;
    text-align: center;
    font-weight: 700;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .status.good {
    color: var(--good);
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
    background: color-mix(in srgb, var(--good) 12%, var(--surface-2));
  }
  .status.warn {
    color: var(--warn);
    border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
    background: color-mix(in srgb, var(--warn) 12%, var(--surface-2));
  }

  .sides {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .side.won {
    border-color: color-mix(in srgb, var(--good) 55%, var(--border));
  }

  .shead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 30px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pips {
    display: inline-flex;
    gap: 4px;
    flex: none;
  }
  .pip {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 1.5px solid var(--muted);
    box-sizing: border-box;
  }
  .pip.on {
    background: var(--text);
    border-color: var(--text);
  }

  .scorewrap {
    display: block;
    margin: 0;
  }
  .score {
    width: 100%;
    height: 84px;
    padding: 0 8px;
    text-align: center;
    font-size: 3rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    appearance: textfield;
    -moz-appearance: textfield;
  }
  .score::-webkit-outer-spin-button,
  .score::-webkit-inner-spin-button {
    -webkit-appearance: none;
    appearance: none;
    margin: 0;
  }

  .ctrls {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }
  .minus,
  .plus {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    transition:
      transform 0.05s ease,
      background 0.15s ease,
      border-color 0.15s ease;
  }
  .minus {
    flex: none;
    width: 56px;
    min-height: 56px;
    font-size: 1.2rem;
  }
  .minus:hover {
    background: var(--surface-2);
  }
  .minus:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* The +1 is the courtside hero: large, thumb-friendly. It stays a neutral
     raised control so the screen keeps a single Royal Violet primary (Save). */
  .plus {
    flex: 1;
    min-height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    background: var(--surface-3);
  }
  .plus:hover {
    border-color: var(--primary);
  }
  .plus:active {
    transform: translateY(1px);
  }
  .plus .big {
    font-size: 1.35rem;
  }
  .plus.pt {
    border-color: color-mix(in srgb, var(--warn) 55%, var(--border));
  }
  .ptlabel {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--warn);
  }

  .minus:focus-visible,
  .plus:focus-visible,
  .score:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }

  @media (max-width: 360px) {
    .score {
      font-size: 2.5rem;
    }
  }
</style>
