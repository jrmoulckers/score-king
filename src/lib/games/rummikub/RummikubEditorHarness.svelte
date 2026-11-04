<script lang="ts">
  import type { RoundContext } from '../../types';
  import type { RummikubInput } from './logic';
  import RummikubEditor from './RummikubEditor.svelte';

  const { ctx, initial }: { ctx: RoundContext; initial: RummikubInput } = $props();
  // svelte-ignore state_referenced_locally
  let input = $state<RummikubInput>(structuredClone(initial));
</script>

<RummikubEditor bind:input {ctx} />
<output data-draft>{JSON.stringify(input)}</output>
