<script lang="ts">
  import type { RoundContext } from '../types';
  import HeartsEditor from '../games/hearts/HeartsEditor.svelte';
  import type { HeartsInput } from '../games/hearts/logic';
  import CodenamesEditor from '../games/codenames/CodenamesEditor.svelte';
  import type { CodenamesInput } from '../games/codenames/logic';

  const {
    ctx,
    heartsInput,
    codenamesInput,
  }: { ctx: RoundContext; heartsInput?: HeartsInput; codenamesInput?: CodenamesInput } = $props();

  // svelte-ignore state_referenced_locally
  let hand = $state(heartsInput);
  // svelte-ignore state_referenced_locally
  let match = $state(codenamesInput);
</script>

{#if hand}
  <HeartsEditor bind:input={hand} {ctx} />
{:else if match}
  <CodenamesEditor bind:input={match} {ctx} />
{/if}
<output data-draft>{JSON.stringify(hand ?? match)}</output>
