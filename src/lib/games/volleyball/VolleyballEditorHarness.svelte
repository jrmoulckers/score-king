<script lang="ts">
  import type { RoundContext } from '../../types';
  import type { VolleyballInput } from './logic';
  import VolleyballEditor from './VolleyballEditor.svelte';

  const { ctx, initial }: { ctx: RoundContext; initial: VolleyballInput } = $props();
  // svelte-ignore state_referenced_locally
  let input = $state(initial);
</script>

<VolleyballEditor bind:input {ctx} />
<output data-draft>{JSON.stringify(input)}</output>
