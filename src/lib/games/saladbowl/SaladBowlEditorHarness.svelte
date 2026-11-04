<script lang="ts">
  import type { RoundContext } from '../../types';
  import SaladBowlEditor from './SaladBowlEditor.svelte';
  import type { SaladBowlInput } from './logic';

  const { ctx, initial }: { ctx: RoundContext; initial: SaladBowlInput } = $props();
  // svelte-ignore state_referenced_locally
  let input = $state(initial);
</script>

<SaladBowlEditor bind:input {ctx} />
<output data-draft>{JSON.stringify(input)}</output>
