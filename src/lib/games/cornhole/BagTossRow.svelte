<script lang="ts">
  import { animateMotion } from '../../motion';
  import { haptic } from '../../haptics';
  import {
    BAGS_PER_SIDE,
    type BagState,
    type SideThrow,
    cycleBag,
    slotsFromThrow,
    throwFromSlots,
  } from './logic';

  /**
   * One side's four-bag toss row — the tactile heart of Cornhole entry. Each of the
   * four bags is a fixed slot you tap to climb Ground → On the board (×1) → In the
   * hole (×3) → back to Ground, so a whole frame is entered by feel in four taps
   * without summoning the keyboard. The bags stay put in their slots (never re-sort)
   * so "tap this bag through its states" always hits the same bag.
   *
   * State is co-signalled three ways — a landing icon, a word ("Drano" / "Woody" /
   * "Grass"), and the point value — so nothing depends on color. Motion is a small
   * one-frame pop on the tapped bag, skipped under reduced motion.
   */
  let {
    bag = $bindable(),
    label,
  }: { bag: SideThrow; label: string } = $props();

  // A fixed, positionally-stable row of four bags. Seeded from the counts and
  // re-synced only when the counts change from the outside (a new round, or an
  // edited round loading) — never when our own taps write them back.
  let slots = $state<BagState[]>(slotsFromThrow(bag, BAGS_PER_SIDE));
  let chips = $state<(HTMLButtonElement | undefined)[]>([]);

  $effect(() => {
    const wantHole = Math.max(0, Math.trunc(Number(bag.inHole) || 0));
    const wantBoard = Math.max(0, Math.trunc(Number(bag.onBoard) || 0));
    const have = throwFromSlots(slots);
    if (have.inHole !== wantHole || have.onBoard !== wantBoard) {
      slots = slotsFromThrow(bag, BAGS_PER_SIDE);
    }
  });

  const META: Record<BagState, { icon: string; word: string; pts: string; hint: string }> = {
    hole: { icon: '🕳️', word: 'Drano', pts: '+3', hint: 'in the hole' },
    board: { icon: '🫘', word: 'Woody', pts: '+1', hint: 'on the board' },
    ground: { icon: '🌱', word: 'Grass', pts: '0', hint: 'on the ground' },
  };

  function tap(i: number) {
    const next = [...slots];
    next[i] = cycleBag(next[i]!);
    slots = next;
    const t = throwFromSlots(next);
    bag.inHole = t.inHole;
    bag.onBoard = t.onBoard;
    haptic('tick');
    const el = chips[i];
    if (el) {
      animateMotion(
        el,
        next[i] === 'hole'
          ? { scale: [1, 1.28, 1], rotate: [0, -6, 0] }
          : { scale: [1, 1.16, 1] },
        { duration: 0.2, ease: 'easeOut' },
      );
    }
  }
</script>

<div class="toss" role="group" aria-label={`${label} — tap each bag to place it`}>
  {#each slots as s, i (i)}
    {@const m = META[s]}
    <button
      type="button"
      class="bag {s}"
      bind:this={chips[i]}
      onclick={() => tap(i)}
      aria-label={`${label} bag ${i + 1}: ${m.hint}, ${m.pts} points. Tap to move it.`}
    >
      <span class="ico" aria-hidden="true">{m.icon}</span>
      <span class="word">{m.word}</span>
      <span class="pts">{m.pts}</span>
    </button>
  {/each}
</div>

<style>
  .toss {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  /* Each bag climbs the surface ramp as it climbs in value — depth carries the
     "better landing" read, backed up by the icon, word, and points (never color). */
  .bag {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 66px;
    padding: 8px 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    transition: background var(--dur-base) var(--ease-standard), border-color var(--dur-base) var(--ease-standard);
  }
  .bag:active {
    transform: translateY(1px);
  }
  .bag:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 1px;
  }
  .bag.ground {
    background: var(--surface);
    border-style: dashed;
    color: var(--muted);
  }
  .bag.board {
    background: var(--surface-2);
  }
  .bag.hole {
    background: var(--surface-3);
    border-color: color-mix(in srgb, var(--good) 45%, var(--border));
  }
  .ico {
    font-size: 1.4rem;
    line-height: 1;
  }
  .word {
    font-size: 0.72rem;
    font-weight: 700;
  }
  .pts {
    font-size: 0.72rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .bag.hole .pts {
    color: var(--good);
  }
</style>
