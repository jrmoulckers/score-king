<script lang="ts">
  import { onMount } from 'svelte';
  import { games } from '../lib/stores/games';
  import { players, activePlayers } from '../lib/stores/players';
  import { settings } from '../lib/stores/settings';
  import { setLeadMember } from '../lib/stores/identity';
  import { getModule } from '../lib/games/registry';
  import { link } from '../lib/router';
  import * as db from '../lib/storage/db';
  import Avatar from '../lib/components/Avatar.svelte';
  import type { Player, Round } from '../lib/types';
  import {
    computeStats,
    assignPersona,
    computeBadges,
    newlyEarned,
    dailyCrown,
    nudges,
    dayKey,
    fmtPct,
    fmtAvg,
  } from '../lib/stats';

  let rounds = $state<Round[]>([]);
  let loaded = $state(false);
  const today = dayKey(Date.now());

  onMount(async () => {
    rounds = await db.getAllRounds();
    loaded = true;
  });

  const meId = $derived($settings.leadMemberId);
  const playerById = $derived(new Map<string, Player>($players.map((p) => [p.id, p])));
  const nameOf = (id: string): string => playerById.get(id)?.name ?? 'Someone';

  const result = $derived(
    loaded
      ? computeStats(
          { players: $players, games: $games, rounds },
          meId ? { playerId: meId } : {},
          { gameStats: (type) => getModule(type)?.stats },
        )
      : undefined,
  );

  const me = $derived(meId && result ? result.perPlayer[meId] : undefined);
  const persona = $derived(me ? assignPersona(me) : undefined);
  const records = $derived(result?.records ?? []);
  const badges = $derived(me ? computeBadges(me, { records }) : []);

  // "New since last visit" — a tiny device-local diff, never backed up. On the
  // very first visit there's no baseline, so nothing is flagged (we just seed it).
  const seenKey = $derived(`sk_seen_badges_${meId}`);
  const hadSeen = $derived(!!meId && localStorage.getItem(seenKey) !== null);
  const seenBadges = $derived(loadSet(seenKey));
  const freshBadges = $derived(me && hadSeen ? newlyEarned(badges, seenBadges) : []);
  const freshKeys = $derived(new Set(freshBadges.map((b) => b.key)));

  const crownMem = $derived(loadCrown(meId));
  const hero = $derived(
    me
      ? dailyCrown({
          meId: meId as string,
          me,
          persona,
          newBadges: freshBadges,
          records,
          leaderboard: result?.leaderboard,
          nameOf,
          roast: $settings.roastMode,
          lastKey: crownMem.day !== today ? crownMem.key : undefined,
        })
      : undefined,
  );

  const sideNudges = $derived(
    me
      ? nudges(
          {
            meId: meId as string,
            me,
            persona,
            newBadges: freshBadges,
            records,
            leaderboard: result?.leaderboard,
            nameOf,
            roast: $settings.roastMode,
          },
          hero?.key,
          3,
        )
      : [],
  );

  const board = $derived((result?.leaderboard ?? []).slice(0, 5));
  const recent = $derived(
    [...$games]
      .filter((g) => g.status !== 'active')
      .sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt))
      .slice(0, 5),
  );

  // Persist "seen" badges and today's crown pick so tomorrow can vary.
  $effect(() => {
    if (!meId || !me) return;
    localStorage.setItem(seenKey, JSON.stringify(badges.map((b) => b.key)));
  });
  $effect(() => {
    if (!meId || !hero || crownMem.day === today) return;
    localStorage.setItem(`sk_crown_${meId}`, JSON.stringify({ day: today, key: hero.key }));
  });

  function loadSet(key: string): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) || '[]') as string[]);
    } catch {
      return new Set();
    }
  }
  function loadCrown(id: string | null): { day?: string; key?: string } {
    if (!id) return {};
    try {
      return JSON.parse(localStorage.getItem(`sk_crown_${id}`) || '{}');
    } catch {
      return {};
    }
  }

  const chooserPlayers = $derived([...$activePlayers].sort((a, b) => a.name.localeCompare(b.name)));
  const recordLosses = $derived(me ? me.played - me.wins : 0);
  const winnerNames = (ids: string[] | undefined) => (ids ?? []).map(nameOf).join(' & ');
</script>

<h1>Stats</h1>

{#if !loaded}
  <div class="empty">Loading your stats…</div>
{:else if !meId}
  <!-- Personal-first: without a "you" anchor the whole screen is a lens with no focus. -->
  <div class="card stack">
    <div class="section-title" style="margin: 0">Who are you?</div>
    <p class="muted" style="margin: 0">
      Pick your player to unlock your Daily Crown, persona, records and rivalries. This lives only on
      this device.
    </p>
    {#if chooserPlayers.length === 0}
      <div class="empty">Add a player first, then come back to claim your crown.</div>
    {:else}
      <div class="stack" style="gap: 8px">
        {#each chooserPlayers as p (p.id)}
          <button class="picker row" onclick={() => setLeadMember(p.id)}>
            <Avatar name={p.name} color={p.color} size={32} />
            <span class="grow" style="text-align: left">{p.name}</span>
            <span aria-hidden="true">👑</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <!-- 1 ─ Daily Crown hero -->
  {#if hero}
    <section class="hero" class:gold={hero.gold} aria-label="Today's headline">
      <span class="hero-emoji" aria-hidden="true">{hero.emoji}</span>
      <p class="hero-text">{hero.text}</p>
      <div class="row wrap hero-stats">
        <span class="pill"><b class="tnum">{me?.wins}</b>–<b class="tnum">{recordLosses}</b> record</span>
        <span class="pill"><b class="tnum">{fmtPct(me?.winRate ?? 0)}</b> win rate</span>
        {#if me?.avgFinish !== undefined}
          <span class="pill">avg <b class="tnum">{fmtAvg(me.avgFinish)}</b></span>
        {/if}
        {#if (me?.currentStreak ?? 0) > 0}
          <span class="pill">🔥 <b class="tnum">{me?.currentStreak}</b> streak</span>
        {/if}
      </div>
      <div class="row spread hero-foot">
        <span class="muted sm">as {nameOf(meId)}</span>
        <button class="linkbtn" onclick={() => setLeadMember(null)}>Not you?</button>
      </div>
    </section>
  {/if}

  <!-- Gateway to the Wrapped story -->
  <a class="wrapped-cta row spread" href="/wrapped" use:link>
    <span class="row" style="gap: 12px">
      <span class="wrapped-emoji" aria-hidden="true">🎁</span>
      <span>
        <div><strong>Your Wrapped</strong></div>
        <div class="muted sm">A swipeable year in review</div>
      </span>
    </span>
    <span aria-hidden="true">→</span>
  </a>

  <!-- 2 ─ Persona + badges -->
  {#if persona}
    <div class="section-title">Your style</div>
    <div class="card stack">
      <div class="row" style="gap: 12px">
        <span class="persona-emoji" aria-hidden="true">{persona.emoji}</span>
        <div class="grow">
          <div><strong>{persona.name}</strong></div>
          <div class="muted sm">{persona.voice}</div>
        </div>
      </div>
      {#if badges.length > 0}
        <div class="row wrap" style="gap: 6px">
          {#each badges as b (b.key)}
            <span class="badge" data-rarity={b.rarity} title={b.desc}>
              <span aria-hidden="true">{b.emoji}</span>
              {b.name}
              {#if freshKeys.has(b.key)}<span class="new">NEW</span>{/if}
            </span>
          {/each}
        </div>
      {:else}
        <p class="muted sm" style="margin: 0">Win a game to start earning badges.</p>
      {/if}
    </div>
  {/if}

  <!-- 3 ─ Records + brief leaderboard -->
  {#if records.length > 0}
    <div class="section-title">Record book</div>
    <div class="card stack">
      {#each records as r (r.key)}
        <div class="row spread">
          <span class="row" style="gap: 8px">
            <span aria-hidden="true">{r.emoji}</span>{r.label}
          </span>
          <span class="row" style="gap: 8px">
            <b class="tnum">{r.value}</b>
            {#if r.holderId}
              {@const h = playerById.get(r.holderId)}
              {#if h}<Avatar name={h.name} color={h.color} size={20} />{/if}
              {#if r.holderId === meId}<span class="you">You</span>{/if}
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  {#if board.length > 0}
    <div class="row spread" style="margin: 18px 4px 8px">
      <span class="section-title" style="margin: 0">Standings</span>
      <a class="linkbtn" href="/court" use:link>Full Court 👑 →</a>
    </div>
    <div class="card stack">
      {#each board as row, i (row.playerId)}
        {@const p = playerById.get(row.playerId)}
        <div class="row spread" class:me={row.playerId === meId}>
          <span class="row" style="gap: 8px">
            <span class="rank tnum" class:lead={i === 0}>{i + 1}</span>
            {#if p}<Avatar name={p.name} color={p.color} size={22} />{/if}
            <span>{p?.name ?? '—'}</span>
            {#if row.playerId === meId}<span class="you">You</span>{/if}
          </span>
          <span class="row" style="gap: 10px">
            <span class="sm muted"><b class="tnum">{fmtPct(row.winRate)}</b></span>
            <b class="tnum" class:lead={i === 0}>{row.wins}W</b>
          </span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- 4 ─ Recent activity + nudges -->
  {#if sideNudges.length > 0}
    <div class="section-title">On your radar</div>
    <div class="card stack">
      {#each sideNudges as n (n.key)}
        <div class="row" style="gap: 10px">
          <span aria-hidden="true">{n.emoji}</span>
          <span class="grow">{n.text}</span>
          {#if n.tone === 'roast'}<span class="pill sm">roast</span>{/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if recent.length > 0}
    <div class="section-title">Recent games</div>
    <div class="stack">
      {#each recent as g (g.id)}
        {@const m = getModule(g.type)}
        <a class="card row spread tile" href={`/play/${g.id}`} use:link>
          <span class="row" style="gap: 10px">
            <span style="font-size: 1.3rem" aria-hidden="true">{m?.emoji ?? '🎲'}</span>
            <span>
              <div><strong>{m?.name ?? g.type}</strong></div>
              <div class="muted sm">
                {#if g.status === 'abandoned'}🪦 abandoned{:else}👑 {winnerNames(g.winnerIds) || '—'}{/if}
              </div>
            </span>
          </span>
          <span class="muted sm">{new Date(g.finishedAt ?? g.createdAt).toLocaleDateString()}</span>
        </a>
      {/each}
    </div>
  {:else}
    <div class="empty">Finish a game to start building your legend.</div>
  {/if}
{/if}

<style>
  .tnum {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .sm {
    font-size: 0.82rem;
  }

  /* Hero — depth from the surface ramp, one accent, no shadow stacking. */
  .hero {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 16px 12px;
    margin-bottom: 6px;
  }
  .hero.gold {
    border-color: var(--accent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 12%, var(--surface-2)), var(--surface-2));
  }
  .hero-emoji {
    font-size: 2rem;
    line-height: 1;
  }
  .hero-text {
    margin: 8px 0 12px;
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.25;
  }
  .hero.gold .hero-text {
    color: var(--accent-ink);
  }
  .hero-stats {
    gap: 6px;
  }
  .hero-foot {
    margin-top: 12px;
  }

  .linkbtn {
    background: none;
    border: none;
    color: var(--muted);
    text-decoration: underline;
    cursor: pointer;
    padding: 8px 4px;
    min-height: 44px;
    font: inherit;
  }

  .persona-emoji {
    font-size: 1.9rem;
    line-height: 1;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    font-size: 0.82rem;
    font-weight: 600;
  }
  .badge[data-rarity='rare'] {
    border-color: color-mix(in srgb, var(--text) 35%, var(--border));
  }
  .badge[data-rarity='epic'],
  .badge[data-rarity='legendary'] {
    border-color: color-mix(in srgb, var(--text) 55%, var(--border));
    background: var(--surface-3);
  }
  .badge .new {
    font-size: 0.62rem;
    letter-spacing: 0.06em;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 999px;
    background: var(--surface-3);
    border: 1px solid var(--border);
  }

  .rank {
    display: inline-block;
    min-width: 1.4em;
    text-align: center;
    color: var(--muted);
  }
  .you {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface-2);
  }
  .row.me {
    margin: 0 -8px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }

  .pill.sm {
    font-size: 0.7rem;
    padding: 1px 7px;
  }

  .tile {
    text-decoration: none;
    color: inherit;
    min-height: 46px;
  }

  .picker {
    gap: 10px;
    width: 100%;
    min-height: 46px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    font: inherit;
  }
  .picker:hover {
    background: var(--surface-3);
  }

  .wrapped-cta {
    margin-top: 10px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: inherit;
    text-decoration: none;
    min-height: 46px;
  }
  .wrapped-cta:hover {
    background: var(--surface-3);
  }
  .wrapped-emoji {
    font-size: 1.6rem;
    line-height: 1;
  }
</style>
