<script lang="ts">
  import type { ID, RoundContext } from '../../types';
  import Avatar from '../../components/Avatar.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import {
    isFinalRound,
    roleBreakdown,
    suggestedMinutes,
    type Team,
    type TwoRoomsInput,
  } from './logic';
  import { tworooms } from './index';

  let { input = $bindable(), ctx }: { input: TwoRoomsInput; ctx: RoundContext } = $props();

  const isFinal = $derived(isFinalRound(ctx.roundIndex, ctx.config));
  const minutes = $derived(suggestedMinutes(ctx.roundIndex, ctx.config));
  const roles = $derived(roleBreakdown(ctx.players.length));
  const maxHostages = $derived(Math.max(1, ctx.players.length));
  const winner = $derived(input.reveal.winner);

  let showRoles = $state(false);
  let showRules = $state(false);

  const rooms: (1 | 2)[] = [1, 2];

  function setLeader(room: 1 | 2, id: ID) {
    if (room === 1) input.leader1 = input.leader1 === id ? null : id;
    else input.leader2 = input.leader2 === id ? null : id;
  }

  function setWinner(team: Team) {
    input.reveal.winner = team;
  }

  function toggleWinnerMember(id: ID) {
    const has = input.reveal.winners.includes(id);
    input.reveal.winners = has
      ? input.reveal.winners.filter((x) => x !== id)
      : [...input.reveal.winners, id];
  }

  function setPresident(id: ID) {
    input.reveal.president = input.reveal.president === id ? null : id;
  }
  function setBomber(id: ID) {
    input.reveal.bomber = input.reveal.bomber === id ? null : id;
  }
</script>

<div class="stack">
  <div class="row spread">
    <span class="pill">⏱ <span class="tnum">{minutes}</span> min{isFinal ? ' · final round' : ''}</span>
    <span class="row" style="gap: 8px">
      <button type="button" class="btn small ghost" aria-pressed={showRoles} onclick={() => (showRoles = !showRoles)}>
        🎭 Roles
      </button>
      <button type="button" class="btn small ghost" aria-pressed={showRules} onclick={() => (showRules = !showRules)}>
        Rules
      </button>
    </span>
  </div>

  {#if showRoles}
    <div class="ref">
      <div class="row spread">
        <strong>Deal for {roles.players} players</strong>
        <span class="muted small">Blue {roles.blueTotal} · Red {roles.redTotal}</span>
      </div>
      <ul class="reflist">
        <li>🏛️ President <span class="tnum">×{roles.president}</span> <span class="muted">(Blue)</span></li>
        <li>💣 Bomber <span class="tnum">×{roles.bomber}</span> <span class="muted">(Red)</span></li>
        <li>🔵 Blue Team card <span class="tnum">×{roles.blueTeam}</span></li>
        <li>🔴 Red Team card <span class="tnum">×{roles.redTeam}</span></li>
        {#if roles.gambler}
          <li>🃏 Gambler <span class="tnum">×{roles.gambler}</span> <span class="muted">(odd table)</span></li>
        {/if}
      </ul>
      {#if ctx.config.advancedRoles}
        <div class="muted small">Advanced game: swap in colored roles for some Blue/Red cards as you like.</div>
      {/if}
    </div>
  {/if}

  {#if showRules}
    <pre class="rules">{tworooms.help}</pre>
  {/if}

  {#each rooms as room (room)}
    <div class="room">
      <div class="row spread">
        <strong>Room {room}</strong>
        <span class="pill">➡️ sends <span class="tnum">{room === 1 ? input.sent1 : input.sent2}</span></span>
      </div>

      <div class="fieldlabel">Leader <span class="muted">(optional)</span></div>
      <div class="chips">
        {#each ctx.players as p (p.id)}
          {@const on = (room === 1 ? input.leader1 : input.leader2) === p.id}
          <button type="button" class="chip" class:on aria-pressed={on} onclick={() => setLeader(room, p.id)}>
            <Avatar name={p.name} color={p.color} size={22} />
            <span>{p.name}</span>
            {#if on}<span class="tag">📢 Leader</span>{/if}
          </button>
        {/each}
      </div>

      <div class="row spread hostrow">
        <span>Hostages sent to Room {room === 1 ? 2 : 1}</span>
        {#if room === 1}
          <Stepper bind:value={input.sent1} min={0} max={maxHostages} />
        {:else}
          <Stepper bind:value={input.sent2} min={0} max={maxHostages} />
        {/if}
      </div>
    </div>
  {/each}

  {#if isFinal}
    <div class="reveal">
      <div class="revhead">🎭 The Reveal</div>
      <p class="muted revlede">Everyone flips their card. Did the Bomber end up in the President’s room?</p>

      <div class="picks">
        <button type="button" class="pick" class:on={winner === 'red'} aria-pressed={winner === 'red'} onclick={() => setWinner('red')}>
          <span class="pickmain">💥 Same room</span>
          <span class="picksub">🔴 Red Team wins</span>
        </button>
        <button type="button" class="pick" class:on={winner === 'blue'} aria-pressed={winner === 'blue'} onclick={() => setWinner('blue')}>
          <span class="pickmain">🕊️ Kept apart</span>
          <span class="picksub">🔵 Blue Team wins</span>
        </button>
      </div>

      {#if winner}
        <div class="fieldlabel winlabel">
          Tap everyone on the winning {winner === 'red' ? '🔴 Red Team' : '🔵 Blue Team'}
          <span class="muted">· {input.reveal.winners.length} of ~{winner === 'red' ? roles.redTotal : roles.blueTotal}</span>
        </div>
        <div class="chips">
          {#each ctx.players as p (p.id)}
            {@const on = input.reveal.winners.includes(p.id)}
            <button type="button" class="chip win" class:on aria-pressed={on} onclick={() => toggleWinnerMember(p.id)}>
              <Avatar name={p.name} color={p.color} size={22} />
              <span>{p.name}</span>
              {#if on}<span class="tag">🏆</span>{/if}
            </button>
          {/each}
        </div>

        <details class="who">
          <summary>Note the President &amp; Bomber <span class="muted">(optional)</span></summary>
          <div class="fieldlabel">🏛️ President</div>
          <div class="chips">
            {#each ctx.players as p (p.id)}
              {@const on = input.reveal.president === p.id}
              <button type="button" class="chip" class:on aria-pressed={on} onclick={() => setPresident(p.id)}>
                <Avatar name={p.name} color={p.color} size={22} /><span>{p.name}</span>
              </button>
            {/each}
          </div>
          <div class="fieldlabel">💣 Bomber</div>
          <div class="chips">
            {#each ctx.players as p (p.id)}
              {@const on = input.reveal.bomber === p.id}
              <button type="button" class="chip" class:on aria-pressed={on} onclick={() => setBomber(p.id)}>
                <Avatar name={p.name} color={p.color} size={22} /><span>{p.name}</span>
              </button>
            {/each}
          </div>
        </details>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tnum {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .small {
    font-size: 0.8rem;
  }
  .room,
  .ref,
  .reveal {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .fieldlabel {
    margin: 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 6px 12px 6px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    font-weight: 600;
  }
  .chip.on {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 18%, var(--surface));
  }
  .chip .tag {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--muted);
  }
  .hostrow {
    gap: 10px;
  }
  .reflist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .reflist li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rules {
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
  .revhead {
    font-weight: 800;
    font-size: 1.05rem;
  }
  .revlede {
    margin: 0;
  }
  .picks {
    display: flex;
    gap: 10px;
  }
  .pick {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-height: 60px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    text-align: center;
  }
  .pick .pickmain {
    font-weight: 700;
  }
  .pick .picksub {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .pick.on {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 16%, var(--surface));
  }
  .pick.on .picksub {
    color: var(--text);
  }
  .winlabel {
    margin-top: 2px;
  }
  .who {
    margin-top: 2px;
  }
  .who summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 0.9rem;
    min-height: 32px;
    display: flex;
    align-items: center;
  }
  .who .fieldlabel {
    margin-top: 8px;
  }
</style>
