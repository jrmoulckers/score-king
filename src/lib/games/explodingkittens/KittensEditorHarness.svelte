<script lang="ts">
  import type { RoundContext } from '../../types';
  import ExplodingKittensEditor from './ExplodingKittensEditor.svelte';
  import ImplodingKittensEditor from '../implodingkittens/ImplodingKittensEditor.svelte';
  import type { EKInput } from './logic';

  const { ctx, initial }: { ctx: RoundContext; initial: EKInput } = $props();
  // svelte-ignore state_referenced_locally
  let input = $state(initial);
</script>

{#if ctx.game.type === 'implodingkittens'}
  <ImplodingKittensEditor bind:input {ctx} />
{:else}
  <ExplodingKittensEditor bind:input {ctx} />
{/if}
<output data-draft>{JSON.stringify(input)}</output>
