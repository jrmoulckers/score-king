<script lang="ts">
  import type { RoundContext } from '../../types';
  import type { GolfInput } from './logic';
  import GolfEditor from './GolfEditor.svelte';

  const { ctx, initial }: { ctx: RoundContext; initial: GolfInput } = $props();
  // svelte-ignore state_referenced_locally
  let input = $state(initial);
</script>

<GolfEditor bind:input {ctx} />
<output data-draft>{JSON.stringify(input)}</output>
