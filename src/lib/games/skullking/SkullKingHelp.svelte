<script lang="ts">
  import GameHelpDialog from '../../components/GameHelpDialog.svelte';
  import SkullKingExample from './SkullKingExample.svelte';
  import { skullking } from './index';
  import { BONUS_VALUES, readConfig } from './logic';

  const {
    config,
    round,
    onclose,
  }: {
    config: Record<string, unknown>;
    round: number;
    onclose: () => void;
  } = $props();
  const rules = $derived(readConfig(config));
  let topic = $state('reference');
  const topics = [
    { id: 'reference', label: 'Scoring' },
    { id: 'zero', label: 'Zero bids' },
    { id: 'bonuses', label: 'Bonuses' },
    { id: 'guide', label: 'Scoring guide' },
  ];
</script>

<GameHelpDialog
  title={skullking.name}
  emoji={skullking.emoji}
  {topics}
  {topic}
  ontopicchange={(value) => (topic = value)}
  {onclose}
>
  {#snippet children(selectTopic)}
    <div class="layout" class:single={topic === 'bonuses' || topic === 'guide'}>
      {#if topic === 'reference'}
        <section aria-labelledby="sk-scoring-title">
          <h3 id="sk-scoring-title">Quick reference</h3>
          <p class="intro">Bid how many tricks you expect to win.</p>
          <dl>
            <div>
              <dt>Match your bid (1+)</dt>
              <dd><strong>+20</strong> per trick bid</dd>
            </div>
            <div>
              <dt>Miss your bid (1+)</dt>
              <dd><strong>−10</strong> per trick off</dd>
            </div>
            <div>
              <dt>Bid zero</dt>
              <dd><strong>±10 × round</strong></dd>
            </div>
          </dl>
        </section>
      {:else if topic === 'zero'}
        <section aria-labelledby="sk-zero-title">
          <h3 id="sk-zero-title">Zero bids</h3>
          <p>Win no tricks: <strong>+10 × the round number</strong>.</p>
          <p>
            Win any tricks: <strong>−10 × the round number</strong>, regardless of how many you won.
          </p>
          <p>Set the example bid to 0, then mark a trick to compare.</p>
        </section>
      {:else if topic === 'bonuses'}
        <section aria-labelledby="sk-bonus-title">
          <h3 id="sk-bonus-title">Bonus points</h3>
          <p class="bonus-setting">
            {rules.bonusesRequireBid
              ? 'Bonuses count only when you meet your bid.'
              : 'Bonuses count even when your bid is missed.'}
          </p>
          <table>
            <caption>Values used by Score King. Bonuses can vary by edition.</caption>
            <thead><tr><th scope="col">Capture</th><th scope="col">Points</th></tr></thead>
            <tbody>
              <tr
                ><td>Each colored 14 (yellow, green, purple)</td><td>+{BONUS_VALUES.fourteen}</td
                ></tr
              >
              <tr><td>Black 14 · Jolly Roger</td><td>+{BONUS_VALUES.jollyRoger}</td></tr>
              <tr><td>Skull King captures a Pirate</td><td>+{BONUS_VALUES.pirate}</td></tr>
              <tr
                ><td>Mermaid captures the Skull King</td><td>+{BONUS_VALUES.mermaidCatchesSK}</td
                ></tr
              >
              <tr><td>Skull King over Mermaid</td><td>+{BONUS_VALUES.skOverMermaid}</td></tr>
            </tbody>
          </table>
          <p>Use Bounty in round entry to record captures. The Other field covers house rules.</p>
        </section>
      {:else if topic === 'guide'}
        <section aria-labelledby="sk-guide-title">
          <h3 id="sk-guide-title">Recording a round</h3>
          <p>This guide covers scoring in Score King, not the full rules for playing Skull King.</p>
          <ol>
            <li>
              <strong>Enter each player’s bid.</strong>
              <p>A bid is the number of tricks they expect to win.</p>
            </li>
            <li>
              <strong>Record how many tricks they won.</strong>
              <p>
                Match a bid of 1 or more for 20 points per trick bid. Otherwise, lose 10 points per
                trick over or under. Zero bids use 10 times the round number instead.
              </p>
              <button class="text-button" type="button" onclick={() => selectTopic('reference')}
                >Try the scoring example →</button
              >
            </li>
            <li>
              <strong>Add captured bounties.</strong>
              <p>
                The bounty builder adds the capture values for you. {rules.bonusesRequireBid
                  ? 'They count only when the bid is met.'
                  : 'They count even when the bid is missed.'}
              </p>
              <button class="text-button" type="button" onclick={() => selectTopic('bonuses')}
                >See bonus values →</button
              >
            </li>
          </ol>
          <p>This game is set to {rules.rounds} {rules.rounds === 1 ? 'round' : 'rounds'}.</p>
        </section>
      {/if}
      {#if topic === 'reference' || topic === 'zero'}
        <SkullKingExample initialRound={round} maxRounds={rules.rounds} />
      {/if}
    </div>
  {/snippet}
</GameHelpDialog>

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.5fr);
    gap: 56px;
  }
  .layout.single {
    display: block;
  }
  h3 {
    font-size: 1.25rem;
    line-height: 1.3;
    margin: 0;
  }
  p {
    font-size: 0.9rem;
    line-height: 1.6;
    margin: 14px 0;
    max-width: 65ch;
  }
  .intro {
    margin: 12px 0 24px;
    color: var(--muted);
  }
  dl {
    margin: 0;
  }
  dl > div {
    padding: 16px 0;
  }
  dt {
    color: var(--muted);
    font-size: 0.9rem;
  }
  dd {
    margin: 6px 0 0;
    font-size: 0.9rem;
  }
  dd strong {
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
    margin-right: 4px;
  }
  table {
    width: 100%;
    max-width: 640px;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  caption {
    text-align: left;
    font-size: 0.8rem;
    color: var(--muted);
    margin: 0 0 8px;
  }
  th,
  td {
    padding: 14px 8px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--muted);
    font-weight: 500;
  }
  td:last-child {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  ol {
    max-width: 640px;
    padding-left: 24px;
  }
  li {
    padding: 12px 0;
  }
  li p {
    margin: 6px 0 0;
    color: var(--muted);
  }
  .text-button {
    display: inline-flex;
    align-items: center;
    min-height: 46px;
    padding: 4px 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .text-button:hover {
    text-decoration: underline;
  }
  .text-button:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
  }
  @media (max-width: 760px) {
    .layout {
      grid-template-columns: 1fr;
      gap: 24px;
    }
    .intro {
      margin: 8px 0 14px;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    dl > div {
      padding: 10px 0 0;
    }
    dt,
    dd {
      font-size: 0.8rem;
    }
    dd strong {
      display: block;
      font-size: 1rem;
    }
  }
  @media (max-width: 440px) {
    .layout {
      gap: 18px;
    }
    h3 {
      font-size: 1rem;
    }
    dl {
      display: block;
    }
    dl > div {
      display: grid;
      grid-template-columns: 1fr 1.1fr;
      align-items: baseline;
      gap: 12px;
      padding: 8px 0;
    }
    dd {
      margin: 0;
    }
    dd strong {
      display: inline;
    }
  }
</style>
