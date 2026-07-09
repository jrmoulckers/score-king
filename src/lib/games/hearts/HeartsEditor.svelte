<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { shooter, type HeartsInput } from './logic';

  let { input = $bindable(), ctx }: { input: HeartsInput; ctx: RoundContext } = $props();

  const variantJack = $derived(!!ctx.config.variantJack);
  const total = $derived(
    Object.values(input.hearts).reduce((a, b) => a + (Number(b) || 0), 0),
  );
  const moon = $derived(shooter(input));
  const moonName = $derived(ctx.players.find((p) => p.id === moon)?.name ?? '');

  function setQueen(id: string) {
    input.queen = input.queen === id ? null : id;
  }
  function setJack(id: string) {
    input.jack = input.jack === id ? null : id;
  }
  // One tap records a shot moon: give this player all 13 hearts + the ♠Q and clear
  // everyone else. Tapping the same player again undoes it.
  function setMoon(id: string) {
    if (moon === id) {
      input.hearts[id] = 0;
      input.queen = null;
      return;
    }
    for (const p of ctx.players) input.hearts[p.id] = p.id === id ? 13 : 0;
    input.queen = id;
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="muted">Tap to assign the ♠Q{variantJack ? ' and ♦J' : ''} · lower is better.</span>
    <span class="pill" class:score-bad={total !== 13}>♥ {total}/13</span>
  </div>

  {#if moon}
    <div class="moonbanner">🌙 {moonName} is shooting the moon — everyone else takes the points.</div>
  {/if}

  {#each ctx.players as p (p.id)}
    <div class="prow" class:ismoon={moon === p.id}>
      <div class="row spread" style="margin-bottom: 8px">
        <span class="row" style="gap: 8px">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        <Stepper bind:value={input.hearts[p.id]} min={0} max={13} />
      </div>
      <div class="row" style="gap: 8px">
        <button type="button" class="toggle" class:on={input.queen === p.id} onclick={() => setQueen(p.id)}>
          ♠Q <span class="sub">(13)</span>
        </button>
        {#if variantJack}
          <button type="button" class="toggle jack" class:on={input.jack === p.id} onclick={() => setJack(p.id)}>
            ♦J <span class="sub">(−10)</span>
          </button>
        {/if}
        <button
          type="button"
          class="toggle moon"
          class:on={moon === p.id}
          aria-pressed={moon === p.id}
          title="Record {p.name} shooting the moon"
          onclick={() => setMoon(p.id)}
        >
          🌙 <span class="sub">moon</span>
        </button>
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
  .prow.ismoon {
    border-color: var(--primary-strong);
  }
  .moonbanner {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    font-weight: 700;
  }
  .toggle {
    flex: 1;
    padding: 9px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
  }
  .toggle .sub {
    color: var(--muted);
    font-weight: 500;
  }
  .toggle.on {
    background: var(--primary);
    border-color: var(--primary-strong);
    color: #fff;
  }
  .toggle.on .sub {
    color: rgba(255, 255, 255, 0.8);
  }
  /* ♦J is a −10 *bonus* card, so its selected state reads as a good thing (semantic
     green) — never Crown Gold, which the design reserves for the leader/winner. */
  .toggle.jack.on {
    background: var(--good);
    border-color: color-mix(in srgb, var(--good) 55%, #000);
    color: #06251a;
  }
  .toggle.jack.on .sub {
    color: rgba(0, 0, 0, 0.55);
  }
  .toggle.moon {
    flex: 0 0 auto;
  }
</style>
