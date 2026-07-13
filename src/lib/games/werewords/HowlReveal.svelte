<script lang="ts">
  import { prefersReducedMotion } from '../../motion';

  /**
   * Werewords' signature payoff. When a round lands, this overlay dramatizes which side
   * took it — mirroring Avalon's `AssassinReveal` and BotC's `TownVerdict`, but tuned to
   * the village-vs-pack story:
   *
   *   • Village win → 🌅 dawn breaks over the town under a Win-Green glow and the cracked
   *     secret word rises in letter-spaced caps — the table's "we got it!" beat.
   *   • Werewolf win → 🌕 a full moon climbs, 🐺 the pack howls, and a cold violet/coral
   *     night washes in — the wolves ran out the clock.
   *   • A twist stamps an extra 🔀 "STOLEN!" ribbon, because a steal is the game's soul.
   *
   * Pure delight layered over a result already spelled out by the pressed toggle + the
   * banner text + the winning-side tally, so motion is never the only signal — and never
   * Crown Gold, which belongs to the leader/winner alone. `pointer-events: none`, replays
   * whenever `token` changes, and renders nothing at all under reduced motion (the banner
   * is the calm, instant alternative).
   */
  let {
    token = 0,
    team = 'village',
    twist = false,
    word = '',
  }: { token?: number; team?: 'village' | 'werewolf'; twist?: boolean; word?: string } =
    $props();

  const reduced = prefersReducedMotion();
  const SPARK_COUNT = 12;

  const cracked = $derived(word.trim().toUpperCase());

  // Deterministic pseudo-random seeded by token (mirrors AssassinReveal / PhaseSky).
  const sparks = $derived(
    Array.from({ length: SPARK_COUNT }, (_, i) => {
      const rand = (n: number) =>
        (((Math.sin((token + i) * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
      const day = ['✦', '✧', '⋆', '·', '✨'];
      const night = ['🌾', '✦', '·', '⋆', '🐾'];
      const glyphs = team === 'werewolf' ? night : day;
      return {
        left: 20 + rand(1) * 60,
        bottom: 24 + rand(2) * 40,
        delay: 0.3 + rand(3) * 0.22,
        duration: 0.7 + rand(4) * 0.6,
        spread: (rand(5) - 0.5) * 150,
        rise: 22 + rand(6) * 54,
        size: 0.5 + rand(7) * 0.7,
        glyph: glyphs[Math.floor(rand(8) * glyphs.length)],
      };
    }),
  );
</script>

{#if !reduced && token > 0}
  {#key token}
    <div class="howl" class:wolves={team === 'werewolf'} aria-hidden="true">
      <div class="wash"></div>
      <div class="stage">
        <span class="orb">{team === 'werewolf' ? '🌕' : '🌅'}</span>
        {#if team === 'werewolf'}
          <span class="wolf">🐺</span>
        {:else if cracked}
          <span class="word">{cracked}</span>
        {/if}
        {#if twist}
          <span class="stolen">🔀 STOLEN!</span>
        {/if}
      </div>
      <div class="sparks">
        {#each sparks as s, i (i)}
          <span
            class="spark"
            style="
              left: {s.left}%;
              bottom: {s.bottom}%;
              font-size: {s.size}rem;
              animation-delay: {s.delay}s;
              animation-duration: {s.duration}s;
              --spread: {s.spread}px;
              --rise: {s.rise}px;
            ">{s.glyph}</span>
        {/each}
      </div>
    </div>
  {/key}
{/if}

<style>
  .howl {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    border-radius: 14px;
    z-index: 3;
  }
  .wash {
    position: absolute;
    inset: 0;
    opacity: 0;
    /* Village → a warm dawn/green break of day. Never Crown Gold. */
    background:
      radial-gradient(120% 90% at 50% 62%, color-mix(in srgb, var(--good) 32%, transparent), transparent 70%),
      linear-gradient(to top, color-mix(in srgb, var(--good) 14%, transparent), transparent 55%);
    animation: howl-wash 1.6s ease-out both;
  }
  .howl.wolves .wash {
    /* Wolves → a cold violet night with a coral bite of danger. */
    background:
      radial-gradient(120% 90% at 50% 26%, color-mix(in srgb, var(--bad) 30%, transparent), transparent 68%),
      linear-gradient(to bottom, color-mix(in srgb, var(--primary) 24%, transparent), transparent 62%);
    animation-duration: 1.8s;
  }
  .stage {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .orb {
    font-size: 2.4rem;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    filter: drop-shadow(0 0 12px color-mix(in srgb, var(--good) 55%, transparent));
    animation: orb-rise 1.6s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  }
  .howl.wolves .orb {
    filter: drop-shadow(0 0 14px color-mix(in srgb, var(--primary) 60%, transparent));
    animation: moon-climb 1.8s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  }
  .wolf {
    font-size: 1.7rem;
    line-height: 1;
    opacity: 0;
    will-change: transform, opacity;
    animation: wolf-howl 1.7s ease-out both;
    animation-delay: 0.24s;
  }
  .word {
    font-weight: 800;
    font-size: 1.35rem;
    letter-spacing: 0.22em;
    padding-left: 0.22em;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    text-shadow: 0 2px 10px color-mix(in srgb, var(--good) 40%, transparent);
    opacity: 0;
    white-space: nowrap;
    will-change: transform, opacity;
    animation: word-flash 1.6s cubic-bezier(0.22, 0.61, 0.36, 1) both;
    animation-delay: 0.18s;
  }
  .stolen {
    font-weight: 800;
    font-size: 0.95rem;
    letter-spacing: 0.06em;
    padding: 4px 12px;
    border-radius: 999px;
    color: #fff;
    background: var(--bad);
    box-shadow: 0 6px 18px color-mix(in srgb, var(--bad) 45%, transparent);
    opacity: 0;
    will-change: transform, opacity;
    animation: stolen-stamp 1.6s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: 0.5s;
  }
  .sparks {
    position: absolute;
    inset: 0;
  }
  .spark {
    position: absolute;
    line-height: 1;
    color: var(--text);
    opacity: 0;
    will-change: transform, opacity;
    animation-name: spark-fly;
    animation-timing-function: ease-out;
    animation-fill-mode: both;
  }

  @keyframes howl-wash {
    0% { opacity: 0; }
    30% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes orb-rise {
    0% { opacity: 0; transform: translateY(30px) scale(0.7); }
    35% { opacity: 1; transform: translateY(-8px) scale(1.06); }
    72% { opacity: 0.95; transform: translateY(-12px) scale(1); }
    100% { opacity: 0; transform: translateY(-16px) scale(1); }
  }
  @keyframes moon-climb {
    0% { opacity: 0; transform: translateY(34px) scale(0.6); }
    38% { opacity: 1; transform: translateY(-10px) scale(1.08); }
    75% { opacity: 0.9; transform: translateY(-16px) scale(1); }
    100% { opacity: 0; transform: translateY(-22px) scale(1); }
  }
  @keyframes wolf-howl {
    0% { opacity: 0; transform: translateY(8px) rotate(-6deg) scale(0.8); }
    30% { opacity: 1; transform: translateY(0) rotate(-14deg) scale(1.1); }
    60% { opacity: 1; transform: translateY(-2px) rotate(-14deg) scale(1.05); }
    100% { opacity: 0; transform: translateY(-4px) rotate(-8deg) scale(1); }
  }
  @keyframes word-flash {
    0% { opacity: 0; transform: translateY(14px) scale(0.9); letter-spacing: 0.02em; }
    36% { opacity: 1; transform: translateY(0) scale(1.05); letter-spacing: 0.22em; }
    72% { opacity: 1; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(-6px) scale(1); }
  }
  @keyframes stolen-stamp {
    0% { opacity: 0; transform: rotate(-8deg) scale(1.8); }
    26% { opacity: 1; transform: rotate(-8deg) scale(1); }
    78% { opacity: 1; transform: rotate(-8deg) scale(1); }
    100% { opacity: 0; transform: rotate(-8deg) scale(1.05); }
  }
  @keyframes spark-fly {
    0% { opacity: 0; transform: translate(0, 0) scale(0.5); }
    30% { opacity: 1; }
    100% { opacity: 0; transform: translate(var(--spread), calc(var(--rise) * -1)) scale(1); }
  }
</style>
