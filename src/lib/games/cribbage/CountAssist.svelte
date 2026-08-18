<script lang="ts">
  import { haptic } from '../../haptics';
  import {
    RANKS,
    SUITS,
    breakdownTotal,
    cardLabel,
    cardName,
    cardKey,
    isHeels,
    rankLabel,
    sameCard,
    scoreCards,
    suitGlyph,
    type Breakdown,
    type Card,
  } from './logic';

  /**
   * The tiebreaker. Cribbage's oldest argument is "that's only ten" — so this is
   * an optional drawer that counts a hand *properly*: tap the cut, tap the four
   * cards, and the rules engine ({@link scoreCards}) spells out every fifteen,
   * pair, run, flush and nob it finds. Take the count and it fills the row above.
   *
   * Deliberately opt-in and collapsed by default: the fast path at the table is
   * still tapping your own count into the steppers. This is here for the hand
   * nobody can agree on, and for anyone still learning to count.
   *
   * No Royal Violet primary here — the shell's Save is the one primary action on
   * the screen — and no colour-only signalling: every card carries its rank, its
   * suit glyph and a spoken name, and the breakdown is written out in words.
   */
  const {
    /** Whose count this is, for labels ("Ada's hand"). */
    label,
    /** The crib scores flushes differently, so it counts differently. */
    isCrib = false,
    /** Hand it back to the caller, which writes it into the counted row. */
    onuse,
    /** Told when the cut turns a jack, so the editor can offer his heels. */
    onheels,
  }: {
    label: string;
    isCrib?: boolean;
    onuse: (b: Breakdown) => void;
    onheels?: (heels: boolean) => void;
  } = $props();

  let starter = $state<Card | null>(null);
  let picked = $state<Card[]>([]);

  const used = $derived(new Set([...(starter ? [starter] : []), ...picked].map((c) => cardKey(c))));
  const complete = $derived(picked.length === 4 && starter != null);
  const result = $derived<Breakdown>(
    complete
      ? scoreCards(picked, starter, isCrib)
      : { fifteens: 0, pairs: 0, runs: 0, flush: 0, nob: 0 },
  );
  const total = $derived(complete ? breakdownTotal(result) : 0);

  /** Written-out count, so nothing depends on reading a colour or a chart. */
  const lines = $derived(
    complete
      ? [
          result.fifteens
            ? `${result.fifteens} fifteen${result.fifteens === 1 ? '' : 's'} — ${result.fifteens * 2}`
            : null,
          result.pairs
            ? `${result.pairs} pair${result.pairs === 1 ? '' : 's'} — ${result.pairs * 2}`
            : null,
          result.runs ? `runs — ${result.runs}` : null,
          result.flush ? `flush — ${result.flush}` : null,
          result.nob ? 'one for his nob — 1' : null,
        ].filter((s): s is string => s != null)
      : [],
  );

  function tap(card: Card) {
    if (used.has(cardKey(card))) {
      if (starter && sameCard(starter, card)) {
        starter = null;
        onheels?.(false);
      } else {
        picked = picked.filter((c) => !sameCard(c, card));
      }
      haptic('undo');
      return;
    }
    if (!starter) {
      starter = card;
      if (isHeels(card)) onheels?.(true);
    } else if (picked.length < 4) {
      picked = [...picked, card];
    } else {
      return;
    }
    haptic('tick');
  }

  function clear() {
    starter = null;
    picked = [];
    haptic('undo');
  }

  function use() {
    if (!complete) return;
    onuse({ ...result });
    haptic('save');
  }

  const nextSlot = $derived(!starter ? 'the cut' : picked.length < 4 ? 'a card' : null);
</script>

<div class="assist">
  <p class="lede">
    Counting <strong>{label}</strong>{isCrib ? ' — crib rules: a flush needs all five.' : '.'}
    {#if nextSlot}Tap {nextSlot}.{/if}
  </p>

  <div class="slots">
    <div class="slot cut" class:filled={!!starter}>
      <span class="cap">Cut</span>
      {#if starter}
        <button type="button" class="chip" onclick={() => tap(starter as Card)}>
          <span aria-hidden="true">{cardLabel(starter)}</span>
          <span class="sr-only">Remove {cardName(starter)} from the cut</span>
        </button>
      {:else}
        <span class="empty" aria-hidden="true">—</span>
      {/if}
    </div>
    <div class="slot hand">
      <span class="cap">{isCrib ? 'Crib' : 'Hand'}</span>
      <div class="chips">
        {#each picked as card (cardKey(card))}
          <button type="button" class="chip" onclick={() => tap(card)}>
            <span aria-hidden="true">{cardLabel(card)}</span>
            <span class="sr-only">Remove {cardName(card)}</span>
          </button>
        {/each}
        {#each Array(Math.max(0, 4 - picked.length)) as _, i (i)}
          <span class="empty" aria-hidden="true">—</span>
        {/each}
      </div>
    </div>
  </div>

  <div class="deck" role="group" aria-label="Pick a card">
    {#each RANKS as rank (rank)}
      <span class="rank-head" aria-hidden="true">{rankLabel(rank)}</span>
      {#each SUITS as suit (suit)}
        {@const card = { rank, suit }}
        {@const taken = used.has(cardKey(card))}
        <button
          type="button"
          class="card"
          class:taken
          data-suit={suit}
          aria-pressed={taken}
          onclick={() => tap(card)}
        >
          <span aria-hidden="true">{suitGlyph(suit)}</span>
          <span class="sr-only">{cardName(card)}</span>
        </button>
      {/each}
    {/each}
  </div>

  <div class="outcome" role="status">
    {#if complete}
      <p class="total"><strong>{total}</strong> points</p>
      <p class="lines">{lines.length ? lines.join(' · ') : 'nothing at all — a "nineteen".'}</p>
    {:else}
      <p class="lines">Pick a cut and four cards to count them.</p>
    {/if}
  </div>

  <div class="acts row">
    <button
      type="button"
      class="btn small ghost"
      onclick={clear}
      disabled={!starter && !picked.length}
    >
      Clear
    </button>
    <button type="button" class="btn small take" onclick={use} disabled={!complete}>
      Take this count ({total})
    </button>
  </div>
</div>

<style>
  .assist {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
  }
  .lede {
    margin: 0;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .lede strong {
    color: var(--text);
  }
  .slots {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .slot {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .slot.hand {
    flex: 1;
  }
  .cap {
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .chip {
    min-height: 46px;
    min-width: 46px;
    padding: 0 10px;
    border-radius: var(--radius-chip);
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .empty {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    min-width: 46px;
    border-radius: var(--radius-chip);
    border: 1px dashed var(--border);
    color: var(--muted);
  }
  .deck {
    display: grid;
    grid-template-columns: 2rem repeat(4, 1fr);
    gap: 4px;
    align-items: center;
    max-height: 240px;
    overflow-y: auto;
    padding: 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  .rank-head {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .card {
    min-height: 46px;
    border-radius: var(--radius-chip);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition: background var(--dur-base) var(--ease-standard);
  }
  .card[data-suit='H'],
  .card[data-suit='D'] {
    color: var(--bad);
  }
  .card:hover:not(.taken) {
    background: var(--surface-3);
  }
  /* Taken cards keep their glyph and gain a dashed, dimmed frame — the state is
     never colour alone, and the button stays a live "remove" target. */
  .card.taken {
    border-style: dashed;
    opacity: 0.45;
  }
  .card:focus-visible,
  .chip:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .outcome {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .total {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .total strong {
    font-size: 1.25rem;
    font-weight: 800;
  }
  .lines {
    margin: 0;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .acts {
    gap: 8px;
    justify-content: flex-end;
  }
  /* A quiet, confident confirm — deliberately not Royal Violet, which the shell's
     Save button owns as the single primary action on this screen. */
  .take {
    font-weight: 700;
    background: var(--surface-3);
    border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
  }
</style>
