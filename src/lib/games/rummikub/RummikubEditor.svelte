<script lang="ts">
  import type { RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import { haptic } from '../../haptics';
  import { handPenalty, potTotal, type RummikubInput } from './logic';
  import { rummikub } from './index';
  import TileRack from './TileRack.svelte';
  import Pot from './Pot.svelte';
  import TileBurst from './TileBurst.svelte';
  import JokerSting from './JokerSting.svelte';
  import TileKeypad from './TileKeypad.svelte';

  let { input = $bindable(), ctx }: { input: RummikubInput; ctx: RoundContext } = $props();

  const jokerValue = $derived(Math.max(0, Number(ctx.config.jokerValue) || 30));
  const fixedRounds = $derived(
    ctx.config.endMode === 'target' ? null : Number(ctx.config.rounds) || 4,
  );
  const target = $derived(ctx.config.endMode === 'target' ? Number(ctx.config.target) || 100 : null);

  /** The pot: the sum of every non-winner's leftovers — what the player who goes out scoops. */
  const pot = $derived(potTotal(input, ctx.players.map((p) => p.id), jokerValue));
  const winnerName = $derived(ctx.players.find((p) => p.id === input.winner)?.name ?? null);

  let showHelp = $state(false);

  // Delight tokens, bumped only by a real user tap (never on mount / edit-open), so a fresh
  // go-out flings tiles and a fresh stranded joker slams the dread stamp.
  let burstTokens = $state<Record<string, number>>({});
  let stingTokens = $state<Record<string, number>>({});

  function setWinner(id: string) {
    const turningOn = input.winner !== id;
    input.winner = turningOn ? id : null;
    if (turningOn) {
      // A fresh winner starts with an empty rack; clear any leftovers they'd entered.
      input.hands[id] = { tiles: 0, jokers: 0 };
      burstTokens = { ...burstTokens, [id]: (burstTokens[id] ?? 0) + 1 };
      haptic('save');
    }
  }

  function stingJoker(id: string) {
    if (jokerValue > 0) stingTokens = { ...stingTokens, [id]: (stingTokens[id] ?? 0) + 1 };
  }
</script>

<div class="stack">
  <TileRack round={ctx.roundIndex + 1} total={fixedRounds} {target} />

  <Pot total={pot} {winnerName} />

  <div class="row spread">
    <p class="muted hint">
      {input.winner
        ? '🎁 Now tap everyone else’s leftover tiles into the pot.'
        : '🏁 Tap whoever shouted “Rummikub!” — emptied their rack.'}
    </p>
    <button type="button" class="btn small ghost" onclick={() => (showHelp = !showHelp)}>
      How to score
    </button>
  </div>

  {#if showHelp}
    <pre class="help">{rummikub.help}</pre>
  {/if}

  {#each ctx.players as p (p.id)}
    {@const isWinner = input.winner === p.id}
    {@const penalty = handPenalty(input.hands[p.id], jokerValue)}
    <div class="prow" class:winner={isWinner}>
      <TileBurst token={burstTokens[p.id] ?? 0} />
      <JokerSting token={stingTokens[p.id] ?? 0} value={jokerValue} />

      <div class="row spread">
        <span class="row" style="gap: 8px">
          <Avatar name={p.name} color={p.color} />
          <strong>{p.name}</strong>
        </span>
        {#if isWinner}
          <span class="preview score-good">+{pot}</span>
        {:else}
          <span class="preview" class:score-bad={penalty > 0}>{penalty > 0 ? `−${penalty}` : '0'}</span>
        {/if}
      </div>

      <div class="controls">
        <button
          type="button"
          class="toggle"
          class:on={isWinner}
          aria-pressed={isWinner}
          onclick={() => setWinner(p.id)}
        >
          {isWinner ? '🏆 Rummikub!' : '🏁 Went out'}
        </button>

        {#if isWinner}
          <div class="emptyrack">🎉 Rack emptied — scoops the whole {pot}-point pot!</div>
        {:else}
          <TileKeypad
            bind:tiles={input.hands[p.id].tiles}
            bind:jokers={input.hands[p.id].jokers}
            {jokerValue}
            label={p.name}
            onjoker={() => stingJoker(p.id)}
          />
          <div class="fields">
            <label class="f">
              Tiles
              <Stepper bind:value={input.hands[p.id].tiles} min={0} label={`${p.name} tiles`} />
            </label>
            <label class="f">
              Jokers
              <Stepper bind:value={input.hands[p.id].jokers} min={0} max={2} label={`${p.name} jokers`} />
            </label>
          </div>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .prow {
    position: relative;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  /* Going out is the winning outcome — co-signal it with a calm good edge, never colour alone:
     the 🏆, the "Rummikub!" label, the "rack emptied" line and the +pot all say it too. */
  .prow.winner {
    border-color: color-mix(in srgb, var(--good) 50%, var(--border));
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .toggle {
    min-height: 46px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 700;
    transition: background var(--dur-base) var(--ease-standard), border-color var(--dur-base) var(--ease-standard);
  }
  /* The winner toggle uses the semantic good accent — NOT Royal Violet, which the shell
     reserves for the single Save action, nor Crown Gold, reserved for the leader/winner. */
  .toggle.on {
    background: color-mix(in srgb, var(--good) 20%, var(--surface));
    border-color: var(--good);
    color: var(--text);
  }
  .emptyrack {
    color: var(--good);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 2px 0;
  }
  .fields {
    display: flex;
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
  .preview {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    margin: 0;
    font-size: 0.9rem;
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
  @media (prefers-reduced-motion: reduce) {
    .toggle {
      transition: none;
    }
  }
</style>
